# Voice Speech-to-Text — Frontend Integration Guide

**Date:** 2026-10-18  
**Scope:** Frontend portal (`fhir4java-portal`) — integrating voice input into the `ChatInput` component  
**Backend spec:** `docs/superpowers/specs/2026-10-18-voice-stt-portal-chat-design.md`  
**Implementation plan:** `docs/superpowers/plans/2026-10-18-voice-stt-portal-chat-impl.md` (Tasks 6–12)

---

## Overview

The backend (completed on `feature/agentbuilder-core`) exposes two STT endpoints:

| Endpoint                           | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `GET /api/agentbuilder/config/stt` | Returns active provider and language           |
| `WS /ws/agentbuilder/stt`          | PCM audio → transcript relay (Azure path only) |

The frontend reads the config endpoint once at mount to decide which of two adapters to use:

| Environment   | Provider value | Adapter                                                                     |
| ------------- | -------------- | --------------------------------------------------------------------------- |
| Local dev     | `browser`      | `BrowserSttAdapter` — wraps `SpeechRecognition` / `webkitSpeechRecognition` |
| Azure staging | `realtime-api` | `RealtimeSttAdapter` — WebSocket + AudioWorklet to `/ws/agentbuilder/stt`   |

The mic button lives in `ChatInput`. When the user speaks, the transcript populates the input field. The user reviews it and submits via the existing send flow — nothing in the agent loop changes.

---

## 1. Config Endpoint

### Request

```http
GET /api/agentbuilder/config/stt
Authorization: Bearer <jwt>
```

### Response

```json
{
  "provider": "browser",
  "language": "zh-CN"
}
```

`provider` is either `"browser"` or `"realtime-api"`.  
`language` is a BCP-47 code (e.g. `"zh-CN"`, `"en-US"`) or `"auto"`.

---

## 2. WebSocket Protocol (realtime-api path only)

The browser opens a WebSocket to `/ws/agentbuilder/stt`. Authentication is handled by the session cookie / bearer token already in place for the portal.

### Browser → Server (binary frames)

Raw 16-bit PCM audio, mono, 16 kHz, in 20 ms chunks (320 samples = 640 bytes per frame).

### Server → Browser (text frames)

```json
{ "type": "transcript.delta", "delta": "你好" }
{ "type": "transcript.final", "text": "你好，这是测试。" }
```

`transcript.delta` events arrive as the user speaks (real-time partial results).  
`transcript.final` fires once Azure VAD detects end-of-utterance — this is the definitive transcript.

---

## 3. Files to Create

The plan (Tasks 6–12) specifies these seven files plus one modification:

```
fhir4java-portal/src/
  hooks/
    useSttConfig.ts          # Fetches and memoises provider config
    useSttConfig.test.ts
    useSpeechToText.ts       # Selects adapter; exposes { start, stop, transcript, isListening, error }
    useSpeechToText.test.ts
  stt/
    BrowserSttAdapter.ts     # Wraps Web Speech API
    BrowserSttAdapter.test.ts
    RealtimeSttAdapter.ts    # WebSocket client + AudioWorklet orchestrator
    RealtimeSttAdapter.test.ts
    pcm-processor.worklet.ts # AudioWorkletProcessor (audio thread)
    pcm-processor.worklet.test.ts
  components/
    VoiceInputButton.tsx     # Mic toggle button
    VoiceInputButton.test.tsx
    ChatInput.tsx            # Add VoiceInputButton to toolbar (one additive change)
    ChatInput.test.tsx       # Add one new test
```

Complete code for every file is in the implementation plan at `docs/superpowers/plans/2026-10-18-voice-stt-portal-chat-impl.md`, Tasks 6–12.

---

## 4. useSttConfig Hook

Fetches `GET /api/agentbuilder/config/stt` once per portal session and caches the result.

```typescript
import { useEffect, useState } from 'react';

export interface SttConfig {
  provider: 'browser' | 'realtime-api';
  language: string;
  loading: boolean;
}

const DEFAULT_CONFIG: SttConfig = {
  provider: 'browser',
  language: 'zh-CN',
  loading: false,
};
let cached: SttConfig | null = null;

export function useSttConfig(): SttConfig {
  const [config, setConfig] = useState<SttConfig>(
    cached ?? { provider: 'browser', language: 'zh-CN', loading: true },
  );

  useEffect(() => {
    if (cached) return;
    fetch('/api/agentbuilder/config/stt')
      .then((r) => r.json())
      .then((data: { provider: string; language: string }) => {
        const result: SttConfig = {
          provider:
            data.provider === 'realtime-api' ? 'realtime-api' : 'browser',
          language: data.language ?? 'zh-CN',
          loading: false,
        };
        cached = result;
        setConfig(result);
      })
      .catch(() => {
        cached = DEFAULT_CONFIG;
        setConfig(DEFAULT_CONFIG);
      });
  }, []);

  return config;
}
```

---

## 5. BrowserSttAdapter

Wraps `SpeechRecognition` / `webkitSpeechRecognition`. Works in Chrome, Edge, and Safari.

```typescript
export class BrowserSttAdapter {
  private readonly language: string;
  private recognition: any | null = null;

  constructor(language: string) {
    this.language = language;
  }

  isAvailable(): boolean {
    return (
      typeof (window as any).SpeechRecognition !== 'undefined' ||
      typeof (window as any).webkitSpeechRecognition !== 'undefined'
    );
  }

  start(
    onDelta: (text: string) => void,
    onFinal: (text: string) => void,
  ): void {
    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) return;

    this.recognition = new SpeechRecognitionImpl();
    this.recognition.lang = this.language;
    this.recognition.interimResults = true;
    this.recognition.continuous = false;

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        onFinal(transcript);
      } else {
        onDelta(transcript);
      }
    };

    this.recognition.start();
  }

  stop(): void {
    this.recognition?.stop();
    this.recognition = null;
  }
}
```

---

## 6. PCM AudioWorklet Processor

Runs in the browser's audio thread. Converts Float32 mic samples to Int16 PCM and posts 20 ms chunks to the main thread.

```typescript
// Exported helpers — used in unit tests
export function float32ToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? clamped * 32768 : clamped * 32767;
}

export function chunkAudio(
  input: Float32Array,
  chunkSamples: number,
): Int16Array[] {
  const chunks: Int16Array[] = [];
  for (
    let offset = 0;
    offset + chunkSamples <= input.length;
    offset += chunkSamples
  ) {
    const chunk = new Int16Array(chunkSamples);
    for (let i = 0; i < chunkSamples; i++) {
      chunk[i] = float32ToInt16(input[offset + i]);
    }
    chunks.push(chunk);
  }
  return chunks;
}

// AudioWorklet class — runs in the audio thread only
const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = SAMPLE_RATE * 0.02; // 320 samples = 20 ms

if (typeof AudioWorkletProcessor !== 'undefined') {
  class PcmProcessor extends AudioWorkletProcessor {
    private buffer: Float32Array = new Float32Array(0);

    process(inputs: Float32Array[][]): boolean {
      const input = inputs[0]?.[0];
      if (!input) return true;

      const combined = new Float32Array(this.buffer.length + input.length);
      combined.set(this.buffer);
      combined.set(input, this.buffer.length);
      this.buffer = combined;

      const chunks = chunkAudio(this.buffer, CHUNK_SAMPLES);
      chunks.forEach((chunk) =>
        this.port.postMessage(chunk.buffer, [chunk.buffer]),
      );

      const consumed = chunks.length * CHUNK_SAMPLES;
      this.buffer = this.buffer.slice(consumed);
      return true;
    }
  }

  registerProcessor('pcm-processor', PcmProcessor);
}
```

**Note:** This file must be loaded via `audioContext.audioWorklet.addModule(new URL('./pcm-processor.worklet.ts', import.meta.url))` at runtime. Vite handles the URL transformation automatically.

---

## 7. RealtimeSttAdapter

Opens the WebSocket, starts the AudioWorklet mic capture, and relays PCM frames upstream.

```typescript
const STT_WS_PATH = '/ws/agentbuilder/stt';
const SAMPLE_RATE = 16000;

export class RealtimeSttAdapter {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;

  start(
    onDelta: (text: string) => void,
    onFinal: (text: string) => void,
  ): void {
    this.ws = new WebSocket(STT_WS_PATH);

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type === 'transcript.delta') onDelta(msg.delta as string);
        else if (msg.type === 'transcript.final') onFinal(msg.text as string);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onopen = () => this.startMic();
    this.ws.onclose = () => this.cleanup();
  }

  stop(): void {
    this.cleanup();
    this.ws?.close();
    this.ws = null;
  }

  private async startMic(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
        },
      });
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      await this.audioContext.audioWorklet.addModule(
        new URL('./pcm-processor.worklet.ts', import.meta.url),
      );
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.workletNode = new AudioWorkletNode(
        this.audioContext,
        'pcm-processor',
      );

      this.workletNode.port.onmessage = (ev: MessageEvent) => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(ev.data as ArrayBuffer);
        }
      };

      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
    } catch (err) {
      console.error('[RealtimeSttAdapter] mic setup failed:', err);
    }
  }

  private cleanup(): void {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.workletNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.audioContext = null;
  }
}
```

---

## 8. useSpeechToText Hook

Selects the correct adapter based on config. Exposes a stable interface regardless of provider.

```typescript
import { useCallback, useRef, useState } from 'react';
import { BrowserSttAdapter } from '../stt/BrowserSttAdapter';
import { RealtimeSttAdapter } from '../stt/RealtimeSttAdapter';
import { useSttConfig } from './useSttConfig';

export interface SpeechToTextHandle {
  start: () => void;
  stop: () => void;
  transcript: string;
  isListening: boolean;
  error: string | null;
}

export function useSpeechToText(): SpeechToTextHandle {
  const config = useSttConfig();
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adapterRef = useRef<BrowserSttAdapter | RealtimeSttAdapter | null>(
    null,
  );

  const start = useCallback(() => {
    if (config.loading) return;
    setError(null);
    setTranscript('');

    if (config.provider === 'realtime-api') {
      const adapter = new RealtimeSttAdapter();
      adapterRef.current = adapter;
      setIsListening(true);
      adapter.start(
        (delta) => setTranscript((t) => t + delta),
        (final) => {
          setTranscript(final);
          setIsListening(false);
        },
      );
    } else {
      const adapter = new BrowserSttAdapter(config.language);
      if (!adapter.isAvailable()) {
        setError('mic-unavailable');
        return;
      }
      adapterRef.current = adapter;
      setIsListening(true);
      adapter.start(
        (delta) => setTranscript(delta),
        (final) => {
          setTranscript(final);
          setIsListening(false);
        },
      );
    }
  }, [config]);

  const stop = useCallback(() => {
    adapterRef.current?.stop();
    adapterRef.current = null;
    setIsListening(false);
  }, []);

  return { start, stop, transcript, isListening, error };
}
```

---

## 9. VoiceInputButton Component

```tsx
import { useEffect } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
}

export function VoiceInputButton({ onTranscript }: VoiceInputButtonProps) {
  const { start, stop, transcript, isListening, error } = useSpeechToText();

  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
    }
  }, [transcript, isListening, onTranscript]);

  const handleClick = () => (isListening ? stop() : start());
  const isUnavailable = error === 'mic-unavailable';

  return (
    <button
      type="button"
      aria-label="voice input"
      onClick={handleClick}
      disabled={isUnavailable}
      className={isListening ? 'stt-btn stt-btn--listening' : 'stt-btn'}
      title={isUnavailable ? 'Voice input requires Chrome or Edge' : undefined}
    >
      {isListening ? (
        <span className="stt-waveform" aria-hidden="true">
          ▶
        </span>
      ) : (
        <span className="stt-mic-icon" aria-hidden="true">
          🎤
        </span>
      )}
    </button>
  );
}
```

---

## 10. ChatInput Integration

Add `VoiceInputButton` to the existing `ChatInput` toolbar. This is one additive change — nothing else is modified.

```tsx
// 1. Import at the top of ChatInput.tsx
import { VoiceInputButton } from './VoiceInputButton';

// 2. Inside the ChatInput component body, add a handler:
const handleVoiceTranscript = (text: string) => {
  setInputValue((prev) => (prev ? prev + ' ' + text : text));
};

// 3. In the toolbar JSX, add the button (before or after the send button):
<VoiceInputButton onTranscript={handleVoiceTranscript} />;
```

`onTranscript` appends the transcript to whatever is already in the field (preserving any typed text). The final `transcript.final` value replaces the accumulated partial deltas — the hook already handles this internally.

---

## 11. Error States

| `error` value       | Cause                                                        | Recommended UX                                                     |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `"mic-unavailable"` | `SpeechRecognition` API not available (Firefox, old browser) | Disable button, show tooltip "Voice input requires Chrome or Edge" |
| _(none yet)_        | Mic permission denied (future: `"mic-permission-denied"`)    | Show inline error below input, button returns to idle              |
| _(none yet)_        | WebSocket connection failed (future: `"stt-unavailable"`)    | Show inline error, button returns to idle                          |

---

## 12. Browser Support

| Browser      | `browser` provider          | `realtime-api` provider               |
| ------------ | --------------------------- | ------------------------------------- |
| Chrome 33+   | ✅                          | ✅                                    |
| Edge 79+     | ✅                          | ✅                                    |
| Safari 14.1+ | ✅ (prefixed)               | ✅                                    |
| Firefox      | ❌ (no `SpeechRecognition`) | ✅ (WebSocket+AudioWorklet supported) |

On Firefox with `provider=browser`, `VoiceInputButton` renders as disabled automatically.

---

## 13. Testing

```bash
# Unit tests for all STT files
cd fhir4java-portal && npx vitest run src/hooks/useSttConfig.test.ts
cd fhir4java-portal && npx vitest run src/stt/BrowserSttAdapter.test.ts
cd fhir4java-portal && npx vitest run src/stt/pcm-processor.worklet.test.ts
cd fhir4java-portal && npx vitest run src/stt/RealtimeSttAdapter.test.ts
cd fhir4java-portal && npx vitest run src/hooks/useSpeechToText.test.ts
cd fhir4java-portal && npx vitest run src/components/VoiceInputButton.test.tsx

# All portal tests
cd fhir4java-portal && npx vitest run
```

---

## 14. Environment Variables

No new environment variables are needed in the **portal** (browser-side). The Azure API key and endpoint are backend-only.

Backend (already configured in `application-azure-openai.yml`):

| Env var                            | Required on Azure | Description                                         |
| ---------------------------------- | ----------------- | --------------------------------------------------- |
| `AZURE_OPENAI_API_KEY`             | ✅ (already set)  | Reused from existing Azure OpenAI config            |
| `AZURE_OPENAI_REALTIME_ENDPOINT`   | ✅                | `wss://<resource>.openai.azure.com/openai/realtime` |
| `AZURE_OPENAI_REALTIME_DEPLOYMENT` | Optional          | Defaults to `gpt-4o-realtime-preview`               |

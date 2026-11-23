import workletUrl from './pcm-processor.worklet.ts?worker&url';
import { SAMPLE_RATE } from './pcm';

export interface SttCallbacks {
  onDelta: (text: string) => void;
  onFinal: (text: string) => void;
  onConnected: () => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

const SETUP_TIMEOUT_MS = 20000;
const CONNECTION_TIMEOUT_MS = 10000;
const FINAL_WAIT_MS = 5000;
const SILENCE_FRAME_COUNT = 30;
const SILENCE_FRAME_BYTES = SAMPLE_RATE * 0.02 * 2;

export class RealtimeSttAdapter {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private silentDestination: MediaStreamAudioDestinationNode | null = null;
  private ended = false;
  private micStopped = false;
  private _stopped = false;
  private setupTimer: ReturnType<typeof setTimeout> | undefined;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private finalTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly getSocketUrl: () => Promise<string>,
    private readonly callbacks: SttCallbacks,
    private readonly waitForFinalTranscript = false,
  ) {}

  async start(): Promise<void> {
    if (this.ended) return;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Voice input requires HTTPS (or localhost) and microphone access.',
        );
      this.setupTimer = setTimeout(
        () =>
          this.fail(
            'Voice input timed out. Check microphone permission and the voice service connection.',
          ),
        SETUP_TIMEOUT_MS,
      );
      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.context = context;
      await context.resume();
      if (this.ended) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (this.ended) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      for (const track of stream.getTracks()) {
        track.onended = () =>
          this.fail(
            'Microphone capture ended. Tap the microphone to try again.',
          );
      }
      await context.audioWorklet.addModule(workletUrl);
      if (this.ended) return;
      const socketUrl = await this.getSocketUrl();
      if (this.ended) return;
      clearTimeout(this.setupTimer);
      const socket = new WebSocket(socketUrl);
      this.socket = socket;
      this.connectionTimer = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN)
          this.fail(
            'Voice transcription did not connect in time. Please try again.',
          );
      }, CONNECTION_TIMEOUT_MS);
      socket.onmessage = (event: MessageEvent) => {
        if (this.ended || typeof event.data !== 'string') return;
        let message: { type?: string; delta?: unknown; text?: unknown };
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!message || typeof message !== 'object') return;
        if (
          message.type === 'transcript.delta' &&
          typeof message.delta === 'string'
        )
          this.callbacks.onDelta(message.delta);
        if (
          message.type === 'transcript.final' &&
          typeof message.text === 'string'
        ) {
          this.callbacks.onFinal(message.text);
          if (!this.waitForFinalTranscript || this._stopped) {
            clearTimeout(this.finalTimer);
            this.finish();
          }
        }
        if (message.type === 'transcript.error' || message.type === 'error')
          this.fail(
            'The voice transcription service could not process the audio. Please try again.',
          );
      };
      socket.onerror = () =>
        this.fail(
          'Unable to connect to voice transcription. Check the server connection and session authentication.',
        );
      socket.onclose = () =>
        this.fail(
          'The voice transcription connection closed. Please try again.',
        );
      socket.onopen = async () => {
        if (this.ended || this.micStopped) return;
        clearTimeout(this.connectionTimer);
        this.callbacks.onConnected();
        try {
          if (context.state === 'suspended') await context.resume();
          if (this.ended || this.micStopped) return;
          this.source = context.createMediaStreamSource(stream);
          this.worklet = new AudioWorkletNode(context, 'pcm-processor');
          this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (
              this.ended ||
              this.micStopped ||
              socket.readyState !== WebSocket.OPEN
            )
              return;
            if (socket.bufferedAmount > 64000) {
              this.fail(
                'The connection is too slow for voice input. Please try again.',
              );
              return;
            }
            socket.send(event.data);
          };
          this.source.connect(this.worklet);
          this.silentDestination = context.createMediaStreamDestination();
          this.worklet.connect(this.silentDestination);
        } catch {
          this.fail('Unable to capture microphone audio. Please try again.');
        }
      };
    } catch (failure) {
      if (this.ended) return;
      const denied =
        failure instanceof DOMException && failure.name === 'NotAllowedError';
      this.fail(
        denied
          ? 'Microphone access is blocked. Allow microphone access in your browser to use voice input.'
          : failure instanceof Error
            ? failure.message
            : 'Unable to start voice input.',
      );
    }
  }

  private fail(message: string): void {
    if (this.ended) return;
    this.callbacks.onError(message);
    this.finish();
  }

  stop(waitForFinalTranscript = this.waitForFinalTranscript): void {
    if (this.ended) return;
    if (this.micStopped) {
      if (!waitForFinalTranscript) this.finish();
      return;
    }
    this._stopped = true;
    this.micStopped = true;
    clearTimeout(this.setupTimer);
    clearTimeout(this.connectionTimer);
    this.cleanupMic();
    if (waitForFinalTranscript && this.socket?.readyState === WebSocket.OPEN) {
      const silenceFrame = new ArrayBuffer(SILENCE_FRAME_BYTES);
      try {
        for (let index = 0; index < SILENCE_FRAME_COUNT; index += 1) {
          if (this.socket?.readyState !== WebSocket.OPEN) break;
          this.socket.send(silenceFrame);
        }
        if (this.socket?.readyState === WebSocket.OPEN)
          this.socket.send(JSON.stringify({ type: 'commit' }));
      } catch {
        this.finish();
        return;
      }
      this.finalTimer = setTimeout(() => this.finish(), FINAL_WAIT_MS);
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.micStopped = true;
    clearTimeout(this.setupTimer);
    clearTimeout(this.connectionTimer);
    clearTimeout(this.finalTimer);
    this.cleanupMic();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = null;
    this.callbacks.onEnd();
  }

  private cleanupMic(): void {
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.silentDestination?.disconnect();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.stream = null;
    this.source = null;
    this.worklet = null;
    this.silentDestination = null;
  }
}

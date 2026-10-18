import workletUrl from './pcm-processor.worklet.ts?worker&url';

export interface SttCallbacks {
  onDelta: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export class RealtimeSttAdapter {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly getSocketUrl: () => Promise<string>,
    private readonly callbacks: SttCallbacks,
  ) {}

  async start(): Promise<void> {
    if (this.stopped) return;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Voice input requires HTTPS (or localhost) and microphone access.',
        );
      this.timer = setTimeout(
        () =>
          this.fail(
            'Voice input timed out. Check microphone permission and the voice service connection.',
          ),
        20000,
      );
      const context = new AudioContext({ sampleRate: 16000 });
      this.context = context;
      await context.resume();
      if (this.stopped) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (this.stopped) {
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
      if (this.stopped) return;
      const socketUrl = await this.getSocketUrl();
      if (this.stopped) return;
      const socket = new WebSocket(socketUrl);
      this.socket = socket;
      socket.onmessage = (event: MessageEvent) => {
        if (this.stopped || typeof event.data !== 'string') return;
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
          this.stop();
        }
        if (message.type === 'error')
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
      socket.onopen = () => {
        if (this.stopped) return;
        try {
          clearTimeout(this.timer);
          this.source = context.createMediaStreamSource(stream);
          this.worklet = new AudioWorkletNode(context, 'pcm-processor');
          this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            if (this.stopped || socket.readyState !== WebSocket.OPEN) return;
            if (socket.bufferedAmount > 64000) {
              this.fail(
                'The connection is too slow for voice input. Please try again.',
              );
              return;
            }
            socket.send(event.data);
          };
          this.source.connect(this.worklet);
          this.worklet.connect(context.destination);
        } catch {
          this.fail('Unable to capture microphone audio. Please try again.');
        }
      };
    } catch (failure) {
      if (this.stopped) return;
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
    if (this.stopped) return;
    this.callbacks.onError(message);
    this.stop();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
    }
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (this.context) void this.context.close().catch(() => undefined);
    this.socket = null;
    this.context = null;
    this.stream = null;
    this.source = null;
    this.worklet = null;
    this.callbacks.onEnd();
  }
}

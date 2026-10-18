import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSttAdapter } from './RealtimeSttAdapter';

vi.mock('./pcm-processor.worklet.ts?worker&url', () => ({
  default: '/pcm-worklet.js',
}));

const track = { stop: vi.fn(), onended: null };
const source = { connect: vi.fn(), disconnect: vi.fn() };
const worklet = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  port: { onmessage: null as null | ((event: MessageEvent) => void) },
};
const context = {
  resume: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  audioWorklet: { addModule: vi.fn(async () => undefined) },
  createMediaStreamSource: vi.fn(() => source),
  destination: {},
};
let sockets: FakeSocket[];
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  bufferedAmount = 0;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
}
const callbacks = () => ({
  onDelta: vi.fn(),
  onFinal: vi.fn(),
  onError: vi.fn(),
  onEnd: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  sockets = [];
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })),
    },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      constructor() {
        return worklet;
      }
    },
  );
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => vi.unstubAllGlobals());

describe('realtime STT adapter', () => {
  it('relays PCM, delivers delta/final events, and releases all capture resources', async () => {
    const events = callbacks();
    const getSocketUrl = vi.fn(
      async () => 'wss://backend/ws/agentbuilder/stt?ticket=one-use-ticket',
    );
    const adapter = new RealtimeSttAdapter(getSocketUrl, events);
    await adapter.start();
    const socket = sockets[0];
    expect(getSocketUrl).toHaveBeenCalledOnce();
    expect(socket.url).toBe(
      'wss://backend/ws/agentbuilder/stt?ticket=one-use-ticket',
    );
    socket.onopen?.();
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith(
      '/pcm-worklet.js',
    );
    const frame = new ArrayBuffer(640);
    worklet.port.onmessage?.({ data: frame } as MessageEvent);
    expect(socket.send).toHaveBeenCalledWith(frame);
    socket.onmessage?.({
      data: '{"type":"transcript.delta","delta":"hello"}',
    } as MessageEvent);
    socket.onmessage?.({
      data: '{"type":"transcript.final","text":"Hello world"}',
    } as MessageEvent);
    expect(events.onDelta).toHaveBeenCalledWith('hello');
    expect(events.onFinal).toHaveBeenCalledWith('Hello world');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
    adapter.stop();
    expect(events.onEnd).toHaveBeenCalledOnce();
  });
  it('reports permission denial and closes the audio context', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError'),
    );
    const events = callbacks();
    await new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
    ).start();
    expect(events.onError).toHaveBeenCalledWith(
      expect.stringContaining('blocked'),
    );
    expect(context.close).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(0);
  });
  it('stops a microphone stream that resolves after the user cancels', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve;
        }),
    );
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      callbacks(),
    );
    const started = adapter.start();
    await vi.waitFor(() =>
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled(),
    );
    adapter.stop();
    resolveStream({ getTracks: () => [track] } as unknown as MediaStream);
    await started;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(0);
  });
  it('reports unexpected disconnects rather than remaining in listening state', async () => {
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
    );
    await adapter.start();
    sockets[0].onclose?.();
    expect(events.onError).toHaveBeenCalledWith(
      expect.stringContaining('closed'),
    );
    expect(events.onEnd).toHaveBeenCalledOnce();
  });
  it('does not open a socket if stopped while requesting the ticket', async () => {
    let resolveSocketUrl!: (url: string) => void;
    const getSocketUrl = vi.fn(
      () => new Promise<string>((resolve) => (resolveSocketUrl = resolve)),
    );
    const adapter = new RealtimeSttAdapter(getSocketUrl, callbacks());
    const started = adapter.start();
    await vi.waitFor(() => expect(getSocketUrl).toHaveBeenCalledOnce());
    adapter.stop();
    resolveSocketUrl('wss://backend/stt?ticket=unused');
    await started;
    expect(sockets).toHaveLength(0);
  });
});

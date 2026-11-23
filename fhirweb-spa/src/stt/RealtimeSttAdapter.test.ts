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
const silentDestination = { kind: 'silent' };
const silentDestinationNode = { disconnect: vi.fn(), ...silentDestination };
const context = {
  state: 'suspended',
  resume: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  audioWorklet: { addModule: vi.fn(async () => undefined) },
  createMediaStreamSource: vi.fn(() => source),
  createMediaStreamDestination: vi.fn(() => silentDestinationNode),
  destination: { kind: 'speaker' },
};
let requestedSampleRate: number | undefined;
let sockets: FakeSocket[];
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  readyState = FakeSocket.CONNECTING;
  bufferedAmount = 0;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }
}
const callbacks = () => ({
  onDelta: vi.fn(),
  onFinal: vi.fn(),
  onConnected: vi.fn(),
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
      constructor(options: AudioContextOptions) {
        requestedSampleRate = options.sampleRate;
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
    expect(requestedSampleRate).toBe(24000);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ sampleRate: 24000 }),
    });
    socket.open();
    expect(events.onConnected).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(worklet.connect).toHaveBeenCalledWith(silentDestinationNode),
    );
    expect(context.createMediaStreamDestination).toHaveBeenCalledOnce();
    expect(worklet.connect).not.toHaveBeenCalledWith(context.destination);
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith(
      '/pcm-worklet.js',
    );
    const frame = new ArrayBuffer(960);
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
    expect(silentDestinationNode.disconnect).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
    adapter.stop();
    expect(events.onEnd).toHaveBeenCalledOnce();
  });
  it('keeps the Azure socket open after mic stop until the final transcript arrives', async () => {
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
      true,
    );
    await adapter.start();
    const socket = sockets[0];
    socket.open();

    adapter.stop();

    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledTimes(31);
    for (const [frame] of socket.send.mock.calls.slice(0, 30)) {
      expect(frame).toBeInstanceOf(ArrayBuffer);
      expect(frame.byteLength).toBe(960);
      expect(new Uint8Array(frame).every((byte) => byte === 0)).toBe(true);
    }
    expect(socket.send).toHaveBeenLastCalledWith('{"type":"commit"}');
    expect(socket.close).not.toHaveBeenCalled();
    expect(events.onEnd).not.toHaveBeenCalled();
    socket.onmessage?.({
      data: '{"type":"transcript.final","text":"Final words."}',
    } as MessageEvent);

    expect(events.onFinal).toHaveBeenCalledWith('Final words.');
    expect(socket.close).toHaveBeenCalledOnce();
    expect(events.onEnd).toHaveBeenCalledOnce();
  });
  it('keeps the Azure socket open for intermediate finals while recording', async () => {
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
      true,
    );
    await adapter.start();
    const socket = sockets[0];
    socket.open();

    socket.onmessage?.({
      data: '{"type":"transcript.final","text":"First sentence."}',
    } as MessageEvent);
    socket.onmessage?.({
      data: '{"type":"transcript.final","text":"Second sentence."}',
    } as MessageEvent);

    expect(events.onFinal).toHaveBeenNthCalledWith(1, 'First sentence.');
    expect(events.onFinal).toHaveBeenNthCalledWith(2, 'Second sentence.');
    expect(socket.close).not.toHaveBeenCalled();
    expect(events.onEnd).not.toHaveBeenCalled();

    adapter.stop();
    expect(socket.send).toHaveBeenLastCalledWith('{"type":"commit"}');
    socket.onmessage?.({
      data: '{"type":"transcript.final","text":"Final sentence."}',
    } as MessageEvent);

    expect(events.onFinal).toHaveBeenLastCalledWith('Final sentence.');
    expect(socket.close).toHaveBeenCalledOnce();
  });
  it('closes the Azure socket after five seconds if no final transcript arrives', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
      true,
    );
    await adapter.start();
    const socket = sockets[0];
    socket.open();
    adapter.stop();

    await vi.advanceTimersByTimeAsync(4999);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(socket.close).toHaveBeenCalledOnce();
    expect(events.onEnd).toHaveBeenCalledOnce();
    expect(events.onError).not.toHaveBeenCalled();
  });
  it('closes immediately on stop when final transcript waiting is disabled', async () => {
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
    );
    await adapter.start();
    const socket = sockets[0];
    socket.open();

    adapter.stop();

    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.send).not.toHaveBeenCalled();
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
  it('waits up to ten seconds for the socket to open, then reports a timeout', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
    );
    await adapter.start();

    await vi.advanceTimersByTimeAsync(9999);
    expect(events.onError).not.toHaveBeenCalled();
    expect(sockets[0].close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(events.onError).toHaveBeenCalledWith(
      expect.stringContaining('did not connect in time'),
    );
    expect(sockets[0].close).toHaveBeenCalledOnce();
  });
  it('does not time out after socket open while waiting for the first transcript', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const adapter = new RealtimeSttAdapter(
      async () => 'wss://backend/stt',
      events,
    );
    await adapter.start();
    sockets[0].open();

    await vi.advanceTimersByTimeAsync(15000);

    expect(events.onError).not.toHaveBeenCalled();
    expect(events.onConnected).toHaveBeenCalledOnce();
    expect(sockets[0].close).not.toHaveBeenCalled();
    adapter.stop();
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

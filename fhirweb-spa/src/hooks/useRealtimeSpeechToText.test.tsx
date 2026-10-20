import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeSttAdapter, SttCallbacks } from '../stt/RealtimeSttAdapter';
import { useRealtimeSpeechToText } from './useRealtimeSpeechToText';

let events: SttCallbacks;
const start = vi.fn(async () => undefined);
const stop = vi.fn((waitForFinalTranscript = false) => {
  if (!waitForFinalTranscript) events.onEnd();
});
vi.mock('../stt/RealtimeSttAdapter', () => ({
  RealtimeSttAdapter: vi.fn(function (_url: string, callbacks: SttCallbacks) {
    events = callbacks;
    return { start, stop };
  }),
}));
vi.mock('../stt/config', () => ({
  getSttWebSocketUrl: vi.fn(
    async () => 'wss://backend/ws/agentbuilder/stt?ticket=test',
  ),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('realtime voice input hook', () => {
  it('preserves typed text, accumulates deltas, and replaces partials with the final text', () => {
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeSpeechToText(true, onText, 'tenant-1', 'test-token'),
    );
    act(() => result.current.start('Typed question'));
    expect(result.current.isListening).toBe(true);
    expect(result.current.isConnecting).toBe(true);
    expect(RealtimeSttAdapter).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Object),
      false,
    );
    act(() => events.onConnected());
    expect(result.current.isConnecting).toBe(false);
    act(() => {
      events.onDelta('hello');
      events.onDelta(' there');
    });
    expect(onText).toHaveBeenLastCalledWith('Typed question hello there');
    act(() => events.onFinal('Hello world.'));
    expect(onText).toHaveBeenLastCalledWith('Typed question Hello world.');
    act(() => {
      events.onDelta(' another thought');
    });
    expect(onText).toHaveBeenLastCalledWith(
      'Typed question Hello world. another thought',
    );
    act(() => {
      events.onFinal('Another thought.');
    });
    expect(onText).toHaveBeenLastCalledWith(
      'Typed question Hello world. Another thought.',
    );
    act(() => events.onEnd());
    expect(result.current.isListening).toBe(false);
  });
  it('does not start when disabled and releases recording when the modal closes', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useRealtimeSpeechToText(enabled, vi.fn(), 'tenant-1'),
      { initialProps: { enabled: false } },
    );
    act(() => result.current.start(''));
    expect(RealtimeSttAdapter).not.toHaveBeenCalled();
    rerender({ enabled: true });
    act(() => result.current.start(''));
    rerender({ enabled: false });
    expect(stop).toHaveBeenCalledOnce();
    expect(result.current.isListening).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });
  it('stops recording on pagehide and reports errors without submitting', () => {
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeSpeechToText(true, onText, 'tenant-1', 'test-token'),
    );
    act(() => result.current.start(''));
    act(() => events.onError('Connection failed'));
    expect(result.current.error).toBe('Connection failed');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(stop).toHaveBeenCalledOnce();
    expect(onText).not.toHaveBeenCalled();
  });
  it.each(['azure', 'azure-staging'])(
    'keeps %s sessions finalizing after the microphone stops',
    (mode) => {
      vi.stubEnv('MODE', mode);
      const onText = vi.fn();
      const { result } = renderHook(() =>
        useRealtimeSpeechToText(true, onText, 'tenant-1', 'test-token'),
      );
      act(() => result.current.start(''));

      expect(RealtimeSttAdapter).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Object),
        true,
      );
      act(() => result.current.stop());

      expect(stop).toHaveBeenCalledWith(true);
      expect(result.current.isListening).toBe(false);
      expect(result.current.isFinalizing).toBe(true);
      act(() => {
        events.onFinal('Final words.');
        events.onEnd();
      });
      expect(onText).toHaveBeenCalledWith('Final words.');
      expect(result.current.isFinalizing).toBe(false);
    },
  );
});

import { describe, expect, it } from 'vitest';
import { float32ToInt16, PcmFramer } from './pcm';

describe('PCM audio framing', () => {
  it('clamps samples to the signed PCM16 range', () => {
    expect(float32ToInt16(-2)).toBe(-32768);
    expect(float32ToInt16(2)).toBe(32767);
    expect(float32ToInt16(0)).toBe(0);
  });

  it.each([16000, 44100, 48000])(
    'resamples %s Hz into 20 ms little-endian frames without dropping worklet remainders',
    (rate) => {
      const framer = new PcmFramer(rate);
      const samples = new Float32Array(rate + 1).fill(0.5);
      const frames: ArrayBuffer[] = [];
      for (let offset = 0; offset < samples.length; offset += 128)
        frames.push(...framer.push(samples.slice(offset, offset + 128)));
      expect(frames.length).toBe(50);
      expect(frames.every((frame) => frame.byteLength === 960)).toBe(true);
      expect(new DataView(frames[0]).getInt16(0, true)).toBe(16384);
    },
  );
});

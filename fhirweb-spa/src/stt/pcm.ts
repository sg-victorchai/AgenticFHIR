export const float32ToInt16 = (sample: number): number => {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * (clamped < 0 ? 32768 : 32767));
};

export const SAMPLE_RATE = 24000;

export class PcmFramer {
  private previous = 0;
  private inputIndex = 0;
  private nextSample = 0;
  private frame = new ArrayBuffer(SAMPLE_RATE * 0.02 * 2);
  private frameIndex = 0;

  constructor(private readonly inputRate: number) {}

  push(input: Float32Array): ArrayBuffer[] {
    const frames: ArrayBuffer[] = [];
    for (const sample of input) {
      while (this.nextSample <= this.inputIndex) {
        const fraction = this.nextSample - (this.inputIndex - 1);
        const interpolated =
          this.previous + (sample - this.previous) * fraction;
        new DataView(this.frame).setInt16(
          this.frameIndex * 2,
          float32ToInt16(interpolated),
          true,
        );
        this.frameIndex += 1;
        if (this.frameIndex === SAMPLE_RATE * 0.02) {
          frames.push(this.frame);
          this.frame = new ArrayBuffer(SAMPLE_RATE * 0.02 * 2);
          this.frameIndex = 0;
        }
        this.nextSample += this.inputRate / SAMPLE_RATE;
      }
      this.previous = sample;
      this.inputIndex += 1;
    }
    return frames;
  }
}

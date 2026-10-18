export const float32ToInt16 = (sample: number): number => {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * (clamped < 0 ? 32768 : 32767));
};

export class PcmFramer {
  private previous = 0;
  private inputIndex = 0;
  private nextSample = 0;
  private frame = new ArrayBuffer(640);
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
        if (this.frameIndex === 320) {
          frames.push(this.frame);
          this.frame = new ArrayBuffer(640);
          this.frameIndex = 0;
        }
        this.nextSample += this.inputRate / 16000;
      }
      this.previous = sample;
      this.inputIndex += 1;
    }
    return frames;
  }
}

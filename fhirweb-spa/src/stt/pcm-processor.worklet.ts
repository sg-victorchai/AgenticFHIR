import { PcmFramer } from './pcm';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;

class PcmProcessor extends AudioWorkletProcessor {
  private readonly framer = new PcmFramer(sampleRate);

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (input) {
      for (const frame of this.framer.push(input))
        this.port.postMessage(frame, [frame]);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);

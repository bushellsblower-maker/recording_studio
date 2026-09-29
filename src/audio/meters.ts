export interface MeterReading {
  rms: number;
  peak: number;
}

export function readMeter(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): MeterReading {
  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i] ?? 0;
    sum += sample * sample;
    const abs = sample < 0 ? -sample : sample;
    if (abs > peak) peak = abs;
  }
  return { rms: Math.sqrt(sum / Math.max(1, buffer.length)), peak };
}

export function readReduction(node: DynamicsCompressorNode): number {
  const raw = node.reduction as number | AudioParam;
  return typeof raw === 'number' ? raw : raw.value;
}

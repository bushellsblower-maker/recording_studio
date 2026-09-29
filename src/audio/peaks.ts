/** Peak envelope for clip waveforms. Long files use wider buckets so the list stays small. */
export function computePeaks(buffer: AudioBuffer): number[] {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const bucket = Math.max(256, Math.floor(left.length / 1800));
  const peaks: number[] = [];
  for (let i = 0; i < left.length; i += bucket) {
    let peak = 0;
    const end = Math.min(left.length, i + bucket);
    for (let j = i; j < end; j++) {
      const value = Math.max(Math.abs(left[j] ?? 0), Math.abs(right[j] ?? 0));
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }
  return peaks;
}

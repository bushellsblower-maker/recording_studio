export function concatFloat32(chunks: readonly Float32Array[], length: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.max(0, length));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= out.length) break;
    const take = Math.min(chunk.length, out.length - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

export function sumStereo(
  parts: readonly { left: Float32Array; right: Float32Array; gainL: number; gainR: number }[],
): { left: Float32Array; right: Float32Array; peak: number; scaled: boolean } {
  let frames = 0;
  for (const part of parts) {
    frames = Math.max(frames, Math.min(part.left.length, part.right.length));
  }
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (const part of parts) {
    const count = Math.min(part.left.length, part.right.length, frames);
    for (let i = 0; i < count; i++) {
      left[i] += part.left[i] * part.gainL;
      right[i] += part.right[i] * part.gainR;
    }
  }
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const absL = Math.abs(left[i]);
    const absR = Math.abs(right[i]);
    if (absL > peak) peak = absL;
    if (absR > peak) peak = absR;
  }
  let scaled = false;
  if (peak > 0.98) {
    const scale = 0.98 / peak;
    for (let i = 0; i < frames; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
    scaled = true;
  }
  return { left, right, peak, scaled };
}

function writeString(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function floatToPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  const scaled = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  return Math.round(scaled);
}

/** 16-bit stereo PCM WAV. Reads the channel arrays and does not mutate them. */
export function encodeStereoWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = Math.min(left.length, right.length);
  const dataBytes = frames * 4;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    view.setInt16(offset, floatToPcm16(left[i] ?? 0), true);
    view.setInt16(offset + 2, floatToPcm16(right[i] ?? 0), true);
    offset += 4;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

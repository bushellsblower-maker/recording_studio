export interface SampleMeta {
  id: string;
  name: string;
  category: string;
  kind: 'oneshot' | 'loop';
  file: string;
  bpm: number | null;
  bars: number | null;
}

interface CatalogFile {
  samples?: SampleMeta[];
}

export class SampleBank {
  metas: SampleMeta[] = [];
  private readonly buffers = new Map<string, Promise<AudioBuffer>>();

  async load(): Promise<void> {
    const response = await fetch('/samples/catalog.json');
    if (!response.ok) throw new Error(`Sample catalog returned ${response.status}`);
    const data = (await response.json()) as CatalogFile;
    this.metas = Array.isArray(data.samples) ? data.samples : [];
  }

  meta(id: string): SampleMeta | undefined {
    return this.metas.find((sample) => sample.id === id);
  }

  buffer(ctx: AudioContext, sample: SampleMeta): Promise<AudioBuffer> {
    const cached = this.buffers.get(sample.id);
    if (cached) return cached;
    const pending = fetch(`/samples/${sample.file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Missing ${sample.file}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes.slice(0)));
    pending.catch(() => {
      this.buffers.delete(sample.id);
    });
    this.buffers.set(sample.id, pending);
    return pending;
  }
}

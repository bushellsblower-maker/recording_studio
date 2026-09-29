import type { SampleMeta } from './library';

/** What the on-screen keys, QWERTY, and Web MIDI should play. */
export type KeyVoiceRequest =
  | { kind: 'synth' }
  | { kind: 'layers'; layers: Array<{ id: string; rootMidi: number }> };

export interface SampleLayerRef {
  id: string;
  rootMidi: number;
}

export interface ChromaticBank {
  id: string;
  name: string;
  layers: SampleLayerRef[];
}

export interface PadKit {
  id: string;
  name: string;
  pads: string[];
}

const PITCH: Record<string, number> = {
  c: 0,
  cs: 1,
  db: 1,
  d: 2,
  ds: 3,
  eb: 3,
  e: 4,
  f: 5,
  fs: 6,
  gb: 6,
  g: 7,
  gs: 8,
  ab: 8,
  a: 9,
  as: 10,
  bb: 10,
  b: 11,
};

const BANK_NAMES: Record<string, string> = {
  saw: 'Saw',
  sub: 'Sub',
  ep: 'EP',
  pluck: 'Pluck',
  key: 'Keys',
  bass: 'Bass',
  'vox-ah': 'Vox ah',
  'vox-ee': 'Vox ee',
  'vox-eh': 'Vox eh',
  'vox-oh': 'Vox oh',
  'vox-oo': 'Vox oo',
};

export const PAD_KITS: PadKit[] = [
  {
    id: 'acoustic',
    name: 'Acoustic kit',
    pads: ['kick', 'snare', 'hat', 'hat-open', 'tom-hi', 'tom-lo', 'crash-med', 'ride'],
  },
  {
    id: 'electro',
    name: 'Electro kit',
    pads: ['electro-kick-1', 'electro-snare-1', 'electro-hat-1', 'electro-open-1', 'clap-1', 'rim', 'cowbell-1', 'shaker'],
  },
  {
    id: 'perc',
    name: 'Percussion',
    pads: ['bongo-1', 'conga-1', 'conga-slap-1', 'shaker', 'cabasa-1', 'clave-1', 'tamb-1', 'agogo-hi-1'],
  },
];

/** Pull a trailing note name (`saw-cs3`, `key-bb`, `bass-c`) off a sample id. */
export function parseSampleNote(id: string): { prefix: string; rootMidi: number } | null {
  const match = /^(.*?)-([a-g](?:s|b)?)(\d)?$/i.exec(id);
  if (!match) return null;
  const prefix = match[1] ?? '';
  if (!prefix) return null;
  const pitch = PITCH[(match[2] ?? '').toLowerCase()];
  if (pitch === undefined) return null;
  const octave = match[3] ? Number(match[3]) : defaultOctave(prefix);
  const rootMidi = (octave + 1) * 12 + pitch;
  if (rootMidi < 0 || rootMidi > 127) return null;
  return { prefix, rootMidi };
}

export function chromaticBanks(samples: readonly SampleMeta[]): ChromaticBank[] {
  const groups = new Map<string, SampleLayerRef[]>();
  for (const sample of samples) {
    if (sample.kind !== 'oneshot') continue;
    const parsed = parseSampleNote(sample.id);
    if (!parsed) continue;
    const list = groups.get(parsed.prefix) ?? [];
    list.push({ id: sample.id, rootMidi: parsed.rootMidi });
    groups.set(parsed.prefix, list);
  }
  const banks: ChromaticBank[] = [];
  for (const [id, layers] of groups) {
    const pitches = new Set(layers.map((layer) => layer.rootMidi));
    if (pitches.size < 4) continue;
    banks.push({
      id,
      name: BANK_NAMES[id] ?? id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      layers: layers.slice().sort((a, b) => a.rootMidi - b.rootMidi || a.id.localeCompare(b.id)),
    });
  }
  banks.sort((a, b) => a.name.localeCompare(b.name));
  return banks;
}

/** Fill a kit with real one-shots, then spare drum and perc hits if an id is missing. */
export function resolveKit(ids: readonly string[], samples: readonly SampleMeta[], count: number): string[] {
  const oneshots = samples.filter((sample) => sample.kind === 'oneshot');
  const have = new Set(oneshots.map((sample) => sample.id));
  const pads: string[] = [];
  for (const id of ids) {
    if (pads.length >= count) break;
    if (have.has(id) && !pads.includes(id)) pads.push(id);
  }
  for (const sample of oneshots) {
    if (pads.length >= count) break;
    if (sample.category !== 'Drums' && sample.category !== 'Perc') continue;
    if (pads.includes(sample.id)) continue;
    pads.push(sample.id);
  }
  return pads;
}

function defaultOctave(prefix: string): number {
  if (prefix === 'bass' || prefix === 'sub') return 2;
  return 4;
}

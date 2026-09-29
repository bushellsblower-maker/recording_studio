import type { PluginKind } from './plugins';
import type { FolderId, LaunchQuant, SynthSettings, TrackKind } from '../types';

export interface StoredClip {
  sampleRate: number;
  channels: Float32Array[];
}

export interface StoredInsert {
  kind: PluginKind;
  bypass: boolean;
  params: Record<string, number>;
}

export interface StoredPoint {
  beat: number;
  value: number;
}

export interface StoredSlot {
  name: string;
  bpm: number | null;
  clip: StoredClip;
}

export interface StoredMarker {
  id: string;
  beat: number;
  name: string;
}

export interface StoredTrack {
  armed: boolean;
  muted: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  name: string;
  kind: TrackKind;
  startBeat: number;
  clipBpm: number | null;
  mono: boolean;
  folder: FolderId;
  delaySend: number;
  reverbSend: number;
  trimStart: number;
  trimEnd: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  inserts: (StoredInsert | null)[];
  volumeAuto: StoredPoint[];
  panAuto: StoredPoint[];
  fxAuto: StoredPoint[];
  clip: StoredClip | null;
  slots: (StoredSlot | null)[];
  sessionSlot: number | null;
}

export interface StoredProject {
  version: 1;
  savedAt: number;
  bpm: number;
  masterDb: number;
  metroOn: boolean;
  metroLevel: number;
  loopOn: boolean;
  playFromBeat: number;
  playToBeat: number;
  rangeCustom: boolean;
  countIn: boolean;
  punch: boolean;
  launchQuant: LaunchQuant;
  cueBeat: number;
  markers: StoredMarker[];
  synth: SynthSettings;
  tracks: StoredTrack[];
}

const DB_NAME = 'rs4-desk';
const STORE = 'project';
const KEY = 'current';

export async function saveProject(project: StoredProject): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the project.'));
    tx.objectStore(STORE).put(project, KEY);
  });
  db.close();
}

export async function loadProject(): Promise<StoredProject | null> {
  const db = await openDb();
  const project = await new Promise<StoredProject | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => {
      const value = request.result as StoredProject | undefined;
      resolve(value && value.version === 1 ? value : null);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not load the project.'));
  });
  db.close();
  return project;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is unavailable.'));
  });
}

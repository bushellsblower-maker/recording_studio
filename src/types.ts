import type { PluginKind } from './audio/plugins';

export const TRACK_COUNT = 8;

export type InputMode = 'mic' | 'tone' | 'both';

export type ToneShape = OscillatorType | 'noise';

export type TransportMode = 'stopped' | 'playing' | 'recording' | 'stopping';

export type TrackKind = 'audio' | 'instrument';

export type MicState = 'off' | 'pending' | 'on' | 'denied' | 'missing' | 'busy' | 'error';

export interface AutoPoint {
  beat: number;
  value: number;
}

export interface InsertSnapshot {
  kind: PluginKind;
  bypass: boolean;
  params: Record<string, number>;
}

export interface SlotSnapshot {
  name: string;
  hasAudio: boolean;
}

export interface MarkerSnapshot {
  id: string;
  beat: number;
  name: string;
}

export type LaunchQuant = 'beat' | 'bar';

export type FolderId = 0 | 1 | 2;

export interface SynthSettings {
  wave: OscillatorType;
  cutoff: number;
  resonance: number;
  attack: number;
  release: number;
  level: number;
}

export interface TrackSnapshot {
  armed: boolean;
  muted: boolean;
  solo: boolean;
  hasAudio: boolean;
  duration: number;
  name: string;
  kind: TrackKind;
  startBeat: number;
  mono: boolean;
  folder: FolderId;
  delaySend: number;
  reverbSend: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  lengthBeats: number;
  inserts: (InsertSnapshot | null)[];
  slots: (SlotSnapshot | null)[];
  sessionSlot: number | null;
  volumeAuto: AutoPoint[];
  panAuto: AutoPoint[];
  fxAuto: AutoPoint[];
}

export interface EngineSnapshot {
  powered: boolean;
  sampleRate: number;
  mode: TransportMode;
  mic: MicState;
  gateAvailable: boolean;
  sessionLength: number;
  tracks: TrackSnapshot[];
  contextState: AudioContextState | 'unpowered';
  inputMute: boolean;
  inputSolo: boolean;
  masterMute: boolean;
  metroOn: boolean;
  loopOn: boolean;
  playFromBeat: number;
  playToBeat: number;
  rangeCustom: boolean;
  canUndo: boolean;
  canRedo: boolean;
  countIn: boolean;
  punch: boolean;
  launchQuant: LaunchQuant;
  cueBeat: number;
  markers: MarkerSnapshot[];
  synth: SynthSettings;
}

export interface Levels {
  inputRms: number;
  inputPeak: number;
  masterL: number;
  masterR: number;
  masterPeakL: number;
  masterPeakR: number;
  reduction: number;
}

export function isInputMode(value: string): value is InputMode {
  return value === 'mic' || value === 'tone' || value === 'both';
}

export function isToneShape(value: string): value is ToneShape {
  return (
    value === 'sine' ||
    value === 'square' ||
    value === 'sawtooth' ||
    value === 'triangle' ||
    value === 'noise'
  );
}

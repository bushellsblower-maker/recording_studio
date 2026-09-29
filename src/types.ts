export const TRACK_COUNT = 8;

export type InputMode = 'mic' | 'tone' | 'both';

export type ToneShape = OscillatorType | 'noise';

export type TransportMode = 'stopped' | 'playing' | 'recording' | 'stopping';

export type TrackKind = 'audio' | 'instrument';

export type MicState = 'off' | 'pending' | 'on' | 'denied' | 'missing' | 'busy' | 'error';

export interface TrackSnapshot {
  armed: boolean;
  muted: boolean;
  solo: boolean;
  hasAudio: boolean;
  duration: number;
  name: string;
  kind: TrackKind;
  startBeat: number;
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

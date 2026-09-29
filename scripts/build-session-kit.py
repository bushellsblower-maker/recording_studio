#!/usr/bin/env python3
"""Build the RS-4 session kit under public/samples/.

Drum one-shots are trimmed excerpts of Virtuosity Drums (CC0-1.0).
Loops sequence those hits. Bass, keys, shaker, and FX are original
synthesis dedicated to CC0-1.0 by this repository.

Source flacs are downloaded into a temp dir and are not committed.
"""

from __future__ import annotations

import array
import json
import math
import random
import struct
import subprocess
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
SRC = Path("/tmp/rs-src")
SR = 44100
BPM = 100

RAW = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master"
SOURCES = {
    "kick.flac": "Samples/kickmic/kick/kickmic_kick_snon_vl4_rr1.flac",
    "snare.flac": "Samples/snaremic/snare/snaremic_snare_center_vl20.flac",
    "rim.flac": "Samples/snaremic/snare/snaremic_snare_rimshot_vl12.flac",
    "stick.flac": "Samples/snaremic/snare/snaremic_snare_crossstick_vl8.flac",
    "hat.flac": "Samples/mid/hh/mid_hh_closed_vl3_rr1.flac",
    "hatopen.flac": "Samples/mid/hh/mid_hh_half_vl2_rr1.flac",
    "tomhi.flac": "Samples/snaremic/htom/snaremic_htom_center_vl8.flac",
    "tomlo.flac": "Samples/kickmic/ltom/kickmic_ltom_center_vl6.flac",
    "ride.flac": "Samples/lofi/ride/lofi_ride_bell_vl2_rr1.flac",
}


def ensure_sources() -> None:
    SRC.mkdir(parents=True, exist_ok=True)
    for name, rel in SOURCES.items():
        dest = SRC / name
        if dest.exists() and dest.stat().st_size > 1000:
            continue
        url = f"{RAW}/{rel}"
        print(f"download {name}")
        urllib.request.urlretrieve(url, dest)


def load_mono(path: Path) -> array.array:
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(SR),
            "-f",
            "f32le",
            "-",
        ]
    )
    samples = array.array("f")
    samples.frombytes(raw)
    return samples


def peak_of(samples: array.array) -> float:
    peak = 0.0
    for sample in samples:
        value = abs(sample)
        if value > peak:
            peak = value
    return peak or 1.0


def normalize(samples: array.array, target: float) -> array.array:
    gain = target / peak_of(samples)
    out = array.array("f", (sample * gain for sample in samples))
    return out


def fade(samples: array.array, fade_in: float, fade_out: float) -> None:
    n_in = min(len(samples), int(fade_in * SR))
    n_out = min(len(samples), int(fade_out * SR))
    for i in range(n_in):
        samples[i] *= i / max(1, n_in)
    for i in range(n_out):
        samples[-1 - i] *= i / max(1, n_out)


def trim(samples: array.array, max_sec: float, rel: float = 0.035) -> array.array:
    peak = peak_of(samples)
    thresh = peak * rel
    loud = max(range(len(samples)), key=lambda i: abs(samples[i]))
    start = max(0, loud - int(0.008 * SR))
    last = min(len(samples) - 1, loud + int(max_sec * SR))
    while last > loud + int(0.04 * SR) and abs(samples[last]) < thresh:
        last -= 1
    end = min(len(samples), last + int(0.04 * SR))
    out = array.array("f", samples[start:end])
    fade(out, 0.001, 0.015)
    return out


def silence(frames: int) -> array.array:
    return array.array("f", [0.0]) * frames


def bars_frames(bars: float) -> int:
    return int(round(SR * bars * 4 * 60 / BPM))


def at(sixteenth: int, bars: int = 2) -> int:
    return int(round(sixteenth / (bars * 16) * bars_frames(bars)))


def mix_at(buf: array.array, hit: array.array, pos: int, gain: float) -> None:
    length = len(buf)
    for i, sample in enumerate(hit):
        buf[(pos + i) % length] += sample * gain


def write_wav(path: Path, channels: list[array.array]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frames = len(channels[0])
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(len(channels))
        handle.setsampwidth(2)
        handle.setframerate(SR)
        if len(channels) == 1:
            pcm = bytearray()
            for sample in channels[0]:
                pcm += struct.pack("<h", float_to_pcm(sample))
            handle.writeframes(pcm)
            return
        interleaved = bytearray()
        for i in range(frames):
            for channel in channels:
                interleaved += struct.pack("<h", float_to_pcm(channel[i]))
        handle.writeframes(interleaved)


def float_to_pcm(sample: float) -> int:
    clamped = max(-1.0, min(1.0, sample))
    scaled = int(round(clamped * (32767 if clamped >= 0 else 32768)))
    return max(-32768, min(32767, scaled))


def synth_bass(freq: float, seconds: float) -> array.array:
    frames = int(seconds * SR)
    out = silence(frames)
    phase = 0.0
    low = 0.0
    for i in range(frames):
        t = i / SR
        current = freq * (1 + 0.4 * math.exp(-t * 30))
        phase += 2 * math.pi * current / SR
        cycle = (phase / (2 * math.pi)) % 1
        saw = 2 * cycle - 1
        osc = math.sin(phase) + 0.28 * math.sin(phase * 2) + 0.1 * saw
        low += 0.16 * (osc - low)
        env = math.exp(-t * 3.1) * (1 - math.exp(-t * 80))
        out[i] = low * env
    fade(out, 0.001, 0.02)
    return normalize(out, 0.82)


def synth_key(freq: float, seconds: float) -> array.array:
    frames = int(seconds * SR)
    out = silence(frames)
    for i in range(frames):
        t = i / SR
        mod = math.sin(2 * math.pi * freq * 2 * t) * 2.4 * math.exp(-t * 5)
        car = math.sin(2 * math.pi * freq * t + mod)
        body = math.sin(2 * math.pi * freq * t) * 0.25
        env = (1 - math.exp(-t * 220)) * math.exp(-t * 2.2)
        out[i] = (car + body) * env
    fade(out, 0.001, 0.03)
    return normalize(out, 0.78)


def synth_shaker(seconds: float = 0.16) -> array.array:
    frames = int(seconds * SR)
    rng = random.Random(7)
    out = silence(frames)
    prev = 0.0
    high = 0.0
    for i in range(frames):
        t = i / SR
        noise = rng.uniform(-1, 1)
        high = noise - prev + 0.82 * high
        prev = noise
        env = math.exp(-t * 16) * (1 - math.exp(-t * 500))
        out[i] = high * env
    fade(out, 0.001, 0.01)
    return normalize(out, 0.55)


def synth_rise(seconds: float) -> array.array:
    frames = int(seconds * SR)
    rng = random.Random(11)
    out = silence(frames)
    low = 0.0
    for i in range(frames):
        t = i / max(1, frames - 1)
        noise = rng.uniform(-1, 1)
        coeff = 0.015 + 0.55 * (t ** 2)
        low += coeff * (noise - low)
        out[i] = low * (t ** 1.7)
    fade(out, 0.01, 0.02)
    return normalize(out, 0.62)


def synth_wash(frames: int) -> tuple[array.array, array.array]:
    rng_l = random.Random(21)
    rng_r = random.Random(22)
    left = silence(frames)
    right = silence(frames)
    low_l = 0.0
    low_r = 0.0
    for i in range(frames):
        t = i / SR
        edge = min(1.0, t / 0.6) * min(1.0, (frames - i) / (SR * 0.5))
        n_l = rng_l.uniform(-1, 1)
        n_r = rng_r.uniform(-1, 1)
        low_l += 0.04 * (n_l - low_l)
        low_r += 0.045 * (n_r - low_r)
        tone = 0.08 * math.sin(2 * math.pi * 196 * t) + 0.05 * math.sin(2 * math.pi * 247 * t)
        left[i] = (low_l * 0.85 + tone) * edge
        right[i] = (low_r * 0.85 + tone * 0.9) * edge
    pair = [left, right]
    peak = max(peak_of(left), peak_of(right)) or 1
    gain = 0.45 / peak
    return array.array("f", (s * gain for s in left)), array.array("f", (s * gain for s in right))


def synth_pad(freqs: list[float], frames: int) -> tuple[array.array, array.array]:
    left = silence(frames)
    right = silence(frames)
    phases_l = [0.0] * len(freqs)
    phases_r = [0.0] * len(freqs)
    for i in range(frames):
        t = i / SR
        env = min(1.0, t / 0.45) * min(1.0, (frames - i) / (SR * 0.45))
        vib = 1 + 0.004 * math.sin(2 * math.pi * 4.2 * t)
        acc_l = 0.0
        acc_r = 0.0
        for k, freq in enumerate(freqs):
            det = 1.004 if k % 2 == 0 else 0.996
            phases_l[k] += 2 * math.pi * freq * vib / SR
            phases_r[k] += 2 * math.pi * freq * det * vib / SR
            acc_l += math.sin(phases_l[k])
            acc_r += math.sin(phases_r[k])
        left[i] = acc_l * 0.16 * env
        right[i] = acc_r * 0.16 * env
    peak = max(peak_of(left), peak_of(right)) or 1
    gain = 0.7 / peak
    return array.array("f", (s * gain for s in left)), array.array("f", (s * gain for s in right))


def mix_limit(buf: array.array, ceiling: float = 0.95) -> None:
    peak = peak_of(buf)
    if peak <= ceiling:
        return
    gain = ceiling / peak
    for i, sample in enumerate(buf):
        buf[i] = sample * gain


def note_hz(midi: int) -> float:
    return 440 * (2 ** ((midi - 69) / 12))


def main() -> None:
    ensure_sources()
    caps = {
        "kick.flac": 0.55,
        "snare.flac": 0.48,
        "rim.flac": 0.42,
        "stick.flac": 0.28,
        "hat.flac": 0.18,
        "hatopen.flac": 0.85,
        "tomhi.flac": 0.7,
        "tomlo.flac": 0.85,
        "ride.flac": 0.55,
    }
    hits = {name: normalize(trim(load_mono(SRC / name), cap), 0.9) for name, cap in caps.items()}
    shaker = synth_shaker()

    two = bars_frames(2)
    one = bars_frames(1)
    house = silence(two)
    for step in range(0, 32, 4):
        mix_at(house, hits["kick.flac"], at(step), 0.95)
        mix_at(house, hits["hat.flac"], at(step), 0.34)
        mix_at(house, hits["hat.flac"], at(step + 2), 0.26)
    for step in (4, 12, 20, 28):
        mix_at(house, hits["snare.flac"], at(step), 0.78)
    for step in (14, 30):
        mix_at(house, hits["hatopen.flac"], at(step), 0.42)
    for step in (6, 22):
        mix_at(house, hits["stick.flac"], at(step), 0.28)
    mix_limit(house)

    half = silence(two)
    for step in (0, 10, 16, 26):
        mix_at(half, hits["kick.flac"], at(step), 0.92)
    for step in (8, 24):
        mix_at(half, hits["snare.flac"], at(step), 0.84)
    for step in range(0, 32, 2):
        mix_at(half, hits["hat.flac"], at(step), 0.3)
    for step in (14, 30):
        mix_at(half, hits["hatopen.flac"], at(step), 0.36)
    mix_limit(half)

    perc = silence(two)
    for step in (0, 3, 6, 10, 12, 16, 19, 22, 26, 28):
        mix_at(perc, hits["stick.flac"], at(step), 0.7)
    for step in (0, 16):
        mix_at(perc, hits["tomlo.flac"], at(step), 0.55)
    for step in (6, 14, 22, 30):
        mix_at(perc, hits["tomhi.flac"], at(step), 0.48)
    for step in (4, 12, 20, 28):
        mix_at(perc, hits["ride.flac"], at(step), 0.4)
    for step in range(0, 32, 2):
        mix_at(perc, shaker, at(step), 0.45)
    mix_limit(perc)

    bass_notes = {
        "c": synth_bass(note_hz(36), 0.7),
        "eb": synth_bass(note_hz(39), 0.7),
        "f": synth_bass(note_hz(41), 0.7),
        "g": synth_bass(note_hz(43), 0.7),
        "bb": synth_bass(note_hz(34), 0.7),
    }
    bass_pattern = [36, 36, 39, 41, 43, 41, 39, 36, 34, 34, 36, 39, 41, 39, 36, 31]
    bass = silence(two)
    eighth = two / 16
    for index, midi in enumerate(bass_pattern):
        hit = synth_bass(note_hz(midi), 0.42)
        mix_at(bass, hit, int(index * eighth), 0.9)
    mix_limit(bass)

    key_midis = {"c": 60, "eb": 63, "g": 67, "bb": 70}
    keys = {name: synth_key(note_hz(midi), 0.95) for name, midi in key_midis.items()}
    chord = silence(int(0.7 * SR))
    for midi in (60, 63, 67, 70):
        mix_at(chord, synth_key(note_hz(midi), 0.65), 0, 0.7)
    mix_limit(chord, 0.85)

    pad_l, pad_r = synth_pad([note_hz(m) for m in (48, 51, 55, 58, 62)], two)
    wash_l, wash_r = synth_wash(two)
    rise = synth_rise(one / SR)

    files: list[tuple[str, list[array.array]]] = [
        ("drums/kick.wav", [hits["kick.flac"]]),
        ("drums/snare.wav", [hits["snare.flac"]]),
        ("drums/hat.wav", [hits["hat.flac"]]),
        ("drums/hat-open.wav", [hits["hatopen.flac"]]),
        ("drums/house.wav", [house]),
        ("drums/halftime.wav", [half]),
        ("perc/stick.wav", [hits["stick.flac"]]),
        ("perc/rim.wav", [hits["rim.flac"]]),
        ("perc/tom-hi.wav", [hits["tomhi.flac"]]),
        ("perc/tom-lo.wav", [hits["tomlo.flac"]]),
        ("perc/ride.wav", [hits["ride.flac"]]),
        ("perc/shaker.wav", [shaker]),
        ("perc/perc-loop.wav", [perc]),
        ("bass/c.wav", [bass_notes["c"]]),
        ("bass/eb.wav", [bass_notes["eb"]]),
        ("bass/f.wav", [bass_notes["f"]]),
        ("bass/g.wav", [bass_notes["g"]]),
        ("bass/bb.wav", [bass_notes["bb"]]),
        ("bass/bass-loop.wav", [bass]),
        ("keys/c.wav", [keys["c"]]),
        ("keys/eb.wav", [keys["eb"]]),
        ("keys/g.wav", [keys["g"]]),
        ("keys/bb.wav", [keys["bb"]]),
        ("keys/chord.wav", [chord]),
        ("keys/pad.wav", [pad_l, pad_r]),
        ("fx/rise.wav", [rise]),
        ("fx/wash.wav", [wash_l, wash_r]),
    ]

    catalog = []
    meta = [
        ("kick", "Kick", "Drums", "oneshot", "drums/kick.wav", None, None),
        ("snare", "Snare", "Drums", "oneshot", "drums/snare.wav", None, None),
        ("hat", "Hat closed", "Drums", "oneshot", "drums/hat.wav", None, None),
        ("hat-open", "Hat half-open", "Drums", "oneshot", "drums/hat-open.wav", None, None),
        ("house", "House groove", "Drums", "loop", "drums/house.wav", BPM, 2),
        ("halftime", "Half-time", "Drums", "loop", "drums/halftime.wav", BPM, 2),
        ("stick", "Cross-stick", "Perc", "oneshot", "perc/stick.wav", None, None),
        ("rim", "Rimshot", "Perc", "oneshot", "perc/rim.wav", None, None),
        ("tom-hi", "Tom high", "Perc", "oneshot", "perc/tom-hi.wav", None, None),
        ("tom-lo", "Tom low", "Perc", "oneshot", "perc/tom-lo.wav", None, None),
        ("ride", "Ride bell", "Perc", "oneshot", "perc/ride.wav", None, None),
        ("shaker", "Shaker", "Perc", "oneshot", "perc/shaker.wav", None, None),
        ("perc-loop", "Perc loop", "Perc", "loop", "perc/perc-loop.wav", BPM, 2),
        ("bass-c", "Bass C", "Bass", "oneshot", "bass/c.wav", None, None),
        ("bass-eb", "Bass Eb", "Bass", "oneshot", "bass/eb.wav", None, None),
        ("bass-f", "Bass F", "Bass", "oneshot", "bass/f.wav", None, None),
        ("bass-g", "Bass G", "Bass", "oneshot", "bass/g.wav", None, None),
        ("bass-bb", "Bass Bb", "Bass", "oneshot", "bass/bb.wav", None, None),
        ("bass-loop", "Bass loop", "Bass", "loop", "bass/bass-loop.wav", BPM, 2),
        ("key-c", "Key C", "Keys", "oneshot", "keys/c.wav", None, None),
        ("key-eb", "Key Eb", "Keys", "oneshot", "keys/eb.wav", None, None),
        ("key-g", "Key G", "Keys", "oneshot", "keys/g.wav", None, None),
        ("key-bb", "Key Bb", "Keys", "oneshot", "keys/bb.wav", None, None),
        ("chord", "Chord stab", "Keys", "oneshot", "keys/chord.wav", None, None),
        ("pad", "Pad loop", "Keys", "loop", "keys/pad.wav", BPM, 2),
        ("rise", "Rise", "FX", "oneshot", "fx/rise.wav", BPM, 1),
        ("wash", "Wash", "FX", "loop", "fx/wash.wav", BPM, 2),
    ]
    total = 0
    for spec, row in zip(files, meta):
        rel, channels = spec
        path = OUT / rel
        write_wav(path, channels)
        size = path.stat().st_size
        total += size
        sample_id, name, category, kind, file, bpm, bars = row
        entry = {
            "id": sample_id,
            "name": name,
            "category": category,
            "kind": kind,
            "file": file,
            "bpm": bpm,
            "bars": bars,
        }
        catalog.append(entry)
        print(f"{size:8d}  {rel}")

    payload = {
        "name": "RS-4 Session Kit",
        "license": "CC0-1.0",
        "defaultBpm": BPM,
        "samples": catalog,
    }
    (OUT / "catalog.json").write_text(json.dumps(payload, indent=2) + "\n")
    print(f"total {total} bytes ({total / 1_000_000:.2f} MB) across {len(catalog)} files")


if __name__ == "__main__":
    main()

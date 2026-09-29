#!/usr/bin/env python3
"""Build the RS-4 sample library under public/samples/.

Recorded drums are trimmed one-shots from Virtuosity Drums (CC0-1.0,
Versilian Studios / Austin McMahon). Everything else is original synthesis
written for this repository and dedicated to the public domain under CC0-1.0.

One-shots and musical loops are 16-bit WAV at 22.05 kHz so transients stay
on the grid (MP3 encoder delay would push drum hits late). Ambience beds are
MP3. Rebuild requires Python 3, numpy, ffmpeg, and network access to GitHub.
"""

from __future__ import annotations

import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
CACHE = Path("/tmp/rs-vd")
SR = 22050
RAW = "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/master/"
TREE = "https://api.github.com/repos/sfzinstruments/virtuosity_drums/git/trees/master?recursive=1"

# folder, filename prefix, trim seconds, id stem, display name, canonical id, canonical name
DRUMS: list[tuple[str, str, float, str, str, str | None, str | None]] = [
    ("Samples/kickmic/kick", "kickmic_kick_snon", 0.48, "kick-snon", "Kick · snare on", "kick", "Kick"),
    ("Samples/kickmic/kick", "kickmic_kick_snoff", 0.48, "kick-snoff", "Kick · snare off", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_center", 0.42, "snare-center", "Snare", "snare", "Snare"),
    ("Samples/snaremic/snare", "snaremic_snare_offcenter", 0.42, "snare-edge", "Snare edge", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_rimshot", 0.4, "snare-rim", "Rimshot", "rim", "Rimshot"),
    ("Samples/snaremic/snare", "snaremic_snare_crossstick", 0.28, "snare-stick", "Cross-stick", "stick", "Cross-stick"),
    ("Samples/snaremic/snare", "snaremic_snare_muted", 0.28, "snare-ghost", "Snare ghost", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_buzz", 0.55, "snare-buzz", "Snare buzz", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_flam", 0.4, "snare-flam", "Snare flam", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_halfopen", 0.4, "snare-half", "Snare half", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_stickshot1", 0.28, "stickshot", "Stick shot", None, None),
    ("Samples/snaremic/snare", "snaremic_snare_stickshot2", 0.28, "stickshot-b", "Stick shot B", None, None),
    ("Samples/mid/hh", "mid_hh_closed", 0.16, "hat-closed", "Hat closed", "hat", "Hat closed"),
    ("Samples/mid/hh", "mid_hh_half", 0.7, "hat-half", "Hat half-open", "hat-open", "Hat half-open"),
    ("Samples/mid/hh", "mid_hh_open", 0.9, "hat-open-full", "Hat open", None, None),
    ("Samples/mid/hh", "mid_hh_pedal", 0.22, "hat-pedal", "Hat pedal", None, None),
    ("Samples/mid/hh", "mid_hh_34", 0.55, "hat-34", "Hat three-quarter", None, None),
    ("Samples/mid/hh", "mid_hh_splash", 0.7, "hat-splash", "Hat splash", None, None),
    ("Samples/snaremic/htom", "snaremic_htom_center", 0.62, "tom-hi", "Tom high", "tom-hi", "Tom high"),
    ("Samples/snaremic/htom", "snaremic_htom_offcenter", 0.62, "tom-hi-edge", "Tom high edge", None, None),
    ("Samples/mid/htom", "mid_htom_center", 0.62, "tom-hi-mid", "Tom high room", None, None),
    ("Samples/kickmic/ltom", "kickmic_ltom_center", 0.75, "tom-lo", "Tom low", "tom-lo", "Tom low"),
    ("Samples/kickmic/ltom", "kickmic_ltom_offcenter", 0.75, "tom-lo-edge", "Tom low edge", None, None),
    ("Samples/kickmic/ltom", "kickmic_ltom_muted", 0.4, "tom-lo-mute", "Tom low muted", None, None),
    ("Samples/kickmic/ltom", "kickmic_ltom_rimshot", 0.45, "tom-lo-rim", "Tom low rim", None, None),
    ("Samples/mid/ride", "mid_ride_bell", 0.55, "ride-bell", "Ride bell", "ride", "Ride bell"),
    ("Samples/mid/ride", "mid_ride_ride", 0.7, "ride-bow", "Ride bow", None, None),
    ("Samples/lofi/ride", "lofi_ride_bell", 0.55, "ride-bell-lofi", "Ride bell lofi", None, None),
    ("Samples/oh/crash", "oh_crash_crash", 1.05, "crash", "Crash", None, None),
    ("Samples/oh/crash", "oh_crash_sizzle", 1.05, "crash-sizzle", "Crash sizzle", None, None),
    ("Samples/mid/flatride", "mid_flatride_ride", 0.7, "flat-ride", "Flat ride", None, None),
    ("Samples/mid/flatride", "mid_flatride_crash", 1.0, "flat-crash", "Flat crash", None, None),
]

VEL_LABELS = {1: [""], 2: ["soft", "hard"], 3: ["soft", "med", "hard"], 4: ["soft", "med", "hard", "hot"]}
BPMS = [80, 90, 100, 110, 120, 128, 140]
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "rs4-library-builder"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read()


def remote_flacs() -> list[str]:
    payload = json.loads(fetch_bytes(TREE))
    if payload.get("truncated"):
        raise RuntimeError("Virtuosity tree listing was truncated")
    return [item["path"] for item in payload["tree"] if item["path"].endswith(".flac")]


def parse_vl(filename: str, prefix: str) -> tuple[int, int] | None:
    if not filename.endswith(".flac"):
        return None
    stem = filename[: -len(".flac")]
    token = prefix + "_vl"
    if not stem.startswith(token):
        return None
    tail = stem[len(token) :]
    digits = []
    for char in tail:
        if char.isdigit():
            digits.append(char)
        else:
            break
    if not digits:
        return None
    velocity = int("".join(digits))
    round_robin = 1
    if "_rr" in tail:
        rr_digits = []
        for char in tail.split("_rr", 1)[1]:
            if char.isdigit():
                rr_digits.append(char)
            else:
                break
        if rr_digits:
            round_robin = int("".join(rr_digits))
    return velocity, round_robin


def spread(values: list[int], count: int) -> list[int]:
    if len(values) <= count:
        return values
    indexes = [round(i * (len(values) - 1) / (count - 1)) for i in range(count)]
    picked: list[int] = []
    for index in indexes:
        item = values[index]
        if item not in picked:
            picked.append(item)
    return picked


def choose_takes(paths: list[str], prefix: str) -> list[tuple[int, str]]:
    by_velocity: dict[int, tuple[int, str]] = {}
    folder = str(Path(paths[0]).parent) if paths else ""
    for path in paths:
        if str(Path(path).parent).replace("\\", "/") != folder and folder:
            pass
        parsed = parse_vl(Path(path).name, prefix)
        if not parsed:
            continue
        velocity, robin = parsed
        current = by_velocity.get(velocity)
        if current is None or robin < current[0]:
            by_velocity[velocity] = (robin, path)
    if not by_velocity:
        return []
    velocities = sorted(by_velocity)
    count = 4 if len(velocities) >= 8 else 3 if len(velocities) >= 3 else len(velocities)
    return [(velocity, by_velocity[velocity][1]) for velocity in spread(velocities, count)]


def download_one(path: str) -> Path:
    dest = CACHE / path
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(fetch_bytes(RAW + path))
    return dest


def ffmpeg_mono(path: Path) -> np.ndarray:
    import subprocess

    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        stderr=subprocess.DEVNULL,
    )
    audio = np.frombuffer(raw, dtype=np.float32).copy()
    return audio


def normalize(audio: np.ndarray, target: float) -> np.ndarray:
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    if peak < 1e-8:
        return audio
    return (audio * (target / peak)).astype(np.float32)


def fade(audio: np.ndarray, fade_in: float, fade_out: float) -> None:
    n_in = min(len(audio), max(2, int(fade_in * SR)))
    n_out = min(len(audio), max(2, int(fade_out * SR)))
    if len(audio) < 4:
        return
    audio[:n_in] *= np.linspace(0, 1, n_in, dtype=np.float32)
    audio[-n_out:] *= np.linspace(1, 0, n_out, dtype=np.float32)


def trim(audio: np.ndarray, max_sec: float, rel: float = 0.035) -> np.ndarray:
    if len(audio) == 0:
        return audio
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-6:
        return audio[: max(1, int(0.05 * SR))]
    loud = int(np.argmax(np.abs(audio)))
    start = max(0, loud - int(0.006 * SR))
    last = min(len(audio) - 1, loud + int(max_sec * SR))
    thresh = peak * rel
    floor = loud + int(0.035 * SR)
    while last > floor and abs(float(audio[last])) < thresh:
        last -= 1
    end = min(len(audio), last + int(0.028 * SR))
    out = audio[start:end].copy()
    fade(out, 0.001, min(0.04, max_sec * 0.08))
    return normalize(out, 0.9)


def write_wav(path: Path, audio: np.ndarray) -> None:
    import wave

    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(audio, -1, 1)
    if clipped.ndim == 1:
        channels = 1
        frames = (clipped * 32767.0).astype(np.int16)
    else:
        channels = int(clipped.shape[1])
        frames = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(frames.tobytes())


def write_mp3(path: Path, audio: np.ndarray, bitrate: str = "80k") -> None:
    import subprocess

    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(audio, -1, 1)
    channels = 1 if clipped.ndim == 1 else int(clipped.shape[1])
    pcm = (clipped * 32767.0).astype(np.int16)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-f",
            "s16le",
            "-ar",
            str(SR),
            "-ac",
            str(channels),
            "-i",
            "pipe:0",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            str(path),
        ],
        input=pcm.tobytes(),
        check=True,
    )


def midi_hz(midi: int) -> float:
    return 440 * (2 ** ((midi - 69) / 12))


def note_name(midi: int) -> str:
    octave = midi // 12 - 1
    return f"{NOTE_NAMES[midi % 12]}{octave}"


def env_ar(n: int, attack: float, decay: float) -> np.ndarray:
    t = np.arange(n, dtype=np.float32) / SR
    return ((1 - np.exp(-t * attack)) * np.exp(-t * decay)).astype(np.float32)


def synth_kick(pitch: float = 58, seconds: float = 0.42, seed: int = 1) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = pitch * np.exp(-t * 26) + 40
    phase = np.cumsum(2 * np.pi * freq / SR)
    body = np.sin(phase).astype(np.float32)
    click = np.random.default_rng(seed).uniform(-1, 1, n).astype(np.float32) * np.exp(-t * 160)
    audio = body * np.exp(-t * 11) + click * np.float32(0.28)
    fade(audio, 0.001, 0.02)
    return normalize(audio, 0.9)


def synth_snare(seconds: float = 0.32, tone: float = 180, seed: int = 2) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(seed)
    noise = rng.uniform(-1, 1, n).astype(np.float32)
    # simple highpass
    hp = np.zeros(n, dtype=np.float32)
    prev_x = 0.0
    prev_y = 0.0
    for i, sample in enumerate(noise):
        prev_y = sample - prev_x + 0.86 * prev_y
        prev_x = float(sample)
        hp[i] = prev_y
    body = np.sin(2 * np.pi * tone * t) * np.exp(-t * 28)
    audio = hp * np.exp(-t * 16) * 0.75 + body.astype(np.float32) * 0.45
    fade(audio, 0.001, 0.02)
    return normalize(audio, 0.86)


def synth_hat(seconds: float = 0.12, seed: int = 3, open_hat: bool = False) -> np.ndarray:
    seconds = 0.45 if open_hat else seconds
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    rng = np.random.default_rng(seed)
    noise = rng.uniform(-1, 1, n).astype(np.float32)
    hp = np.zeros(n, dtype=np.float32)
    prev_x = 0.0
    prev_y = 0.0
    coeff = 0.7 if open_hat else 0.55
    for i, sample in enumerate(noise):
        prev_y = sample - prev_x + coeff * prev_y
        prev_x = float(sample)
        hp[i] = prev_y
    decay = 8 if open_hat else 28
    audio = hp * np.exp(-t * decay)
    # metallic partials
    for mult, amp in ((317, 0.15), (473, 0.1), (690, 0.08)):
        audio += np.sin(2 * np.pi * mult * t).astype(np.float32) * np.exp(-t * (decay * 0.7)) * amp
    fade(audio, 0.001, 0.015)
    return normalize(audio, 0.7)


def synth_perc(kind: str, variant: int) -> np.ndarray:
    rng = np.random.default_rng(100 + variant * 17 + sum(ord(c) for c in kind))
    if kind in {"shaker", "cabasa", "maracas"}:
        seconds = 0.14 + variant * 0.02
        n = int(seconds * SR)
        t = np.arange(n, dtype=np.float32) / SR
        noise = rng.uniform(-1, 1, n).astype(np.float32)
        hp = np.zeros(n, dtype=np.float32)
        prev_x = prev_y = 0.0
        bursts = 3 + variant
        gate = np.zeros(n, dtype=np.float32)
        centers = np.linspace(int(0.01 * SR), n - 1, bursts)
        for center in centers:
            width = int((0.012 + variant * 0.004) * SR)
            start = max(0, int(center) - width)
            end = min(n, int(center) + width)
            gate[start:end] = np.linspace(0, 1, end - start) * np.linspace(1, 0, end - start)
        for i, sample in enumerate(noise):
            prev_y = sample - prev_x + 0.72 * prev_y
            prev_x = float(sample)
            hp[i] = prev_y
        audio = hp * (gate + 0.15 * np.exp(-t * 18))
        fade(audio, 0.001, 0.012)
        return normalize(audio, 0.62)
    if kind in {"clave", "wood-hi", "wood-lo", "rim-click"}:
        freq = {"clave": 2450, "wood-hi": 1100, "wood-lo": 620, "rim-click": 1800}[kind]
        freq *= 1 + (variant - 1) * 0.06
        n = int(0.18 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        audio = np.sin(2 * np.pi * freq * t * np.exp(-t * 8)).astype(np.float32)
        audio += 0.2 * np.sin(2 * np.pi * freq * 2.3 * t).astype(np.float32) * np.exp(-t * 40)
        audio *= np.exp(-t * (28 - variant * 2))
        fade(audio, 0.0005, 0.012)
        return normalize(audio, 0.8)
    if kind in {"cowbell", "agogo-hi", "agogo-lo"}:
        base = {"cowbell": 587, "agogo-hi": 880, "agogo-lo": 520}[kind] * (1 + (variant - 1) * 0.03)
        n = int((0.28 + variant * 0.04) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        audio = (
            np.sin(2 * np.pi * base * t)
            + 0.55 * np.sin(2 * np.pi * base * 1.5 * t)
            + 0.2 * np.sin(2 * np.pi * base * 2.7 * t)
        ).astype(np.float32)
        audio *= np.exp(-t * (8 + variant))
        fade(audio, 0.001, 0.02)
        return normalize(audio, 0.75)
    if kind in {"conga", "bongo", "conga-slap"}:
        base = {"conga": 196, "bongo": 320, "conga-slap": 240}[kind] * (1 + (variant - 1) * 0.05)
        n = int(0.42 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        freq = base * (1 + 0.4 * np.exp(-t * 30))
        phase = np.cumsum(2 * np.pi * freq / SR)
        audio = np.sin(phase).astype(np.float32) * np.exp(-t * (7 + variant))
        if kind == "conga-slap":
            audio += rng.uniform(-1, 1, n).astype(np.float32) * np.exp(-t * 40) * 0.35
        fade(audio, 0.001, 0.02)
        return normalize(audio, 0.82)
    if kind == "tamb":
        n = int((0.35 + variant * 0.05) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        noise = rng.uniform(-1, 1, n).astype(np.float32)
        jingle = noise * np.exp(-t * (10 + variant))
        jingle += 0.25 * np.sin(2 * np.pi * 2400 * t).astype(np.float32) * np.exp(-t * 18)
        fade(jingle, 0.001, 0.03)
        return normalize(jingle, 0.7)
    if kind == "triangle":
        n = int((0.7 + variant * 0.15) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        freq = 1240 * (1 + variant * 0.04)
        audio = (
            np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.8 * t) + 0.15 * np.sin(2 * np.pi * freq * 4.2 * t)
        ).astype(np.float32)
        audio *= np.exp(-t * (1.6 + variant * 0.2))
        fade(audio, 0.001, 0.05)
        return normalize(audio, 0.65)
    if kind == "guiro":
        n = int(0.32 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        scrapes = 8 + variant * 2
        audio = np.zeros(n, dtype=np.float32)
        noise = rng.uniform(-1, 1, n).astype(np.float32)
        for i in range(scrapes):
            center = int((0.03 + i * (0.22 / scrapes)) * SR)
            width = int(0.008 * SR)
            start = max(0, center - width)
            end = min(n, center + width)
            audio[start:end] += noise[start:end]
        fade(audio, 0.002, 0.02)
        return normalize(audio, 0.6)
    if kind == "snap":
        n = int(0.12 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        noise = rng.uniform(-1, 1, n).astype(np.float32) * np.exp(-t * 50)
        tone = np.sin(2 * np.pi * (900 + variant * 80) * t).astype(np.float32) * np.exp(-t * 40)
        audio = noise * 0.8 + tone * 0.3
        fade(audio, 0.0004, 0.01)
        return normalize(audio, 0.8)
    if kind == "clap":
        n = int(0.28 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        noise = rng.uniform(-1, 1, n).astype(np.float32)
        audio = np.zeros(n, dtype=np.float32)
        for offset, amp in ((0.0, 1.0), (0.012, 0.7), (0.021 + variant * 0.002, 0.45)):
            shift = int(offset * SR)
            audio[shift:] += noise[: n - shift] * amp
        audio *= np.exp(-t * 14)
        fade(audio, 0.0005, 0.02)
        return normalize(audio, 0.84)
    n = int(0.2 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    audio = rng.uniform(-1, 1, n).astype(np.float32) * np.exp(-t * 16)
    fade(audio, 0.001, 0.015)
    return normalize(audio, 0.6)


def synth_bass(midi: int, seconds: float = 0.55, saw: bool = False) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = midi_hz(midi) * (1 + 0.35 * np.exp(-t * 26))
    phase = np.cumsum(2 * np.pi * freq / SR).astype(np.float32)
    if saw:
        osc = np.sin(phase) + 0.45 * np.sin(2 * phase) + 0.22 * np.sin(3 * phase) + 0.1 * np.sin(4 * phase)
    else:
        osc = np.sin(phase) + 0.18 * np.sin(2 * phase)
    audio = osc.astype(np.float32) * env_ar(n, 80, 3.4 if not saw else 4.2)
    fade(audio, 0.001, 0.02)
    return normalize(audio, 0.84)


def synth_ep(midi: int, seconds: float = 0.85) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = midi_hz(midi)
    mod = np.sin(2 * np.pi * freq * 2 * t) * 2.2 * np.exp(-t * 6)
    carrier = np.sin(2 * np.pi * freq * t + mod)
    body = 0.28 * np.sin(2 * np.pi * freq * t)
    audio = (carrier + body).astype(np.float32) * env_ar(n, 200, 2.4)
    fade(audio, 0.001, 0.03)
    return normalize(audio, 0.78)


def synth_pluck(midi: int, seconds: float = 0.7) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = midi_hz(midi)
    audio = np.zeros(n, dtype=np.float32)
    for h in range(1, 12):
        audio += np.sin(2 * np.pi * freq * h * t).astype(np.float32) * (0.55 / h) * np.exp(-t * (3 + h))
    audio *= env_ar(n, 400, 1.2)
    fade(audio, 0.001, 0.03)
    return normalize(audio, 0.75)


def synth_chord(midis: list[int], seconds: float = 0.55) -> np.ndarray:
    n = int(seconds * SR)
    audio = np.zeros(n, dtype=np.float32)
    for midi in midis:
        hit = synth_ep(midi, seconds)
        audio[: len(hit)] += hit[:n] * np.float32(0.72)
    fade(audio, 0.002, 0.03)
    return normalize(audio, 0.8)


VOWELS = {
    "ah": [(730, 90, 1.0), (1090, 110, 0.55), (2440, 170, 0.25)],
    "eh": [(530, 80, 1.0), (1840, 140, 0.5), (2480, 160, 0.22)],
    "ee": [(270, 60, 0.7), (2290, 140, 1.0), (3010, 180, 0.35)],
    "oh": [(570, 80, 1.0), (840, 90, 0.45), (2410, 160, 0.18)],
    "oo": [(300, 60, 1.0), (870, 100, 0.28), (2240, 150, 0.12)],
}


def synth_vocal(vowel: str, midi: int, seconds: float = 0.38) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f0 = midi_hz(midi)
    audio = np.zeros(n, dtype=np.float32)
    formants = VOWELS[vowel]
    harmonic = 1
    while harmonic * f0 < 4500 and harmonic < 48:
        freq = harmonic * f0
        gain = 0.0
        for center, width, amp in formants:
            gain += amp * np.exp(-0.5 * ((freq - center) / width) ** 2)
        if gain > 0.02:
            audio += np.sin(2 * np.pi * freq * t + harmonic * 0.35).astype(np.float32) * np.float32(gain / harmonic ** 0.35)
        harmonic += 1
    audio *= env_ar(n, 120, 6.5)
    fade(audio, 0.004, 0.03)
    return normalize(audio, 0.72)


def synth_fx(kind: str, index: int) -> np.ndarray:
    rng = np.random.default_rng(400 + index * 13)
    if kind == "rise":
        seconds = 1.2 + (index % 3) * 0.5
        n = int(seconds * SR)
        t = np.linspace(0, 1, n, dtype=np.float32)
        noise = rng.uniform(-1, 1, n).astype(np.float32)
        coeff = 0.02 + 0.6 * (t ** 2)
        low = np.zeros(n, dtype=np.float32)
        acc = 0.0
        for i, sample in enumerate(noise):
            acc += float(coeff[i]) * (float(sample) - acc)
            low[i] = acc
        audio = low * (t ** 1.6)
        fade(audio, 0.01, 0.03)
        return normalize(audio, 0.62)
    if kind == "down":
        seconds = 0.8 + index * 0.15
        n = int(seconds * SR)
        t = np.arange(n, dtype=np.float32) / SR
        freq = 800 * np.exp(-t * (3 + index * 0.3)) + 50
        phase = np.cumsum(2 * np.pi * freq / SR)
        audio = np.sin(phase).astype(np.float32) * np.exp(-t * 1.4)
        fade(audio, 0.002, 0.04)
        return normalize(audio, 0.7)
    if kind == "zap":
        n = int((0.25 + index * 0.04) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        freq = (180 + index * 40) * np.exp(t * 18)
        phase = np.cumsum(2 * np.pi * np.clip(freq, 40, 8000) / SR)
        audio = np.sin(phase).astype(np.float32) * np.exp(-t * 10)
        fade(audio, 0.001, 0.015)
        return normalize(audio, 0.7)
    if kind == "impact":
        n = int((0.55 + index * 0.08) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        noise = rng.uniform(-1, 1, n).astype(np.float32) * np.exp(-t * (6 + index))
        boom = np.sin(2 * np.pi * (70 - index * 4) * t).astype(np.float32) * np.exp(-t * 4)
        audio = noise * 0.45 + boom
        fade(audio, 0.001, 0.04)
        return normalize(audio, 0.85)
    if kind == "drop":
        n = int(0.7 * SR)
        t = np.arange(n, dtype=np.float32) / SR
        freq = (90 + index * 8) * np.exp(-t * 8) + 28
        phase = np.cumsum(2 * np.pi * freq / SR)
        audio = np.sin(phase).astype(np.float32) * np.exp(-t * 3.2)
        fade(audio, 0.001, 0.03)
        return normalize(audio, 0.88)
    if kind == "noise":
        n = int((0.2 + index * 0.05) * SR)
        t = np.arange(n, dtype=np.float32) / SR
        audio = rng.uniform(-1, 1, n).astype(np.float32) * np.exp(-t * (12 - index))
        fade(audio, 0.001, 0.02)
        return normalize(audio, 0.55)
    n = int(0.9 * SR)
    t = np.linspace(1, 0, n, dtype=np.float32)
    noise = rng.uniform(-1, 1, n).astype(np.float32)
    audio = noise * (t ** 1.4)
    fade(audio, 0.01, 0.02)
    return normalize(audio, 0.5)


def synth_ambience(kind: str, index: int, seconds: float = 3.2) -> np.ndarray:
    rng_l = np.random.default_rng(800 + index)
    rng_r = np.random.default_rng(900 + index)
    n = int(seconds * SR)
    t = np.arange(n, dtype=np.float32) / SR
    left = rng_l.uniform(-1, 1, n).astype(np.float32)
    right = rng_r.uniform(-1, 1, n).astype(np.float32)
    if kind == "drone":
        freq = 55 * (1.5 ** (index % 4))
        tone_l = 0.6 * np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 1.5 * t)
        tone_r = 0.6 * np.sin(2 * np.pi * freq * 1.003 * t) + 0.2 * np.sin(2 * np.pi * freq * 2 * t)
        left = left * 0.05 + tone_l.astype(np.float32)
        right = right * 0.05 + tone_r.astype(np.float32)
    elif kind == "hum":
        left = np.sin(2 * np.pi * 60 * t).astype(np.float32) * 0.2 + left * 0.02
        right = np.sin(2 * np.pi * 120 * t).astype(np.float32) * 0.08 + right * 0.02
    else:
        # one-pole lowpass noise, slightly different per channel
        coeff = {"air": 0.08, "rain": 0.22, "rumble": 0.015, "wind": 0.05, "sea": 0.03, "room": 0.04, "crackle": 0.35, "night": 0.025}[kind]
        for channel, noise in ((left, left), (right, right)):
            acc = 0.0
            for i, sample in enumerate(noise):
                acc += coeff * (float(sample) - acc)
                channel[i] = acc
        if kind == "crackle":
            spikes = rng_l.random(n) > 0.997
            left[spikes] += rng_l.uniform(-0.8, 0.8, int(spikes.sum())).astype(np.float32)
            spikes_r = rng_r.random(n) > 0.997
            right[spikes_r] += rng_r.uniform(-0.8, 0.8, int(spikes_r.sum())).astype(np.float32)
    edge = np.minimum(1, t / 0.25) * np.minimum(1, (seconds - t) / 0.3)
    stereo = np.stack([left * edge, right * edge], axis=1).astype(np.float32)
    peak = float(np.max(np.abs(stereo))) or 1
    return stereo * (0.45 / peak)


def synth_pad(midis: list[int], frames: int) -> np.ndarray:
    left = np.zeros(frames, dtype=np.float32)
    right = np.zeros(frames, dtype=np.float32)
    t = np.arange(frames, dtype=np.float32) / SR
    edge = np.minimum(1, t / 0.35) * np.minimum(1, (frames / SR - t) / 0.35)
    for index, midi in enumerate(midis):
        freq = midi_hz(midi)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 4.5 * t)
        left += np.sin(2 * np.pi * freq * vib * t).astype(np.float32)
        right += np.sin(2 * np.pi * freq * (1.004 if index % 2 == 0 else 0.996) * vib * t).astype(np.float32)
    stereo = np.stack([left, right], axis=1) * edge[:, None] * np.float32(0.18)
    peak = float(np.max(np.abs(stereo))) or 1
    return (stereo * (0.72 / peak)).astype(np.float32)


def mix_at(buf: np.ndarray, hit: np.ndarray, pos: int, gain: float) -> None:
    if len(hit) == 0 or gain == 0:
        return
    if pos < 0:
        hit = hit[-pos:]
        pos = 0
    if pos >= len(buf):
        return
    n = min(len(hit), len(buf) - pos)
    buf[pos : pos + n] += hit[:n] * np.float32(gain)


def loop_frames(bars: float, bpm: int) -> int:
    return int(round(SR * bars * 4 * 60 / bpm))


def step_at(step: float, bars: int, frames: int) -> int:
    sixteenths = bars * 16
    return int(round(step / sixteenths * frames))


def limit(buf: np.ndarray, ceiling: float = 0.95) -> np.ndarray:
    peak = float(np.max(np.abs(buf))) if buf.size else 0
    if peak <= ceiling or peak == 0:
        return buf
    return (buf * (ceiling / peak)).astype(np.float32)


def add_entry(catalog: list[dict], written: set[Path], sources: list[dict], **entry: object) -> None:
    catalog.append(entry)
    written.add(OUT / str(entry["file"]))
    if entry.get("source"):
        sources.append(
            {
                "file": entry["file"],
                "name": entry["name"],
                "source": entry["source"],
            }
        )


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    print("listing Virtuosity Drums…")
    try:
        flacs = remote_flacs()
    except Exception as error:
        print(f"warning: could not list Virtuosity Drums ({error})")
        flacs = []

    jobs: list[tuple[str, tuple]] = []
    for spec in DRUMS:
        folder, prefix, seconds, stem, pretty, canon_id, canon_name = spec
        matches = [path for path in flacs if path.startswith(folder + "/") and Path(path).name.startswith(prefix + "_vl")]
        takes = choose_takes(matches, prefix)
        if not takes:
            print(f"missing takes for {prefix}")
            continue
        labels = VEL_LABELS[len(takes)]
        canon_index = labels.index("med") if "med" in labels else len(takes) // 2
        for index, (velocity, remote) in enumerate(takes):
            label = labels[index]
            if index == canon_index and canon_id:
                sample_id, name = canon_id, canon_name or pretty
            else:
                sample_id = f"{stem}-{label}" if label else stem
                name = f"{pretty} · {label}" if label else pretty
            jobs.append((remote, (sample_id, name, seconds, velocity, remote)))

    print(f"downloading {len(jobs)} Virtuosity one-shots…")
    paths: dict[str, Path] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        future_map = {pool.submit(download_one, remote): remote for remote, _meta in jobs}
        for future in as_completed(future_map):
            remote = future_map[future]
            try:
                paths[remote] = future.result()
            except Exception as error:
                print(f"download failed {remote}: {error}")

    recorded: dict[str, np.ndarray] = {}
    catalog: list[dict] = []
    written: set[Path] = set()
    sources: list[dict] = []

    for remote, (sample_id, name, seconds, velocity, source) in jobs:
        local = paths.get(remote)
        if local is None:
            continue
        audio = trim(ffmpeg_mono(local), seconds)
        rel = f"drums/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        recorded[sample_id] = audio
        add_entry(
            catalog,
            written,
            sources,
            id=sample_id,
            name=name,
            category="Drums",
            kind="oneshot",
            file=rel,
            bpm=None,
            bars=None,
            credit="virtuosity",
            source=source,
            velocity=velocity,
        )
        print(f"vd {sample_id}")

    def need(sample_id: str, fallback: np.ndarray) -> np.ndarray:
        return recorded.get(sample_id, fallback)

    kick = need("kick", synth_kick())
    snare = need("snare", synth_snare())
    hat = need("hat", synth_hat())
    hat_open = need("hat-open", synth_hat(open_hat=True, seed=9))
    stick = need("stick", synth_perc("rim-click", 1))
    rim = need("rim", synth_perc("clave", 2))
    tom_lo = need("tom-lo", synth_perc("conga", 1))
    tom_hi = need("tom-hi", synth_perc("bongo", 1))
    ride = need("ride", synth_perc("triangle", 1))

    # Original electronic drum layer, CC0, so the kit is useful without only acoustic hits.
    electro: dict[str, np.ndarray] = {}
    for index, pitch in enumerate((48, 56, 64, 72)):
        audio = synth_kick(pitch, 0.36 + index * 0.02, seed=20 + index)
        sample_id = f"electro-kick-{index + 1}"
        rel = f"drums/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        electro[sample_id] = audio
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Electro kick {index + 1}", category="Drums", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
    for index, tone in enumerate((160, 190, 220, 260)):
        audio = synth_snare(0.3, tone, seed=30 + index)
        sample_id = f"electro-snare-{index + 1}"
        rel = f"drums/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Electro snare {index + 1}", category="Drums", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
    for index in range(4):
        audio = synth_hat(0.08 + index * 0.02, seed=40 + index, open_hat=False)
        sample_id = f"electro-hat-{index + 1}"
        rel = f"drums/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Electro hat {index + 1}", category="Drums", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
        audio = synth_hat(open_hat=True, seed=50 + index)
        sample_id = f"electro-open-{index + 1}"
        rel = f"drums/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Electro open hat {index + 1}", category="Drums", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )

    perc_kinds = [
        ("shaker", "Shaker", "shaker"),
        ("cabasa", "Cabasa", None),
        ("maracas", "Maracas", None),
        ("clave", "Clave", None),
        ("wood-hi", "Woodblock high", None),
        ("wood-lo", "Woodblock low", None),
        ("rim-click", "Rim click", None),
        ("cowbell", "Cowbell", None),
        ("agogo-hi", "Agogo high", None),
        ("agogo-lo", "Agogo low", None),
        ("conga", "Conga", None),
        ("conga-slap", "Conga slap", None),
        ("bongo", "Bongo", None),
        ("tamb", "Tambourine", None),
        ("triangle", "Triangle", None),
        ("guiro", "Guiro", None),
        ("snap", "Finger snap", None),
        ("clap", "Clap", None),
    ]
    perc_audio: dict[str, np.ndarray] = {}
    for kind, pretty, legacy in perc_kinds:
        for variant in (1, 2, 3):
            audio = synth_perc(kind, variant)
            if legacy and variant == 2:
                sample_id = legacy
                name = pretty
            else:
                sample_id = f"{kind}-{variant}"
                name = f"{pretty} {variant}"
            rel = f"perc/{sample_id}.wav"
            write_wav(OUT / rel, audio)
            perc_audio[sample_id] = audio
            add_entry(
                catalog, written, sources,
                id=sample_id, name=name, category="Perc", kind="oneshot",
                file=rel, bpm=None, bars=None, credit="original", source=None,
            )
    shaker = perc_audio["shaker"]

    bass_legacy = {36: ("bass-c", "Bass C"), 39: ("bass-eb", "Bass Eb"), 41: ("bass-f", "Bass F"), 43: ("bass-g", "Bass G"), 34: ("bass-bb", "Bass Bb")}
    bass_notes: dict[int, np.ndarray] = {}
    for midi in range(28, 53):
        audio = synth_bass(midi, 0.55, saw=False)
        bass_notes[midi] = audio
        if midi in bass_legacy:
            sample_id, name = bass_legacy[midi]
        else:
            sample_id = f"sub-{note_name(midi).lower().replace('#', 's')}"
            name = f"Sub {note_name(midi)}"
        rel = f"bass/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="Bass", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
    for midi in range(36, 61):
        audio = synth_bass(midi, 0.48, saw=True)
        sample_id = f"saw-{note_name(midi).lower().replace('#', 's')}"
        rel = f"bass/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Saw {note_name(midi)}", category="Bass", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )

    key_legacy = {60: ("key-c", "Key C"), 63: ("key-eb", "Key Eb"), 67: ("key-g", "Key G"), 70: ("key-bb", "Key Bb")}
    for midi in range(48, 85):
        audio = synth_ep(midi, 0.8)
        if midi in key_legacy:
            sample_id, name = key_legacy[midi]
        else:
            sample_id = f"ep-{note_name(midi).lower().replace('#', 's')}"
            name = f"EP {note_name(midi)}"
        rel = f"keys/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="Keys", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
    for midi in range(48, 73):
        audio = synth_pluck(midi, 0.62)
        sample_id = f"pluck-{note_name(midi).lower().replace('#', 's')}"
        rel = f"keys/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=f"Pluck {note_name(midi)}", category="Keys", kind="oneshot",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )

    chord_roots = [48, 50, 52, 53, 55, 57, 59, 60]
    for root in chord_roots:
        for quality, intervals, label in (
            ("maj", (0, 4, 7), "maj"),
            ("min", (0, 3, 7), "min"),
        ):
            audio = synth_chord([root + step for step in intervals], 0.5)
            sample_id = f"chord-{note_name(root).lower().replace('#', 's')}-{label}"
            name = f"Chord {note_name(root)} {label}"
            if root == 60 and quality == "maj":
                sample_id, name = "chord", "Chord stab"
            rel = f"keys/{sample_id}.wav"
            write_wav(OUT / rel, audio)
            add_entry(
                catalog, written, sources,
                id=sample_id, name=name, category="Keys", kind="oneshot",
                file=rel, bpm=None, bars=None, credit="original", source=None,
            )

    vowels = ["ah", "eh", "ee", "oh", "oo"]
    vocal_notes = [48, 50, 52, 53, 55, 57, 59, 60]
    for vowel in vowels:
        for midi in vocal_notes:
            audio = synth_vocal(vowel, midi, 0.36)
            sample_id = f"vox-{vowel}-{note_name(midi).lower().replace('#', 's')}"
            rel = f"vocal/{sample_id}.wav"
            write_wav(OUT / rel, audio)
            add_entry(
                catalog, written, sources,
                id=sample_id, name=f"Formant {vowel} {note_name(midi)}", category="Vocal", kind="oneshot",
                file=rel, bpm=None, bars=None, credit="original", source=None,
            )

    fx_plan = (
        [("rise", i) for i in range(4)]
        + [("down", i) for i in range(4)]
        + [("zap", i) for i in range(6)]
        + [("impact", i) for i in range(6)]
        + [("drop", i) for i in range(4)]
        + [("noise", i) for i in range(4)]
        + [("reverse", i) for i in range(4)]
    )
    for kind, index in fx_plan:
        audio = synth_fx(kind, index)
        if kind == "rise" and index == 1:
            sample_id, name = "rise", "Rise"
        else:
            sample_id = f"{kind}-{index + 1}"
            name = f"{kind.title()} {index + 1}"
        rel = f"fx/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="FX", kind="oneshot",
            file=rel, bpm=100 if sample_id == "rise" else None,
            bars=1 if sample_id == "rise" else None, credit="original", source=None,
        )

    ambience_plan = [
        ("air", "Air"),
        ("rain", "Rain"),
        ("rumble", "Rumble"),
        ("wind", "Wind"),
        ("sea", "Sea"),
        ("room", "Room"),
        ("crackle", "Crackle"),
        ("night", "Night"),
        ("hum", "Hum"),
        ("drone", "Drone low"),
        ("drone", "Drone mid"),
        ("drone", "Drone high"),
    ]
    for index, (kind, pretty) in enumerate(ambience_plan):
        audio = synth_ambience(kind, index, 3.0)
        sample_id = f"amb-{kind}-{index}"
        rel = f"ambience/{sample_id}.mp3"
        write_mp3(OUT / rel, audio, "64k")
        add_entry(
            catalog, written, sources,
            id=sample_id, name=pretty, category="Ambience", kind="loop",
            file=rel, bpm=None, bars=None, credit="original", source=None,
        )
    wash_frames = loop_frames(2, 100)
    wash = synth_ambience("air", 21, wash_frames / SR)
    write_mp3(OUT / "ambience/wash.mp3", wash, "80k")
    add_entry(
        catalog, written, sources,
        id="wash", name="Wash", category="Ambience", kind="loop",
        file="ambience/wash.mp3", bpm=100, bars=2, credit="original", source=None,
    )

    def groove(pattern: str, bpm: int) -> np.ndarray:
        frames = loop_frames(2, bpm)
        buf = np.zeros(frames, dtype=np.float32)
        swing = 0.58 if pattern == "shuffle" else 0.5

        def pos(step: float) -> int:
            beat = step / 4
            whole = np.floor(beat)
            frac = beat - whole
            if pattern == "shuffle" and frac >= 0.5:
                beat = whole + swing
            return int(round(beat / 8 * frames))

        if pattern == "house":
            for step in range(0, 32, 4):
                mix_at(buf, kick, pos(step), 0.95)
                mix_at(buf, hat, pos(step), 0.34)
                mix_at(buf, hat, pos(step + 2), 0.26)
            for step in (4, 12, 20, 28):
                mix_at(buf, snare, pos(step), 0.78)
            for step in (14, 30):
                mix_at(buf, hat_open, pos(step), 0.4)
            for step in (6, 22):
                mix_at(buf, stick, pos(step), 0.28)
        elif pattern == "halftime":
            for step in (0, 10, 16, 26):
                mix_at(buf, kick, pos(step), 0.92)
            for step in (8, 24):
                mix_at(buf, snare, pos(step), 0.84)
            for step in range(0, 32, 2):
                mix_at(buf, hat, pos(step), 0.3)
            for step in (14, 30):
                mix_at(buf, hat_open, pos(step), 0.36)
        elif pattern == "break":
            for step in (0, 3, 6, 10, 16, 22, 26):
                mix_at(buf, kick, pos(step), 0.9)
            for step in (4, 12, 20, 28):
                mix_at(buf, snare, pos(step), 0.8)
            for step in range(0, 32, 2):
                mix_at(buf, hat, pos(step), 0.28)
            mix_at(buf, tom_hi, pos(14), 0.4)
            mix_at(buf, tom_lo, pos(15), 0.45)
        else:
            for step in (0, 8, 16, 24):
                mix_at(buf, kick, pos(step), 0.9)
            for step in (4, 12, 20, 28):
                mix_at(buf, snare, pos(step), 0.75)
            for step in range(0, 32):
                mix_at(buf, ride if step % 2 == 0 else hat, pos(step), 0.22)
            mix_at(buf, hat_open, pos(14), 0.3)
        return limit(buf)

    legacy_loops = {
        ("house", 100): ("house", "House groove"),
        ("halftime", 100): ("halftime", "Half-time"),
    }
    for pattern in ("house", "halftime", "break", "shuffle"):
        for bpm in BPMS:
            audio = groove(pattern, bpm)
            if (pattern, bpm) in legacy_loops:
                sample_id, name = legacy_loops[(pattern, bpm)]
            else:
                sample_id = f"loop-{pattern}-{bpm}"
                name = f"{pattern.title()} {bpm}"
            rel = f"loops/{sample_id}.wav"
            write_wav(OUT / rel, audio)
            add_entry(
                catalog, written, sources,
                id=sample_id, name=name, category="Loops", kind="loop",
                file=rel, bpm=bpm, bars=2, credit="original" if sample_id.startswith("loop-") and pattern == "shuffle" else ("virtuosity" if pattern != "shuffle" else "original"),
                source=None,
            )

    recorded_hits = "kick" in recorded and "snare" in recorded
    for entry in catalog:
        if entry["category"] != "Loops":
            continue
        sample_id = str(entry["id"])
        if sample_id.startswith("loop-shuffle") or sample_id.startswith("perc-") or sample_id.startswith("bass-") or sample_id.startswith("pad"):
            entry["credit"] = "original"
        elif sample_id.startswith("loop-") or sample_id in {"house", "halftime"}:
            entry["credit"] = "virtuosity" if recorded_hits else "original"

    for bpm in BPMS:
        frames = loop_frames(2, bpm)
        buf = np.zeros(frames, dtype=np.float32)
        for step in range(0, 32, 2):
            mix_at(buf, shaker, step_at(step, 2, frames), 0.5)
        for step in (0, 3, 6, 10, 12, 16, 19, 22, 26, 28):
            mix_at(buf, stick, step_at(step, 2, frames), 0.65)
        for step in (0, 16):
            mix_at(buf, tom_lo, step_at(step, 2, frames), 0.5)
        for step in (6, 14, 22, 30):
            mix_at(buf, perc_audio.get("conga-2", tom_hi), step_at(step, 2, frames), 0.45)
        for step in (4, 12, 20, 28):
            mix_at(buf, rim, step_at(step, 2, frames), 0.4)
        audio = limit(buf)
        if bpm == 100:
            sample_id, name = "perc-loop", "Perc loop"
        else:
            sample_id, name = f"perc-loop-{bpm}", f"Perc loop {bpm}"
        rel = f"loops/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="Loops", kind="loop",
            file=rel, bpm=bpm, bars=2,
            credit="virtuosity" if ("stick" in recorded or "tom-lo" in recorded) else "original",
            source=None,
        )

    pattern_notes = [36, 36, 39, 41, 43, 41, 39, 36, 34, 34, 36, 39, 41, 39, 36, 31]
    for bpm in BPMS:
        frames = loop_frames(2, bpm)
        buf = np.zeros(frames, dtype=np.float32)
        eighth = frames / 16
        for index, midi in enumerate(pattern_notes):
            hit = synth_bass(midi, 0.36, saw=False)
            mix_at(buf, hit, int(index * eighth), 0.9)
        audio = limit(buf)
        if bpm == 100:
            sample_id, name = "bass-loop", "Bass loop"
        else:
            sample_id, name = f"bass-loop-{bpm}", f"Bass loop {bpm}"
        rel = f"loops/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="Loops", kind="loop",
            file=rel, bpm=bpm, bars=2, credit="original", source=None,
        )

    for bpm in BPMS:
        frames = loop_frames(2, bpm)
        audio = synth_pad([48, 51, 55, 58, 62], frames)
        if bpm == 100:
            sample_id, name = "pad", "Pad loop"
        else:
            sample_id, name = f"pad-{bpm}", f"Pad loop {bpm}"
        rel = f"loops/{sample_id}.wav"
        write_wav(OUT / rel, audio)
        add_entry(
            catalog, written, sources,
            id=sample_id, name=name, category="Loops", kind="loop",
            file=rel, bpm=bpm, bars=2, credit="original", source=None,
        )

    order = {"Drums": 0, "Perc": 1, "Bass": 2, "Keys": 3, "Vocal": 4, "FX": 5, "Ambience": 6, "Loops": 7}
    catalog.sort(key=lambda item: (order.get(str(item["category"]), 9), str(item["name"]).lower()))

    # Drop internal-only keys from the shipped catalog.
    public = []
    for entry in catalog:
        public.append({key: entry[key] for key in ("id", "name", "category", "kind", "file", "bpm", "bars", "credit")})

    payload = {
        "name": "RS-4 Session Kit",
        "license": "CC0-1.0",
        "defaultBpm": 100,
        "samples": public,
    }
    (OUT / "catalog.json").write_text(json.dumps(payload, indent=2) + "\n")

    removed = 0
    for path in OUT.rglob("*"):
        if path.suffix.lower() in {".wav", ".mp3", ".ogg"} and path.resolve() not in {item.resolve() for item in written}:
            path.unlink()
            removed += 1

    total = sum(path.stat().st_size for path in written)
    write_attribution(public, sources, total)
    print(f"removed {removed} stale files")
    print(f"total {total} bytes ({total / 1_000_000:.2f} MB) across {len(public)} files")
    ids = [entry["id"] for entry in public]
    files = [entry["file"] for entry in public]
    if len(ids) != len(set(ids)):
        raise SystemExit(f"duplicate sample ids: {sorted({item for item in ids if ids.count(item) > 1})}")
    if len(files) != len(set(files)):
        raise SystemExit("duplicate sample files")
    if len(public) < 200:
        raise SystemExit(f"expected at least 200 samples, got {len(public)}")
    if total > 40_000_000:
        raise SystemExit(f"library is {total / 1_000_000:.1f} MB, over the 40 MB ceiling")


def write_attribution(catalog: list[dict], sources: list[dict], total: int) -> None:
    counts: dict[str, int] = {}
    for entry in catalog:
        counts[entry["category"]] = counts.get(entry["category"], 0) + 1
    lines = [
        "# RS-4 Session Kit",
        "",
        f"Playable library shipped with this console: **{len(catalog)}** files, about **{total / 1_000_000:.1f} MB**.",
        "Everything here is **CC0 1.0** (public domain dedication). You can use it commercially, including redistributing it in this app.",
        "",
        "No commercial drum kits, stock vocal recordings, or copyrighted material are included.",
        "Musical one-shots and loops are 16-bit WAV at 22.05 kHz so the transient stays at the start of the file.",
        "Ambience beds are short MP3s. The browser only fetches a file when you preview, place, or trigger it.",
        "",
        "Rebuild with `python3 scripts/build-library.py` (Python 3, numpy, ffmpeg, and network access to the Virtuosity Drums repository).",
        "`python3 scripts/build-session-kit.py` runs the same builder.",
        "",
        "## Categories",
        "",
        "| Category | Count | What it is |",
        "| --- | ---: | --- |",
    ]
    blurbs = {
        "Drums": "Virtuosity Drums house-kit one-shots plus a small original electro layer",
        "Perc": "Original synthesized hand percussion",
        "Bass": "Original sub and saw bass notes",
        "Keys": "Original electric-piano, pluck, and chord stabs",
        "Vocal": "Original formant synthesis (not a recorded voice)",
        "FX": "Original rises, downs, impacts, zaps, drops, and noise hits",
        "Ambience": "Original noise beds and drones",
        "Loops": "Two-bar grooves at 80–140 BPM",
    }
    for category in ("Drums", "Perc", "Bass", "Keys", "Vocal", "FX", "Ambience", "Loops"):
        lines.append(f"| {category} | {counts.get(category, 0)} | {blurbs[category]} |")
    lines += [
        "",
        "## Virtuosity Drums excerpts (recorded)",
        "",
        "These one-shots are trimmed mono excerpts of [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) by Versilian Studios.",
        "The performances are by drummer Austin McMahon on the house kit at Virtuosity Musical Instruments in Boston.",
        "The upstream library is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).",
        "",
        "Only the close, mid, overhead, and lofi mics of that house kit are used (kick, snare, hats, toms, ride, crash, flat ride).",
        "Auxiliary percussion packs that the upstream README attributes to VSCO 2 Pro or Karoryfer are not included.",
        "Round-robins are reduced to a single take per velocity, and only a spread of velocities is shipped.",
        "Files are trimmed to the hit and normalized.",
        "",
        "| Shipped file | Source recording |",
        "| --- | --- |",
    ]
    for item in sources:
        lines.append(f"| `{item['file']}` | `{item['source']}` ({item['name']}) |")
    lines += [
        "",
        "House, half-time, and break loops sequence those recorded hits at 80, 90, 100, 110, 120, 128, and 140 BPM.",
        "They are CC0 as derivatives of CC0 material.",
        "Percussion loops mix those hits with original shaker and conga synthesis when the recorded takes are present.",
        "Shuffle, bass, and pad loops are original synthesis.",
        "",
        "## Original synthesis (CC0)",
        "",
        "Written for this project and dedicated to the public domain under CC0 1.0 by the maintainer of this repository.",
        "",
        "- Electro kicks, snares, and hats in `drums/electro-*.wav`",
        "- Hand percussion in `perc/` (shaker, cabasa, maracas, clave, woodblocks, cowbell, agogo, conga, bongo, tambourine, triangle, guiro, snap, clap), three variants each",
        "- Sub bass `bass/sub-*.wav` and `bass/c.wav`, `eb`, `f`, `g`, `bb` (MIDI 28–52) plus saw bass `bass/saw-*.wav` (MIDI 36–60)",
        "- Electric piano `keys/ep-*.wav` and `keys/c.wav`, `eb`, `g`, `bb` (MIDI 48–84), plucks `keys/pluck-*.wav`, and major/minor chord stabs",
        "- Formant vocal chops `vocal/vox-*.wav` for ah, eh, ee, oh, and oo. These are additive formant synthesis, not recordings of a singer.",
        "- FX in `fx/` (rise, down, zap, impact, drop, noise, reverse)",
        "- Ambience MP3s in `ambience/` (air, rain, rumble, wind, sea, room, crackle, night, hum, drones, and `wash`)",
        "- Bass loops, pad loops, shuffle loops, and percussion loops in `loops/`",
        "",
        "Legacy ids (`kick`, `snare`, `hat`, `hat-open`, `house`, `halftime`, `stick`, `rim`, `tom-hi`, `tom-lo`, `ride`, `shaker`, `perc-loop`, `bass-c`, `bass-loop`, `key-c`, `chord`, `pad`, `rise`, `wash`) still resolve so the default pads and the previous session kit keep working.",
        "",
    ]
    (OUT / "ATTRIBUTION.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()

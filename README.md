# RS-4 Recording Studio

A browser recording console. It uses the Web Audio API for a live microphone or a built-in tone generator, a real insert chain, four overdub tracks, and 16-bit WAV download.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints. Click **Power** before using the transport.

### Without a microphone

Track 1 starts armed and the input is the tone generator.

1. Press **Power**.
2. Press **Record**, then **Stop**.
3. Press **Play**. The take comes back through the master even if the monitor is down.
4. Raise **Monitor** only when you want to hear the live chain. It starts at -inf so a microphone cannot feed back into the speakers.

### With a microphone

1. Press **Enable microphone** and accept the browser prompt.
2. Watch the input meter and raise **Pre** if the source is quiet.
3. Leave **Monitor** down unless you are wearing headphones.
4. Arm a track and press **Record**. Tracks that are not armed play back underneath the new take.

Space plays or stops. R records. Shift-drag a knob for a finer change. Double-click a knob or fader to reset it.

Check the project with:

```bash
npm run build
```

## Microphone permission

`getUserMedia` only works in a secure context (this dev server, or HTTPS). If you deny the prompt, no device is plugged in, or another app already holds the mic, the console stays up and explains which case it hit. Switch the input to **Tone** or **Mic + tone** and keep working.

**Browser voice processing** (echo cancellation, noise suppression, auto gain) is on by default. Turn it off and enable the mic again for a drier signal. Do that with headphones if the monitor is up.

## Signal flow

```
mic and/or tone
  -> preamp -> input meter -> high-pass -> polarity
  -> low shelf -> mid peak -> high shelf
  -> gate (AudioWorklet) -> compressor -> makeup
  -> channel fader -> pan
       |-> record tap --------> armed tracks (printed)
       |-> monitor (default off) -> mute/solo
             |-> master sum
             |-> delay send  -> delay -> master
             |-> reverb send -> convolver -> master
playback tracks -> mute/solo -> master sum
metronome (cue only) -------> master sum
master fader -> stereo meters -> safety limiter -> mute -> speakers
```

What you record is the channel after the inserts, fader, and pan. Monitor level does not change the take, so you can record with the monitor off. Delay and reverb are monitor sends and are not in the track files. The mixdown WAV sums the printed tracks using track levels, mute, solo, and the master fader. It is scaled only if the sum would clip.

## Limits

- One browser input (the default microphone). There is no multi-interface routing.
- Output latency is the browser and device latency. Speakers plus a live monitor can howl; the monitor starts off and warns when you raise it.
- Track audio is 32-bit float in memory and 16-bit stereo PCM on disk. A few minutes on four tracks is hundreds of megabytes.
- The metronome is a cue. It is not recorded.
- Armed tracks all receive the same stereo channel. Arm state is locked while the transport is recording.
- Overdub replaces the armed tracks from the top. Other tracks play from the start in time with the new take.
- The master path includes a transparent safety limiter after the meters. It only catches overs.
- If `AudioWorklet` fails to load, the gate is bypassed and recording falls back to `ScriptProcessorNode`.
- This is a front-end app. Nothing is uploaded.

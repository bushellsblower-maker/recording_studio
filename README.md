# RS-4 Recording Studio

A browser recording console. It uses the Web Audio API for a live microphone, a built-in tone generator, or the bundled CC0 sample library, a real insert chain, eight overdub tracks, and 16-bit WAV download.

Live site: **https://recstudio.cybush.uk** (Cloudflare Worker `recording-studio`). The microphone works there because the custom domain is HTTPS.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints. Click **Power** before using the transport.

### Without a microphone

Track 1 starts armed. The tone generator is the default input, and a CC0 session kit is built in.

1. Press **Power**.
2. In the side **Browser**, click a loop to preview it, then **Load on track** or drag it onto the arrangement. The drop snaps to the beat (hold Shift for 16ths). Loops are 100 BPM and set the click to match.
3. Press **Play**. The playhead runs on the bar grid. Drag a clip to move it, or drag the ruler to set the loop. Pads quantize to the beat while the transport is running. **METRO** turns the click on; it is not recorded. The transport shows **4/4**.
4. Press **Record**, then **Stop**, to print the armed tracks. Tracks 1–4 start as audio tracks and print the channel. Tracks 5–8 start as instrument tracks and print pads and keys. **Undo** restores the previous take.
5. Raise **Monitor** only when you want to hear the live chain. It starts at -inf so a microphone cannot feed back into the speakers.

The on-screen keys (or A–K on the computer keyboard) play a simple synth through the master. Drop a WAV or MP3 on a track, or use **IMP**, to import your own audio.

### With a microphone

1. Press **Enable microphone** and accept the browser prompt.
2. Watch the input meter and raise **Pre** if the source is quiet.
3. Leave **Monitor** down unless you are wearing headphones.
4. Arm a track and press **Record**. Tracks that are not armed play back underneath the new take.

Space plays or stops. R records. A–K plays the keyboard. Shift-drag a knob for a finer change. Double-click a knob or fader to reset it. **QUANT** locks pads to the beat while play or record is running. **LOOP** repeats a bar region (1, 2, 4, or 8 bars) and, when recording, ends the take at the end of that region. The channel strip shows the insert chain: Pre, HPF, EQ, and Comp stay in the path; Gate, Delay, and Verb light up when they are in use.

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
       |-> record tap --------> armed audio tracks (printed)
       |-> monitor (default off) -> mute/solo
             |-> master sum
             |-> delay send  -> delay -> master
             |-> reverb send -> convolver -> master
playback tracks -> mute/solo -> master sum
metronome (cue only) -------> master sum
sample pads and keys -------> master sum, and armed instrument tracks while recording
master fader -> stereo meters -> safety limiter -> mute -> speakers
```

Audio tracks record the channel after the inserts, fader, and pan. Instrument tracks record pads and keys. Monitor level does not change the take, so you can record with the monitor off. Delay and reverb are monitor sends and are not in the track files. The mixdown WAV places each clip at its arrangement start, follows loop tempo, and sums the printed tracks using track levels, pan, mute, solo, and the master fader. It is scaled only if the sum would clip.

## Sample library

The playable kit lives in `public/samples/` and is served with the site. Drum one-shots are trimmed excerpts of [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (CC0) performed by Austin McMahon. The loops sequence those hits. Bass, keys, shaker, and FX are original synthesis dedicated to CC0 for this project. Names, files, and licenses are in `public/samples/ATTRIBUTION.md` and under **Sample credits** in the console. Rebuild the pack with `python3 scripts/build-session-kit.py` if you have `ffmpeg`.

## Limits

- One browser input (the default microphone). There is no multi-interface routing.
- Output latency is the browser and device latency. Speakers plus a live monitor can howl; the monitor starts off and warns when you raise it.
- Track audio is 32-bit float in memory and 16-bit stereo PCM on disk. A few minutes on eight tracks is hundreds of megabytes.
- The metronome is a cue. It is not recorded. Library loops are 100 BPM and follow the session tempo (pitch follows the click).
- Armed tracks of the same type receive the same bus. Audio tracks print the channel. Instrument tracks print pads and keys. Arm state and track type are locked while the transport is recording.
- Each track holds one clip. Drag it on the bar grid to change where it starts. **Undo** restores clips, including their start positions, from before the last record, load, import, or reset.
- **LOOP** repeats playback across the chosen bars, including clips that start inside the region. A recorded take still runs once and stops at the end of the region, and the new clip starts at the loop.
- The master path includes a transparent safety limiter after the meters. It only catches overs.
- If `AudioWorklet` fails to load, the gate is bypassed and recording falls back to `ScriptProcessorNode`.
- This is a front-end app. Nothing is uploaded.

## Deploy to recstudio.cybush.uk

Publishing is **GitHub → Cloudflare**. A push to `main` runs `.github/workflows/deploy.yml`, which builds the Vite app and runs `wrangler deploy`. `npm run build` writes static files to `dist/`. `wrangler.toml` serves that directory as Worker assets, with SPA fallback to `index.html`, `workers_dev` enabled, and this route:

```toml
[[routes]]
pattern = "recstudio.cybush.uk"
custom_domain = true
```

Worker name: `recording-studio`. Account: `f027194dcc0be7e3812e673468bab58d` (zone `cybush.uk`). No secrets are committed.

### GitHub Actions secrets

Add these repository secrets on **bushellsblower-maker/recording_studio** (Settings → Secrets and variables → Actions). The same values already exist on other Cybush repos such as shuffle and cysuite, but secrets do not carry over to this repo.

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | API token that can edit Workers scripts and attach custom domains on zone `cybush.uk` |
| `CLOUDFLARE_ACCOUNT_ID` | `f027194dcc0be7e3812e673468bab58d` |

Until both secrets exist, the publish job fails and tells you to add them. The build job on pull requests does not need them.

After the secrets are set, merge to `main` (or re-run **Actions → Publish to Cloudflare**). The live URL is https://recstudio.cybush.uk.

Local publish is not the path. `npm run deploy` builds `dist/` and runs `wrangler deploy` if you ever need it from a machine that already has those two environment variables.

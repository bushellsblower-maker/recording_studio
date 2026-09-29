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
2. In **Browser** (the Sounds tab on a phone), search or filter, tap a sound to preview it, then **Place** on the highlighted track or drag it onto the arrangement. The drop snaps to the beat (hold Shift for 16ths). Loop tempos set the click to match.
3. Press **Play**. The playhead runs on the bar grid. Drag a clip to move it. The arrangement **Play** range sets where playback starts and stops. **Loop region** repeats that span, and **Loop selection** repeats the highlighted clip. Dragging the bar ruler sets the same range. Pads quantize to the beat while the transport is running. **METRO** turns the click on; it is not recorded. The transport shows **4/4**.
4. Press **Record**, then **Stop**, to print the armed tracks. Audio 1–4 print the channel. Inst 5–8 print pads and keys. **Undo** restores the previous take.
5. Raise **Monitor** only when you want to hear the live chain. It starts at -inf so a microphone cannot feed back into the speakers.

**Perform** is the pad rack and keys. Pads start on an acoustic drum kit (kick, snare, hat, open hat, toms, crash, ride). The **Kit** menu also loads an electro kit or a percussion rack, and each pad has its own sample menu. Drop a browser sound on a pad to assign it. The **Voice** menu switches the keys between the desk synth and chromatic sample banks (EP, saw, sub, pluck, bass, keys, vox). **Browser** plays the sound selected in the library, at its own pitch on the named note and transposed from there. A–K and the on-screen keys play that voice. Velocity follows where you press a key or pad; Shift is softer. **MIDI** uses the same voice. Drop a WAV or MP3 on a track, or use **IMP**, to import your own audio.

### With a microphone

1. Press **Enable microphone** and accept the browser prompt.
2. Watch the input meter and raise **Pre** if the source is quiet.
3. Leave **Monitor** down unless you are wearing headphones.
4. Arm a track and press **Record**. Tracks that are not armed play back underneath the new take.

Space plays or stops. R records. Z undoes and Shift+Z redoes. B taps tempo. L toggles the loop. M mutes the selected track. 1–8 selects a track. A–K plays the keyboard. Shift-drag a knob for a finer change. Double-click a knob or fader to reset it. **QUANT** locks pads to the beat while play or record is running. **COUNT** gives a one-bar count-in. **PUNCH** records inside the play range and adds a one-bar pre-roll when that range starts later. **Loop region** repeats the play-from / play-to span, and recording stops at the end of that span. **All** clears the range so playback uses the whole arrangement. The channel strip shows the input insert chain: Pre, HPF, EQ, and Comp stay in the path; Gate, Delay, and Verb light up when they are in use.

**Devices** (under the arrangement, and on the Mix tab on a phone) is the per-track rack. Each track has three insert slots. The built-in devices are Channel EQ (with a curve), Compressor (gain-reduction meter), Tape, Chorus, Phaser, Utility (gain and width), and Limiter. They are original Web Audio processors, not commercial plugins. Slots can be bypassed, loaded from a preset, and dragged to reorder. Track delay and reverb sends feed the same returns as the console. Mono sums the channel. Group 1 and Group 2 mute every track assigned to that group.

**Session** holds four scene slots per track. Capture copies the arrangement clip into a slot. Launching a slot, or a whole scene, loops that clip. While the transport is running the launch waits for the next bar or beat. Arrangement returns every track to its timeline clip.

Drag a clip body to move it. Drag either edge to trim. Alt-drag an edge to set a fade. The automation lane writes volume, pan, or the first active insert's main parameter. Volume and pan ride playback and **BOUNCE**. **MARK** drops a locator. Click it to cue playback there. Alt-click removes it.

**SAVE** and **LOAD** keep the project in this browser (IndexedDB): clips, scene slots, mixer, inserts, automation, and markers. **MIX WAV** is the fast sum of the arranged clips. **BOUNCE** renders inserts, fades, sends, volume and pan automation, and the master. **STEMS** downloads each clip through its inserts, fades, level, and pan, without the returns.

### Desk layout

From about 900px up, the desk is one surface. The header and transport pack left to right: name, mic, clock, master meters, power, then record, loop, count-in, punch, snap, zoom, click, and project commands. Empty space is not used to center the clock. Browser starts in the left column. Arrangement, devices, console, and pads stack on the right. Each section title has a dotted grip: drag it to change the order, or into the other column. The bars between sections resize that column or those two heights. Double-click a bar to reset that size. **Reset layout**, in the shortcut footer, restores the original slots. Sizes and order are stored in this browser (`localStorage`), separate from **SAVE** / **LOAD**, and come back on refresh. Hide / Show still collapses a section. Dragging a resize bar changes that section’s height or width, and the lanes, meters, pads, and device cards reflow to the new size. The page scrolls once if the desk is taller than the window. The sample list is the only scroller inside a section: a taller browser shows more of that list. Console and Arrange are not sideways-scrolled strips. The layout does not turn into the phone stack between 900px and a wide monitor. **SNAP 1** edits on the beat; **SNAP 16** edits on sixteenths. Shift flips that grid. Zoom changes how many bars the lanes show without scrolling the console sideways.

Below 900px the phone layout docks the transport and switches the main pane with **Arrange**, **Mix**, **Sounds**, and **Play**. Section grips and splitters are hidden there so they do not fight the tabs. Arrange scrolls the lanes. Mix shows the devices, the inserts, and the level/pan strips. Sounds is the searchable library. Play is the pads and keys. Those controls are buttons, not hover-only actions.

The first-run strip (Pick a sound, Place it, Arm and record, Mix and bounce) jumps to the matching zone. Hide dismisses it on this browser.

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
playback tracks -> inserts -> fader -> pan -> mute/solo -> master sum
             |-> delay send and reverb send -> the same returns
metronome (cue only) -------> master sum
sample pads and keys -------> master sum, and armed instrument tracks while recording
master fader -> stereo meters -> safety limiter -> mute -> speakers
```

Audio tracks record the channel after the inserts, fader, and pan. Instrument tracks record pads and keys. Monitor level does not change the take, so you can record with the monitor off. Delay and reverb are monitor sends and are not in the track files. The mixdown WAV places each clip at its arrangement start, follows loop tempo, and sums the printed tracks using track levels, pan, mute, solo, and the master fader. It is scaled only if the sum would clip.

## Sample library

The playable kit lives in `public/samples/` and is served with the site. The current pack is 442 CC0 sounds, about 20 MB. `catalog.json` is the index. Audio files load only when you preview, place, or trigger them. The browser can search, filter by category, hits versus loops, and BPM, and it can star favorites in this browser.

Recorded drums are trimmed excerpts of [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (CC0) performed by Austin McMahon. House, half-time, and break loops sequence those hits at several tempos. Bass, keys, hand percussion, formant vocal chops, FX, ambience, electro drums, and the remaining loops are original synthesis dedicated to CC0 for this project. The vocal chops are not a recorded singer. Names, files, and licenses are in `public/samples/ATTRIBUTION.md` and under **Sample credits** in the browser. Rebuild with `python3 scripts/build-library.py` (numpy, ffmpeg, and network access to the Virtuosity repository). `scripts/build-session-kit.py` runs that same builder.

## Limits

- One browser input (the default microphone). There is no multi-interface routing.
- Output latency is the browser and device latency. Speakers plus a live monitor can howl; the monitor starts off and warns when you raise it.
- Track audio is 32-bit float in memory and 16-bit stereo PCM on disk. A few minutes on eight tracks is hundreds of megabytes.
- The metronome is a cue. It is not recorded. Library loops ship at 80, 90, 100, 110, 120, 128, and 140 BPM. Loading one sets the session tempo, and playback pitch follows the click.
- Armed tracks of the same type receive the same bus. Audio tracks print the channel. Instrument tracks print pads and keys. Arm state and track type are locked while the transport is recording.
- Each track holds one arrangement clip, plus four session slots. Drag the arrangement clip on the bar grid to change where it starts, trim it from either edge, or Alt-drag an edge for a fade. Undo and redo cover clip edits, markers, and scene slots (up to 32 steps). Mixer and insert tweaks are not on that stack.
- Bounce and stem export use an offline render of the current inserts. They do not print the live input console (preamp, gate, channel EQ). That chain is still what audio tracks record.
- There is no piano-roll MIDI editor, clip automation recording, multiband compressor, or third-party plugin hosting. The devices in the rack are the built-in Web Audio processors described above.
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

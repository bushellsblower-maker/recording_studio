# RS-4 Session Kit

Playable library shipped with this console: **465** files, about **31.2 MB**.
Everything here is **CC0 1.0** (public domain dedication). You can use it commercially, including redistributing it in this app.

No commercial drum kits, stock vocal recordings, or copyrighted material are included.
Musical one-shots and loops are 16-bit WAV at 22.05 kHz so the transient stays at the start of the file.
Ambience beds are short MP3s. The browser only fetches a file when you preview, place, or trigger it.

Rebuild with `python3 scripts/build-library.py` (Python 3, numpy, ffmpeg, and network access to the Virtuosity Drums repository).
`python3 scripts/build-session-kit.py` runs the same builder.

## Categories

| Category | Count | What it is |
| --- | ---: | --- |
| Drums | 126 | Virtuosity Drums house-kit one-shots plus a small original electro layer |
| Perc | 54 | Original synthesized hand percussion |
| Bass | 50 | Original sub and saw bass notes |
| Keys | 78 | Original electric-piano, pluck, and chord stabs |
| Vocal | 40 | Original formant synthesis (not a recorded voice) |
| FX | 32 | Original rises, downs, impacts, zaps, drops, and noise hits |
| Ambience | 13 | Original noise beds and drones |
| Loops | 72 | Two-bar grooves at 80–140 BPM, plus CC0 musical loops from OpenGameArt |

## Virtuosity Drums excerpts (recorded)

These one-shots are trimmed mono excerpts of [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) by Versilian Studios.
The performances are by drummer Austin McMahon on the house kit at Virtuosity Musical Instruments in Boston.
The upstream library is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Only the close, mid, overhead, and lofi mics of that house kit are used (kick, snare, hats, toms, ride, crash, flat ride).
Auxiliary percussion packs that the upstream README attributes to VSCO 2 Pro or Karoryfer are not included.
Round-robins are reduced to a single take per velocity, and only a spread of velocities is shipped.
Files are trimmed to the hit and normalized.

| Shipped file | Source recording |
| --- | --- |
| `drums/kick-snon-soft.wav` | `Samples/kickmic/kick/kickmic_kick_snon_vl1_rr1.flac` (Kick · snare on · soft) |
| `drums/kick.wav` | `Samples/kickmic/kick/kickmic_kick_snon_vl3_rr1.flac` (Kick) |
| `drums/kick-snon-hard.wav` | `Samples/kickmic/kick/kickmic_kick_snon_vl4_rr1.flac` (Kick · snare on · hard) |
| `drums/kick-snoff-soft.wav` | `Samples/kickmic/kick/kickmic_kick_snoff_vl1_rr1.flac` (Kick · snare off · soft) |
| `drums/kick-snoff-med.wav` | `Samples/kickmic/kick/kickmic_kick_snoff_vl3_rr1.flac` (Kick · snare off · med) |
| `drums/kick-snoff-hard.wav` | `Samples/kickmic/kick/kickmic_kick_snoff_vl4_rr1.flac` (Kick · snare off · hard) |
| `drums/snare-center-soft.wav` | `Samples/snaremic/snare/snaremic_snare_center_vl1.flac` (Snare · soft) |
| `drums/snare.wav` | `Samples/snaremic/snare/snaremic_snare_center_vl13.flac` (Snare) |
| `drums/snare-center-hard.wav` | `Samples/snaremic/snare/snaremic_snare_center_vl24.flac` (Snare · hard) |
| `drums/snare-center-hot.wav` | `Samples/snaremic/snare/snaremic_snare_center_vl36.flac` (Snare · hot) |
| `drums/snare-edge-soft.wav` | `Samples/snaremic/snare/snaremic_snare_offcenter_vl1.flac` (Snare edge · soft) |
| `drums/snare-edge-med.wav` | `Samples/snaremic/snare/snaremic_snare_offcenter_vl13.flac` (Snare edge · med) |
| `drums/snare-edge-hard.wav` | `Samples/snaremic/snare/snaremic_snare_offcenter_vl24.flac` (Snare edge · hard) |
| `drums/snare-edge-hot.wav` | `Samples/snaremic/snare/snaremic_snare_offcenter_vl36.flac` (Snare edge · hot) |
| `drums/snare-rim-soft.wav` | `Samples/snaremic/snare/snaremic_snare_rimshot_vl1.flac` (Rimshot · soft) |
| `drums/rim.wav` | `Samples/snaremic/snare/snaremic_snare_rimshot_vl5.flac` (Rimshot) |
| `drums/snare-rim-hard.wav` | `Samples/snaremic/snare/snaremic_snare_rimshot_vl8.flac` (Rimshot · hard) |
| `drums/snare-rim-hot.wav` | `Samples/snaremic/snare/snaremic_snare_rimshot_vl12.flac` (Rimshot · hot) |
| `drums/snare-stick-soft.wav` | `Samples/snaremic/snare/snaremic_snare_crossstick_vl1.flac` (Cross-stick · soft) |
| `drums/stick.wav` | `Samples/snaremic/snare/snaremic_snare_crossstick_vl6.flac` (Cross-stick) |
| `drums/snare-stick-hard.wav` | `Samples/snaremic/snare/snaremic_snare_crossstick_vl11.flac` (Cross-stick · hard) |
| `drums/snare-stick-hot.wav` | `Samples/snaremic/snare/snaremic_snare_crossstick_vl16.flac` (Cross-stick · hot) |
| `drums/snare-ghost-soft.wav` | `Samples/snaremic/snare/snaremic_snare_muted_vl1.flac` (Snare ghost · soft) |
| `drums/snare-ghost-med.wav` | `Samples/snaremic/snare/snaremic_snare_muted_vl6.flac` (Snare ghost · med) |
| `drums/snare-ghost-hard.wav` | `Samples/snaremic/snare/snaremic_snare_muted_vl11.flac` (Snare ghost · hard) |
| `drums/snare-ghost-hot.wav` | `Samples/snaremic/snare/snaremic_snare_muted_vl16.flac` (Snare ghost · hot) |
| `drums/snare-buzz-soft.wav` | `Samples/snaremic/snare/snaremic_snare_buzz_vl1.flac` (Snare buzz · soft) |
| `drums/snare-buzz-med.wav` | `Samples/snaremic/snare/snaremic_snare_buzz_vl5.flac` (Snare buzz · med) |
| `drums/snare-buzz-hard.wav` | `Samples/snaremic/snare/snaremic_snare_buzz_vl8.flac` (Snare buzz · hard) |
| `drums/snare-buzz-hot.wav` | `Samples/snaremic/snare/snaremic_snare_buzz_vl12.flac` (Snare buzz · hot) |
| `drums/snare-flam-soft.wav` | `Samples/snaremic/snare/snaremic_snare_flam_vl1.flac` (Snare flam · soft) |
| `drums/snare-flam-med.wav` | `Samples/snaremic/snare/snaremic_snare_flam_vl5.flac` (Snare flam · med) |
| `drums/snare-flam-hard.wav` | `Samples/snaremic/snare/snaremic_snare_flam_vl8.flac` (Snare flam · hard) |
| `drums/snare-flam-hot.wav` | `Samples/snaremic/snare/snaremic_snare_flam_vl12.flac` (Snare flam · hot) |
| `drums/snare-half-soft.wav` | `Samples/snaremic/snare/snaremic_snare_halfopen_vl1.flac` (Snare half · soft) |
| `drums/snare-half-med.wav` | `Samples/snaremic/snare/snaremic_snare_halfopen_vl6.flac` (Snare half · med) |
| `drums/snare-half-hard.wav` | `Samples/snaremic/snare/snaremic_snare_halfopen_vl11.flac` (Snare half · hard) |
| `drums/snare-half-hot.wav` | `Samples/snaremic/snare/snaremic_snare_halfopen_vl16.flac` (Snare half · hot) |
| `drums/stickshot-soft.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot1_vl1.flac` (Stick shot · soft) |
| `drums/stickshot-med.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot1_vl3.flac` (Stick shot · med) |
| `drums/stickshot-hard.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot1_vl6.flac` (Stick shot · hard) |
| `drums/stickshot-hot.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot1_vl8.flac` (Stick shot · hot) |
| `drums/stickshot-b-soft.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot2_vl1.flac` (Stick shot B · soft) |
| `drums/stickshot-b-med.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot2_vl6.flac` (Stick shot B · med) |
| `drums/stickshot-b-hard.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot2_vl11.flac` (Stick shot B · hard) |
| `drums/stickshot-b-hot.wav` | `Samples/snaremic/snare/snaremic_snare_stickshot2_vl16.flac` (Stick shot B · hot) |
| `drums/hat-closed-soft.wav` | `Samples/mid/hh/mid_hh_closed_vl1_rr1.flac` (Hat closed · soft) |
| `drums/hat.wav` | `Samples/mid/hh/mid_hh_closed_vl3_rr1.flac` (Hat closed) |
| `drums/hat-closed-hard.wav` | `Samples/mid/hh/mid_hh_closed_vl4_rr1.flac` (Hat closed · hard) |
| `drums/hat-half-soft.wav` | `Samples/mid/hh/mid_hh_half_vl1_rr1.flac` (Hat half-open · soft) |
| `drums/hat-open.wav` | `Samples/mid/hh/mid_hh_half_vl3_rr1.flac` (Hat half-open) |
| `drums/hat-half-hard.wav` | `Samples/mid/hh/mid_hh_half_vl4_rr1.flac` (Hat half-open · hard) |
| `drums/hat-open-full-soft.wav` | `Samples/mid/hh/mid_hh_open_vl1_rr1.flac` (Hat open · soft) |
| `drums/hat-open-full-med.wav` | `Samples/mid/hh/mid_hh_open_vl3_rr1.flac` (Hat open · med) |
| `drums/hat-open-full-hard.wav` | `Samples/mid/hh/mid_hh_open_vl4_rr1.flac` (Hat open · hard) |
| `drums/hat-pedal-soft.wav` | `Samples/mid/hh/mid_hh_pedal_vl1_rr1.flac` (Hat pedal · soft) |
| `drums/hat-pedal-med.wav` | `Samples/mid/hh/mid_hh_pedal_vl2_rr1.flac` (Hat pedal · med) |
| `drums/hat-pedal-hard.wav` | `Samples/mid/hh/mid_hh_pedal_vl3_rr1.flac` (Hat pedal · hard) |
| `drums/hat-34-soft.wav` | `Samples/mid/hh/mid_hh_34_vl1_rr1.flac` (Hat three-quarter · soft) |
| `drums/hat-34-med.wav` | `Samples/mid/hh/mid_hh_34_vl3_rr1.flac` (Hat three-quarter · med) |
| `drums/hat-34-hard.wav` | `Samples/mid/hh/mid_hh_34_vl4_rr1.flac` (Hat three-quarter · hard) |
| `drums/tom-hi-soft.wav` | `Samples/snaremic/htom/snaremic_htom_center_vl1.flac` (Tom high · soft) |
| `drums/tom-hi.wav` | `Samples/snaremic/htom/snaremic_htom_center_vl6.flac` (Tom high) |
| `drums/tom-hi-hard.wav` | `Samples/snaremic/htom/snaremic_htom_center_vl11.flac` (Tom high · hard) |
| `drums/tom-hi-hot.wav` | `Samples/snaremic/htom/snaremic_htom_center_vl16.flac` (Tom high · hot) |
| `drums/tom-hi-edge-soft.wav` | `Samples/snaremic/htom/snaremic_htom_offcenter_vl1.flac` (Tom high edge · soft) |
| `drums/tom-hi-edge-med.wav` | `Samples/snaremic/htom/snaremic_htom_offcenter_vl6.flac` (Tom high edge · med) |
| `drums/tom-hi-edge-hard.wav` | `Samples/snaremic/htom/snaremic_htom_offcenter_vl11.flac` (Tom high edge · hard) |
| `drums/tom-hi-edge-hot.wav` | `Samples/snaremic/htom/snaremic_htom_offcenter_vl16.flac` (Tom high edge · hot) |
| `drums/tom-hi-mid-soft.wav` | `Samples/mid/htom/mid_htom_center_vl1.flac` (Tom high room · soft) |
| `drums/tom-hi-mid-med.wav` | `Samples/mid/htom/mid_htom_center_vl6.flac` (Tom high room · med) |
| `drums/tom-hi-mid-hard.wav` | `Samples/mid/htom/mid_htom_center_vl11.flac` (Tom high room · hard) |
| `drums/tom-hi-mid-hot.wav` | `Samples/mid/htom/mid_htom_center_vl16.flac` (Tom high room · hot) |
| `drums/tom-lo-soft.wav` | `Samples/kickmic/ltom/kickmic_ltom_center_vl1.flac` (Tom low · soft) |
| `drums/tom-lo.wav` | `Samples/kickmic/ltom/kickmic_ltom_center_vl6.flac` (Tom low) |
| `drums/tom-lo-hard.wav` | `Samples/kickmic/ltom/kickmic_ltom_center_vl11.flac` (Tom low · hard) |
| `drums/tom-lo-hot.wav` | `Samples/kickmic/ltom/kickmic_ltom_center_vl16.flac` (Tom low · hot) |
| `drums/tom-lo-edge-soft.wav` | `Samples/kickmic/ltom/kickmic_ltom_offcenter_vl1.flac` (Tom low edge · soft) |
| `drums/tom-lo-edge-med.wav` | `Samples/kickmic/ltom/kickmic_ltom_offcenter_vl5.flac` (Tom low edge · med) |
| `drums/tom-lo-edge-hard.wav` | `Samples/kickmic/ltom/kickmic_ltom_offcenter_vl8.flac` (Tom low edge · hard) |
| `drums/tom-lo-edge-hot.wav` | `Samples/kickmic/ltom/kickmic_ltom_offcenter_vl12.flac` (Tom low edge · hot) |
| `drums/tom-lo-mute-soft.wav` | `Samples/kickmic/ltom/kickmic_ltom_muted_vl1.flac` (Tom low muted · soft) |
| `drums/tom-lo-mute-med.wav` | `Samples/kickmic/ltom/kickmic_ltom_muted_vl6.flac` (Tom low muted · med) |
| `drums/tom-lo-mute-hard.wav` | `Samples/kickmic/ltom/kickmic_ltom_muted_vl11.flac` (Tom low muted · hard) |
| `drums/tom-lo-mute-hot.wav` | `Samples/kickmic/ltom/kickmic_ltom_muted_vl16.flac` (Tom low muted · hot) |
| `drums/tom-lo-rim-soft.wav` | `Samples/kickmic/ltom/kickmic_ltom_rimshot_vl1.flac` (Tom low rim · soft) |
| `drums/tom-lo-rim-med.wav` | `Samples/kickmic/ltom/kickmic_ltom_rimshot_vl4.flac` (Tom low rim · med) |
| `drums/tom-lo-rim-hard.wav` | `Samples/kickmic/ltom/kickmic_ltom_rimshot_vl7.flac` (Tom low rim · hard) |
| `drums/tom-lo-rim-hot.wav` | `Samples/kickmic/ltom/kickmic_ltom_rimshot_vl10.flac` (Tom low rim · hot) |
| `drums/ride-bell-soft.wav` | `Samples/mid/ride/mid_ride_bell_vl1_rr1.flac` (Ride bell · soft) |
| `drums/ride.wav` | `Samples/mid/ride/mid_ride_bell_vl2_rr1.flac` (Ride bell) |
| `drums/ride-bell-hard.wav` | `Samples/mid/ride/mid_ride_bell_vl3_rr1.flac` (Ride bell · hard) |
| `drums/ride-bow-soft.wav` | `Samples/mid/ride/mid_ride_ride_vl1_rr1.flac` (Ride bow · soft) |
| `drums/ride-bow-med.wav` | `Samples/mid/ride/mid_ride_ride_vl2_rr1.flac` (Ride bow · med) |
| `drums/ride-bow-hard.wav` | `Samples/mid/ride/mid_ride_ride_vl3_rr1.flac` (Ride bow · hard) |
| `drums/ride-bell-lofi-soft.wav` | `Samples/lofi/ride/lofi_ride_bell_vl1_rr1.flac` (Ride bell lofi · soft) |
| `drums/ride-bell-lofi-med.wav` | `Samples/lofi/ride/lofi_ride_bell_vl2_rr1.flac` (Ride bell lofi · med) |
| `drums/ride-bell-lofi-hard.wav` | `Samples/lofi/ride/lofi_ride_bell_vl3_rr1.flac` (Ride bell lofi · hard) |
| `drums/crash-soft.wav` | `Samples/oh/crash/oh_crash_crash_vl1_rr1.flac` (Crash · soft) |
| `drums/crash-med.wav` | `Samples/oh/crash/oh_crash_crash_vl2_rr1.flac` (Crash · med) |
| `drums/crash-hard.wav` | `Samples/oh/crash/oh_crash_crash_vl3_rr1.flac` (Crash · hard) |
| `drums/crash-sizzle-soft.wav` | `Samples/oh/crash/oh_crash_sizzle_vl1_rr1.flac` (Crash sizzle · soft) |
| `drums/crash-sizzle-med.wav` | `Samples/oh/crash/oh_crash_sizzle_vl2_rr1.flac` (Crash sizzle · med) |
| `drums/crash-sizzle-hard.wav` | `Samples/oh/crash/oh_crash_sizzle_vl3_rr1.flac` (Crash sizzle · hard) |
| `drums/flat-ride-soft.wav` | `Samples/mid/flatride/mid_flatride_ride_vl1_rr1.flac` (Flat ride · soft) |
| `drums/flat-ride-med.wav` | `Samples/mid/flatride/mid_flatride_ride_vl2_rr1.flac` (Flat ride · med) |
| `drums/flat-ride-hard.wav` | `Samples/mid/flatride/mid_flatride_ride_vl3_rr1.flac` (Flat ride · hard) |
| `drums/flat-crash-soft.wav` | `Samples/mid/flatride/mid_flatride_crash_vl1.flac` (Flat crash · soft) |
| `drums/flat-crash-med.wav` | `Samples/mid/flatride/mid_flatride_crash_vl3.flac` (Flat crash · med) |
| `drums/flat-crash-hard.wav` | `Samples/mid/flatride/mid_flatride_crash_vl4.flac` (Flat crash · hard) |

House, half-time, and break loops sequence those recorded hits at 80, 90, 100, 110, 120, 128, and 140 BPM.
They are CC0 as derivatives of CC0 material.
Percussion loops mix those hits with original shaker and conga synthesis.
Shuffle, bass, and pad loops are original synthesis.

## Original synthesis (CC0)

Written for this project and dedicated to the public domain under CC0 1.0 by the maintainer of this repository.

- Electro kicks, snares, and hats in `drums/electro-*.wav`
- Hand percussion in `perc/` (shaker, cabasa, maracas, clave, woodblocks, cowbell, agogo, conga, bongo, tambourine, triangle, guiro, snap, clap), three variants each
- Sub bass `bass/sub-*.wav` and `bass/c.wav`, `eb`, `f`, `g`, `bb` (MIDI 28–52) plus saw bass `bass/saw-*.wav` (MIDI 36–60)
- Electric piano `keys/ep-*.wav` and `keys/c.wav`, `eb`, `g`, `bb` (MIDI 48–84), plucks `keys/pluck-*.wav`, and major/minor chord stabs
- Formant vocal chops `vocal/vox-*.wav` for ah, eh, ee, oh, and oo. These are additive formant synthesis, not recordings of a singer.
- FX in `fx/` (rise, down, zap, impact, drop, noise, reverse)
- Ambience MP3s in `ambience/` (air, rain, rumble, wind, sea, room, crackle, night, hum, drones, and `wash`)
- Bass loops, pad loops, shuffle loops, and percussion loops in `loops/`

Legacy ids (`kick`, `snare`, `hat`, `hat-open`, `house`, `halftime`, `stick`, `rim`, `tom-hi`, `tom-lo`, `ride`, `shaker`, `perc-loop`, `bass-c`, `bass-loop`, `key-c`, `chord`, `pad`, `rise`, `wash`) still resolve so the default pads and the previous session kit keep working.

## OpenGameArt musical loops (CC0)

23 additional loops, **11,140,814 bytes**, live in `loops/oga-*.wav`.
Each one is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) on [OpenGameArt.org](https://opengameart.org/).
CC0 does not require credit. The notices below stay with the files: Riintron asked to be credited, and OpenGameArt asks for a link back to the source page.
Files are 16-bit mono WAV at 22.05 kHz. Loop points are the author's; silence was not trimmed.
`oga-simple-beat.wav` is the first two bars of the body loop only (the separate intro is not included).

| Shipped file | Name | Author | Source | Original file |
| --- | --- | --- | --- | --- |
| `loops/oga-fat-groove.wav` | Fat Groove | Riintron | [Fat Groove Drums](https://opengameart.org/content/fat-groove-drums) | `drums.wav` |
| `loops/oga-prehistoric-drums.wav` | Prehistoric Drums | hornpipe2 | [Prehistoric Drum Loop](https://opengameart.org/content/prehistoric-drum-loop) | `select.wav` |
| `loops/oga-tense-drums-140.wav` | Tense Drums 140 | Fupi | [Tense Bass Boost Drum Loop 140 BPM](https://opengameart.org/content/tense-bass-boost-drum-loop-140-bpm) | `tensebassboostdrums.wav` |
| `loops/oga-edm-bright.wav` | EDM Bright | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `brightmelodicedm.wav` |
| `loops/oga-edm-bright-loop.wav` | EDM Bright Loop | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `brightmelodicloopyedm.wav` |
| `loops/oga-edm-bright-skip.wav` | EDM Bright Skip | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `brightmelodicskippyedm.wav` |
| `loops/oga-edm-melodic.wav` | EDM Melodic | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `melodicedm.wav` |
| `loops/oga-edm-melodic-loop.wav` | EDM Melodic Loop | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `melodicloopyedm.wav` |
| `loops/oga-edm-melodic-skip.wav` | EDM Melodic Skip | Fupi | [Melodic EDM Loops](https://opengameart.org/content/melodic-edm-loops) | `melodicskippyedm.wav` |
| `loops/oga-funky-victory.wav` | Funky Victory | Archonic | [Funky Victory Loop (No Guitar)](https://opengameart.org/content/funky-victory-loop-no-guitar) | `funky-victory-loop-noguitar.mp3` |
| `loops/oga-ukulele.wav` | Ukulele | StarNinjas | [Ukulele Forest](https://opengameart.org/content/ukulele-forest-beginning-loop-and-end) | `forest_loop.ogg` |
| `loops/oga-guitar-chords.wav` | Guitar Chords | Spargus | [Dark Smooth Loop](https://opengameart.org/content/dark-smooth-loop) | `Pause guitar.ogg` |
| `loops/oga-soft-synth.wav` | Soft Synth | killerfishred | [Short Synth Loop](https://opengameart.org/content/short-synth-loop) | `loop.wav` |
| `loops/oga-cinematic-drums.wav` | Cinematic Drums | Marwan Antonios | [Cinematic percussion loop](https://opengameart.org/content/cinematic-percussion-loop) | `Cinematic percussion loop 2.wav` |
| `loops/oga-mountain.wav` | Mountain | beardalaxy | [Mountain Theme Loop](https://opengameart.org/content/mountain-theme-loop) | `mountain_in_game.ogg` |
| `loops/oga-menu-keys.wav` | Menu Keys | Akikazer | [Menu Loop](https://opengameart.org/content/menu-loop) | `Loop-Menu.wav` |
| `loops/oga-horde-drums.wav` | Horde Drums | William Hector | [Horde War Drums loop](https://opengameart.org/content/horde-war-drums-loop) | `horde_war_drums_by_william_hector.wav` |
| `loops/oga-adventure-keys.wav` | Adventure Keys | KiluaBoy | [Sci Fi / Adventure / Eastern / Quiet Piano](https://opengameart.org/content/sci-fi-adventure-eastern-quiet-piano-loop) | `AnAdventure.wav` |
| `loops/oga-simple-beat.wav` | Simple Beat | Turnovus | [simple drumbeat](https://opengameart.org/content/simple-drumbeat) | `drumbeat_body_ogg.ogg` |
| `loops/oga-bass-line.wav` | Bass Line | burabotti | [Bass Loop](https://opengameart.org/content/bass-loop) | `bass_loop.ogg` |
| `loops/oga-piano-song.wav` | Piano Song | frosty ham | [Short Piano Song Loop](https://opengameart.org/content/short-piano-song-loop) | `pianosong.ogg` |
| `loops/oga-into-the-stars.wav` | Into The Stars | KiluaBoy | [Sci Fi / Adventure / Eastern / Quiet Piano](https://opengameart.org/content/sci-fi-adventure-eastern-quiet-piano-loop) | `IntoTheStars.wav` |
| `loops/oga-happy-clappy.wav` | Happy Clappy | OwlishMedia | [Happy Clappy Loop](https://opengameart.org/content/happy-clappy-loop) | `HappyClappyLoop.wav` |

Prehistoric Drums is a WAV render of the author's own MIDI using the Fluid GM soundfont. Happy Clappy is the author's loop of music from their short film Cat's Sky, dedicated CC0 on the source page.

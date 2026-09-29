# RS-4 Session Kit

Small playable library shipped with this console so a session can start without a microphone. Total audio is about 4.7 MB of 16-bit WAV. Everything here is **CC0 1.0** (public domain dedication): you can use it commercially, including redistributing it in this app.

No commercial drum kits or copyrighted recordings are included.

## Virtuosity Drums excerpts (recorded)

These one-shots are short, trimmed, mono excerpts of [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) by Versilian Studios. The performances are by drummer Austin McMahon on the house kit at Virtuosity Musical Instruments in Boston. The upstream library is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File | Source recording |
| --- | --- |
| `drums/kick.wav` | `kickmic_kick_snon_vl4_rr1` (kick, snares on) |
| `drums/snare.wav` | `snaremic_snare_center_vl20` |
| `drums/hat.wav` | `mid_hh_closed_vl3_rr1` |
| `drums/hat-open.wav` | `mid_hh_half_vl2_rr1` (half-open hat) |
| `perc/stick.wav` | `snaremic_snare_crossstick_vl8` |
| `perc/rim.wav` | `snaremic_snare_rimshot_vl12` |
| `perc/tom-hi.wav` | `snaremic_htom_center_vl8` |
| `perc/tom-lo.wav` | `kickmic_ltom_center_vl6` |
| `perc/ride.wav` | `lofi_ride_bell_vl2_rr1` |

Auxiliary percussion from other packs that the upstream README attributes to VSCO 2 Pro or Karoryfer is **not** included.

## Loops sequenced from those hits

These files only use the excerpts above (plus the original shaker, for the percussion loop). They were arranged for this console at **100 BPM**, two bars, and are CC0 as derivatives of CC0 material.

- `drums/house.wav`
- `drums/halftime.wav`
- `perc/perc-loop.wav`

## Original synthesis (CC0)

Written for this project and dedicated to the public domain under CC0 1.0. Rebuild with `python3 scripts/build-session-kit.py` (needs `ffmpeg` and network access to the Virtuosity Drums repository).

- Bass notes and `bass/bass-loop.wav`
- Electric-piano notes, `keys/chord.wav`, and `keys/pad.wav`
- `perc/shaker.wav`
- `fx/rise.wav` and `fx/wash.wav`

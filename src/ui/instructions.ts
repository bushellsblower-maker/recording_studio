export interface Instructions {
  button: HTMLButtonElement;
}

const SECTIONS: Array<{ title: string; intro?: string; items: Array<[string, string]> }> = [
  {
    title: 'How the desk is laid out',
    intro:
      'On a wide screen the desk is one page: Browser, Arrangement, Devices, Console, and Pads and keys. On a phone, use the Arrange, Mix, Sounds, and Play tabs. Mix shows the track levels, the console, and Devices.',
    items: [
      ['Dotted grip', 'On each section title. Drag it to reorder that section, including into the other column. Arrow keys move it when the grip is focused.'],
      ['Bars between sections', 'Drag to resize the two sections that share the bar, or the two columns. Double-click a bar to put that size back.'],
      ['Bottom bar', 'The last section in a column has a bar along its bottom edge. Drag it to make that section taller or shorter. If the desk grows past the window, use the page scrollbar.'],
      ['Hide / Show', 'Collapses that section to its title bar. Show opens it again.'],
      ['Reset layout', 'In the Shortcuts footer on a wide screen. Puts the sections back in the original order and sizes. It does not change the song.'],
      ['Guide steps', 'The numbered row on Arrangement (Pick a sound, Place it, Arm and record, Mix and bounce) jumps to that part of the desk. Hide stores that choice in this browser.'],
    ],
  },
  {
    title: 'Top bar',
    items: [
      ['MIC', 'Shows whether the microphone is off, being requested, or on.'],
      ['Sample rate', 'The rate the audio engine is running at, after Power is on.'],
      ['Clock', 'LEN is the length of the arrangement. While the transport runs it shows the playhead time. The number beside it is bar and beat.'],
      ['4/4', 'The time signature. It is a label, not a control.'],
      ['Master meters', 'Left and right peak of the master output.'],
      ['POWER', 'Starts the audio engine, or resumes it if the browser suspended sound. Press this before recording or playing.'],
    ],
  },
  {
    title: 'Transport',
    items: [
      ['REC', 'Records the armed tracks. Audio tracks print the channel. Instrument tracks print pads and keys.'],
      ['STOP', 'Stops playback or recording.'],
      ['PLAY', 'Starts playback from the play range. Space does the same as play or stop.'],
      ['UNDO / REDO', 'Steps back or forward through takes and edits. Z undoes. Shift+Z redoes.'],
      ['RESET', 'Clears the tracks and stops the transport. The project file in this browser is left as it was until you SAVE again.'],
      ['LOOP', 'Repeats the play range. If you have not set a range yet, it loops the whole arrangement. L does the same.'],
      ['COUNT', 'Plays a one-bar count-in before recording starts.'],
      ['PUNCH', 'Records only inside the play range. If that range starts after bar 1, recording gets a one-bar pre-roll.'],
      ['SNAP 1 / SNAP 16', 'SNAP 1 moves and trims clips on the beat. SNAP 16 uses sixteenth notes. Hold Shift while dragging to use the other grid.'],
      ['MARK', 'Drops a locator at the playhead. Locators appear under the play range. Click one to jump there. Alt-click removes it.'],
      ['Zoom − / +', 'Shows more bars, or fewer bars with more detail. The readout is the zoom factor, from 1× to 4×.'],
      ['METRO', 'Turns the click on or off. The click is not recorded.'],
      ['QUANT', 'While play or record is running, pad hits wait for the next beat. Turn it off to hear pads immediately.'],
      ['TAP', 'Tap in time to set the metronome tempo. B does the same.'],
      ['BPM', 'Metronome tempo. Placing a loop from the browser also sets this to that loop’s tempo.'],
      ['CLICK', 'How loud the metronome is.'],
      ['SAVE', 'Stores the project in this browser, separate from the desk layout.'],
      ['LOAD', 'Brings back the project last saved in this browser.'],
      ['BOUNCE', 'Renders a mix file through inserts, fades, sends, automation, and the master.'],
      ['STEMS', 'Downloads each track through its inserts, fades, level, and pan.'],
      ['MIDI', 'Listens for a Web MIDI keyboard. Notes use the same voice as the on-screen keys.'],
    ],
  },
  {
    title: 'Arrangement',
    items: [
      ['Play range', 'The Play slider sets where playback starts and stops. The left handle is the start, the right handle is the end. Drag across the BARS ruler to set the same span.'],
      ['Loop region', 'Repeats playback between those two handles.'],
      ['Loop selection', 'Loops the highlighted track from the start of its earliest clip through the end of its latest clip.'],
      ['All', 'Ignores the play range and plays the whole arrangement.'],
      ['Track name', 'Audio 1–4 start as channel tracks. Inst 5–8 start as pad and key tracks. Click the empty part of a row to select it. That row is where Place lands, and it is the track Devices edits. Keys 1–8 select a track.'],
      ['ARM', 'That track records on the next REC. More than one track can be armed.'],
      ['M', 'Mutes that track. M mutes the selected track.'],
      ['S', 'Solos that track. Other tracks go quiet while any solo is on.'],
      ['AUD / INST', 'Switches what the track prints. AUD records the console channel. INST records pads and keys. Change this while stopped.'],
      ['Level', 'That track’s volume in the mix and in MIX WAV.'],
      ['Pan', 'Moves the track left or right.'],
      ['Lane meter', 'A small meter of that track while it plays.'],
      ['Waveform', 'Each bar is one sample. Its width is how long that sample is, and the name and time on the bar say which sample and how long. Drop several sounds on the same lane at different beats; each drop adds a clip and leaves the others. Click a clip to select it. Drag the middle to move it. The bright edges trim it; hold Alt and drag an edge to set a fade. Right-click for Duplicate, Copy, Paste here, and Delete. The same buttons sit in the Arrangement title.'],
      ['Time', 'How far that track’s clips reach, counting from the start of the arrangement.'],
      ['IMP', 'Imports a WAV, MP3, or other audio file onto the track at the start. Another import adds another clip.'],
      ['WAV', 'Downloads that track as a WAV, without the mix processing. One clip is the raw file. Several clips are mixed into one file.'],
      ['MASTER', 'The master fader, after the tracks and before the safety limiter.'],
      ['Master MUTE', 'Silences the master output.'],
      ['MIX WAV', 'Downloads a mix of the tracks using level, pan, mute, solo, and the master fader. For inserts, fades, and sends, use BOUNCE.'],
      ['Master meters', 'Left and right level after the master fader. The note under them is the safety limiter, which is always after those meters.'],
    ],
  },
  {
    title: 'Browser',
    intro: 'The Sounds tab on a phone. Sounds are a scrolling list. Click one to preview it and select it. Double-click or Place adds it on the highlighted track at bar 1. Drag it onto a lane to choose the beat. Another drop on the same lane adds another clip. The drop follows SNAP.',
    items: [
      ['Search', 'Filters the list by name.'],
      ['Category buttons', 'Shows one family of sounds, such as Drums or Bass, or All. The number is how many sounds are in that family.'],
      ['All / Hits / Loops', 'All shows everything in the current category. Hits are one-shots. Loops are bars that can set the click tempo when you place them.'],
      ['Any BPM and tempo buttons', 'Keeps only loops at that tempo. Any BPM clears the tempo filter.'],
      ['Place', 'Adds the selected sound on the highlighted track at bar 1. It does not replace clips already there. The button name follows the selected track.'],
      ['Favorites', 'Shows only sounds you have starred. The star on a row saves that choice in this browser.'],
      ['Show more', 'The list pages a screenful at a time. Show more reveals the next page.'],
      ['Sample credits', 'Opens the CC0 credit for the built-in library.'],
    ],
  },
  {
    title: 'Devices',
    intro: 'Edits the track selected in Arrangement. The title line names that track. On a wide screen, Session, Channel, Automation, and Desk synth share the top row. Inserts is the strip underneath.',
    items: [
      ['Scene 1–4', 'Launches that scene: every track’s clip in that slot starts together.'],
      ['Slot buttons', 'Launches this track’s clip in that scene. Shift-click or right-click clears the slot. An empty slot is filled with Capture first.'],
      ['Capture', 'Copies this track’s earliest arrangement clip into that slot.'],
      ['Quant: bar / Quant: beat', 'Scene and slot launches wait for the next bar, or the next beat.'],
      ['Arrangement', 'Stops the session clips and returns every track to the arrangement.'],
      ['Delay send / Reverb send', 'How much of this track goes to the same delay and reverb returns as the console. These sends are for listening and bounce, not a separate recorded file.'],
      ['Stereo / Mono', 'Mono sums this track to the center.'],
      ['Group menu', 'Assigns the track to no group, Group 1, or Group 2.'],
      ['Mute group 1 / Mute group 2', 'Mutes every track assigned to that group.'],
      ['Insert slots', 'Three devices on this track, in order. Pick a device in the menu, or clear the slot. Drag a slot onto another to reorder them.'],
      ['In / Bypassed', 'In means the device is heard. Bypassed keeps the settings but skips the device.'],
      ['Preset', 'Loads a starting setting for the device in that slot.'],
      ['Channel EQ', 'Low shelf, mid bell, and high shelf. The curve under the slots draws the response. Automation rides the mid gain.'],
      ['Compressor', 'Threshold, ratio, attack, release, knee, and makeup. GR under the slots is gain reduction. Automation rides the threshold.'],
      ['Tape', 'Drive is saturation, Tone is the brightness of that saturation, Mix is wet against dry. Automation rides Tone.'],
      ['Chorus', 'Rate and depth of the modulation, and Mix. Automation rides Rate.'],
      ['Phaser', 'Rate, depth, Feed (feedback), and Mix. Automation rides Feed.'],
      ['Utility', 'Gain, and Width. Width at 0 is mono. 1 leaves the stereo image alone. Automation rides Width.'],
      ['Limiter', 'Ceil is the ceiling. Release is how fast it lets go. Automation rides Ceil.'],
      ['Automation lane menu', 'Volume, Pan, or FX param. FX param rides the automated control of the first insert that is not bypassed.'],
      ['Clear lane', 'Removes every point on the lane you are looking at.'],
      ['Automation lane', 'Click to write a point. Drag to draw. Alt-click removes the nearest point. Volume and pan are heard on playback and included in a bounce.'],
      ['Desk synth waveform', 'Sawtooth, square, triangle, or sine for the Perform keys when Voice is Desk synth.'],
      ['Cutoff / Reso', 'Filter brightness and emphasis on that synth.'],
      ['Attack / Release', 'How quickly a key fades in and out.'],
      ['Level', 'How loud the desk synth is.'],
    ],
  },
  {
    title: 'Console',
    intro:
      'The live channel that Audio tracks print. The chips along the Channel panel show what is in that path. A lit chip is active. Monitor starts off so a microphone cannot feed back.',
    items: [
      ['Tone / Mic / Mic + tone', 'What feeds the channel: the built-in oscillator, the microphone, or both.'],
      ['Enable microphone', 'Asks the browser for the mic. Release microphone turns it off. The tone generator stays available.'],
      ['Browser voice processing', 'Echo cancellation, noise suppression, and auto gain. Change it before you enable the mic, or the mic reopens with the new setting. Turn it off for a drier signal, and use headphones if Monitor is up.'],
      ['Wave', 'Oscillator shape: sine, square, saw, triangle, or noise. FREQ is disabled for noise.'],
      ['FREQ', 'Oscillator pitch.'],
      ['TONE', 'Oscillator level into the channel.'],
      ['MONITOR', 'How loud the live input is in the speakers. It does not change what is recorded. It starts all the way down.'],
      ['Pre, HPF, EQ, Comp chips', 'These channel processors are in the path that gets printed on audio tracks.'],
      ['Gate chip', 'Lights when GATE in Dynamics is on.'],
      ['Delay / Verb chips', 'Light when that send is turned up. Those sends are not printed into a track WAV.'],
      ['PRE', 'Gain at the start of the channel.'],
      ['HPF', 'High-pass frequency. Turn it up to thin out rumble.'],
      ['PAN', 'Left-right balance of the channel that audio tracks print.'],
      ['Ø', 'Flips the polarity of the channel.'],
      ['Channel MUTE / SOLO', 'Mutes or solos the live input, not an arrangement track.'],
      ['FADER', 'Channel level. This is the level printed to armed audio tracks. IN is the channel meter.'],
      ['EQ LOW / GAIN', 'Low shelf frequency and how much it is boosted or cut.'],
      ['EQ MID / GAIN / Q', 'Mid frequency, its boost or cut, and how wide that band is.'],
      ['EQ HIGH / GAIN', 'High shelf frequency and boost or cut.'],
      ['FLAT', 'Sets the three EQ gains back to zero.'],
      ['GATE', 'Opens only when the input is louder than THRESH. ATK and REL are how fast it opens and closes. If the browser has no AudioWorklet, the note under the button says so and the gate cannot run.'],
      ['Compressor THRESH / RATIO', 'How loud the signal must be before it is turned down, and how hard.'],
      ['ATK / REL / KNEE', 'How fast the compressor grabs and lets go, and how gradual the onset is.'],
      ['MAKEUP', 'Gain to bring the level back up after compression. GR is the gain reduction.'],
      ['Delay TIME / FB / DAMP / SEND', 'Repeat time, how many repeats, how dark the repeats get, and how much of the channel is sent. This delay is a listening send.'],
      ['Reverb DECAY / SEND', 'How long the room rings, and how much of the channel is sent. The reverb is a listening send and is not in a track WAV.'],
    ],
  },
  {
    title: 'Pads and keys',
    intro: 'The Play tab on a phone. Pads and keys record onto armed instrument tracks.',
    items: [
      ['Kit', 'Acoustic kit, Electro kit, or Percussion. Choosing a kit fills all eight pads. After you change a single pad, the menu shows a custom mapping.'],
      ['Pads', 'Eight one-shots. Press a pad to play it. Higher on the pad is softer. While the transport runs and QUANT is on, the hit waits for the next beat.'],
      ['Pad menus', 'Picks a different one-shot for that pad. You can also drop a browser sound onto a pad.'],
      ['Voice', 'What the keys play. Desk synth uses the Devices synth. The named banks play chromatic samples (EP, saw, sub, pluck, bass, keys, and the vox banks that are in the library). Browser plays the sound selected in the browser, at its own pitch on the named note and transposed from there.'],
      ['Keys', 'The on-screen piano. A–K on the keyboard plays the same voice. Shift is softer. Higher on a key is softer. C marks middle C and the C above it.'],
    ],
  },
  {
    title: 'Keyboard',
    items: [
      ['Space', 'Play or stop.'],
      ['R', 'Record.'],
      ['Z / Shift+Z', 'Undo and redo.'],
      ['B', 'Tap tempo.'],
      ['L', 'Toggle the loop.'],
      ['M', 'Mute or unmute the selected track.'],
      ['1–8', 'Select that track.'],
      ['A–K', 'Play the Perform voice. Shift plays softer. Hold Ctrl or Cmd so D duplicates a clip instead of playing a note.'],
      ['Delete / Backspace', 'Removes the selected arrangement clip.'],
      ['Ctrl or Cmd C', 'Copies the selected clip.'],
      ['Ctrl or Cmd V', 'Pastes the copied clip on that track at the cue.'],
      ['Ctrl or Cmd D', 'Duplicates the selected clip on the same track, starting when the original ends.'],
    ],
  },
];

export function buildInstructions(): Instructions {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn small instructions-open';
  button.textContent = 'Instructions';
  button.title = 'Open a guide to the desk controls';

  const layer = document.createElement('div');
  layer.className = 'help-layer';
  layer.hidden = true;

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'help-backdrop';
  backdrop.setAttribute('aria-label', 'Close instructions');

  const dialog = document.createElement('div');
  dialog.id = 'help-dialog';
  dialog.className = 'help-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'help-title');

  const head = document.createElement('div');
  head.className = 'help-head';
  const title = document.createElement('h2');
  title.id = 'help-title';
  title.textContent = 'Instructions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn small help-close';
  close.textContent = 'Close';
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'help-body';
  for (const section of SECTIONS) {
    const block = document.createElement('section');
    block.className = 'help-section';
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    block.append(heading);
    if (section.intro) {
      const intro = document.createElement('p');
      intro.className = 'help-intro';
      intro.textContent = section.intro;
      block.append(intro);
    }
    const list = document.createElement('dl');
    list.className = 'help-list';
    for (const [name, text] of section.items) {
      const term = document.createElement('dt');
      term.textContent = name;
      const desc = document.createElement('dd');
      desc.textContent = text;
      list.append(term, desc);
    }
    block.append(list);
    body.append(block);
  }
  dialog.append(head, body);
  layer.append(backdrop, dialog);
  document.body.append(layer);

  let returnFocus: HTMLElement | null = null;

  function setOpen(open: boolean): void {
    layer.hidden = !open;
    document.documentElement.classList.toggle('help-open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      const active = document.activeElement;
      returnFocus = active instanceof HTMLElement ? active : null;
      close.focus();
      return;
    }
    returnFocus?.focus();
    returnFocus = null;
  }

  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'help-dialog');
  button.addEventListener('click', () => setOpen(layer.hidden));
  close.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  window.addEventListener('keydown', (event) => {
    if (layer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
    event.stopImmediatePropagation();
  });

  return { button };
}

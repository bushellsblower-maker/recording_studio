export async function openMidi(
  onNote: (midi: number, velocity: number) => void,
  offNote: (midi: number) => void,
): Promise<number> {
  if (!navigator.requestMIDIAccess) throw new Error('This browser has no Web MIDI.');
  const access = await navigator.requestMIDIAccess();
  const inputs = [...access.inputs.values()];
  const handle = (event: MIDIMessageEvent): void => {
    const data = event.data;
    if (!data || data.length < 2) return;
    const status = data[0] ?? 0;
    const note = data[1] ?? 0;
    const velocity = data.length > 2 ? (data[2] ?? 0) / 127 : 0;
    const command = status & 0xf0;
    if (command === 0x90 && velocity > 0) onNote(note, velocity);
    else if (command === 0x80 || (command === 0x90 && velocity <= 0)) offNote(note);
  };
  for (const input of inputs) input.onmidimessage = handle;
  access.onstatechange = () => {
    for (const input of access.inputs.values()) input.onmidimessage = handle;
  };
  return inputs.length;
}

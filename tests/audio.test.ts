import { describe, expect, it } from 'vitest';
import audio from '../data/audio.json';
import { noteFreq, parseNotes } from '../src/audio/audio';

const DRUMS = ['K', 'S', 'H'];

describe('chiptune data (data/audio.json)', () => {
  it('note names map to the right pitch', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('C5')).toBeCloseTo(523.25, 1);
    expect(noteFreq('A#1')).toBeCloseTo(58.27, 1);
  });
  for (const [id, track] of Object.entries(audio.bgm)) {
    it(`${id}: every note is valid and all parts are the same length (so the loop stays in step)`, () => {
      const lengths = track.voices.map((v) => {
        const steps = parseNotes(v.notes);
        for (const st of steps) {
          expect(st.steps, `${id} ${st.pitch}`).toBeGreaterThan(0);
          if (st.pitch === 'R') continue;
          if (v.wave === 'noise') expect(DRUMS, `${id}: drum ${st.pitch}`).toContain(st.pitch);
          else expect(() => noteFreq(st.pitch)).not.toThrow();
        }
        return steps.reduce((n, st) => n + st.steps, 0);
      });
      expect(new Set(lengths).size, `${id}: ${lengths.join(' / ')} steps`).toBe(1);
      expect(lengths[0]! % 16, `${id}: whole bars`).toBe(0);
    });
  }
  it('sound effect notes are valid', () => {
    for (const parts of Object.values(audio.sfx)) {
      for (const p of parts as { f?: unknown }[]) if (typeof p.f === 'string') expect(() => noteFreq(p.f as string)).not.toThrow();
    }
  });
});

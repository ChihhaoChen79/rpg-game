// Chiptune audio (plan §8): music and sound effects synthesized with Web Audio from the note
// lists in data/audio.json, so there are no audio files. Browsers only allow sound after a user
// gesture, so nothing plays until unlockAudio() runs from a tap/click/key (see main.ts).
import audioData from '../../data/audio.json';

type Wave = 'square' | 'triangle' | 'sawtooth' | 'sine' | 'noise';
interface Voice { wave: Wave; vol: number; notes: string }
interface Track { bpm: number; voices: Voice[] }
interface SfxPart { wave: Wave; f?: number | string | [number, number]; dur: number; vol: number; at?: number }
export type BgmId = keyof typeof audioData.bgm;
export type SfxId = keyof typeof audioData.sfx;

// ---------------------------------------------------------------- your own audio files
// assets/audio/bgm_<id>.<ext> or sfx_<id>.<ext> replaces that track / effect (see assets/ASSETS.md).
const FILE_URLS = import.meta.glob('../../assets/audio/*.{m4a,mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const EXT_ORDER = ['m4a', 'mp3', 'ogg', 'wav']; // first one found wins (m4a / mp3 play on every iPhone)
/** "bgm_town" -> url of the best file for it. Exported for tests. */
export const audioFiles: Record<string, string> = {};
for (const ext of [...EXT_ORDER].reverse()) {
  for (const [path, url] of Object.entries(FILE_URLS)) {
    const m = /\/((?:bgm|sfx)_[a-z_]+)\.([a-z0-9]+)$/.exec(path);
    if (m && m[2] === ext) audioFiles[m[1]!] = url;
  }
}
const buffers = new Map<string, AudioBuffer>();

function loadFiles(): void {
  for (const [name, url] of Object.entries(audioFiles)) {
    fetch(url).then((r) => r.arrayBuffer()).then((data) => ctx!.decodeAudioData(data)).then((buf) => {
      buffers.set(name, buf);
      // A track that was waiting for its file starts now.
      if (name === `bgm_${wanted}` && playing?.id === wanted && !playing.source) {
        const id = wanted!;
        playing = null;
        startTrack(id);
      }
    }).catch((e: unknown) => console.warn(`Could not load ${url}`, e));
  }
}

const DATA = audioData as unknown as { combatHoldSec: number; fadeSec: number; bgm: Record<string, Track>; sfx: Record<string, SfxPart[]> };
export const COMBAT_HOLD_SEC = DATA.combatHoldSec;

// ---------------------------------------------------------------- volume (per device)

const PREF_KEY = 'rpg-game:audio';
interface Volumes { bgm: number; sfx: number } // 0..1
let volumes: Volumes = { bgm: 0.6, sfx: 0.8 };
try {
  const saved = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Partial<Volumes> | null;
  if (saved) volumes = { bgm: saved.bgm ?? volumes.bgm, sfx: saved.sfx ?? volumes.sfx };
} catch {
  // storage blocked: defaults
}

export function getVolumes(): Volumes {
  return { ...volumes };
}

export function setVolumes(v: Partial<Volumes>): void {
  volumes = { bgm: clamp01(v.bgm ?? volumes.bgm), sfx: clamp01(v.sfx ?? volumes.sfx) };
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(volumes));
  } catch {
    // not remembered
  }
  if (ctx) {
    bgmBus!.gain.setTargetAtTime(volumes.bgm, ctx.currentTime, 0.05);
    sfxBus!.gain.setTargetAtTime(volumes.sfx, ctx.currentTime, 0.05);
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Math.round(n * 10) / 10));

// ---------------------------------------------------------------- engine

let ctx: AudioContext | null = null;
let bgmBus: GainNode | null = null;
let sfxBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

/** Call from a user gesture. Safe to call often. */
export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    bgmBus = ctx.createGain();
    bgmBus.gain.value = volumes.bgm;
    bgmBus.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = volumes.sfx;
    sfxBus.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // Deterministic noise (no Math.random needed): a small LCG.
    let x = 12345;
    for (let i = 0; i < d.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (x / 0x3fffffff) - 1;
    }
    setInterval(schedule, 50);
    loadFiles();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (wanted && !playing) startTrack(wanted);
}

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** "A4" -> 440 Hz. */
export function noteFreq(name: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  const midi = (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]!]!;
  return 440 * 2 ** ((midi - 69) / 12);
}

interface Step { pitch: string; steps: number }
/** "C5-2 R-2 | E5-4" -> steps. Exported for tests. */
export function parseNotes(text: string): Step[] {
  return text.split(/\s+/).filter((tok) => tok && tok !== '|').map((tok) => {
    const i = tok.lastIndexOf('-');
    if (i <= 0) throw new Error(`Bad note token "${tok}"`);
    return { pitch: tok.slice(0, i), steps: Number(tok.slice(i + 1)) };
  });
}

/** One synthesized note (or drum hit) on `bus`. */
function tone(bus: AudioNode, wave: Wave, at: number, dur: number, vol: number, f0: number, f1 = f0, drum?: string): void {
  const c = ctx!;
  const g = c.createGain();
  g.connect(bus);
  let src: AudioScheduledSourceNode;
  if (wave === 'noise') {
    const n = c.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = drum === 'K' ? 'lowpass' : 'highpass';
    filter.frequency.value = drum === 'K' ? 160 : drum === 'S' ? 1500 : 6000;
    n.connect(filter).connect(g);
    src = n;
    if (drum) dur = drum === 'H' ? 0.04 : drum === 'S' ? 0.12 : 0.15;
  } else {
    const o = c.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    o.connect(g);
    src = o;
  }
  // Short attack and release so notes don't click.
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.005);
  g.gain.setValueAtTime(vol, Math.max(at + 0.005, at + dur - 0.03));
  g.gain.linearRampToValueAtTime(0, at + dur);
  src.start(at);
  src.stop(at + dur + 0.02);
}

// ---------------------------------------------------------------- music

interface Playing { id: string; gain: GainNode; source?: AudioBufferSourceNode; voices: { voice: Voice; steps: Step[]; i: number; next: number }[]; stepSec: number; stopAt: number | null }
let playing: Playing | null = null;
const fading: Playing[] = [];
let wanted: string | null = null;

function startTrack(id: string): void {
  const c = ctx!;
  const track = DATA.bgm[id];
  if (!track) return;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(1, c.currentTime + DATA.fadeSec);
  gain.connect(bgmBus!);
  const start = c.currentTime + 0.05;
  const file = buffers.get(`bgm_${id}`);
  if (file) {
    // Your own recording, looped.
    const src = c.createBufferSource();
    src.buffer = file;
    src.loop = true;
    src.connect(gain);
    src.start(start);
    playing = { id, gain, source: src, stepSec: 1, stopAt: null, voices: [] };
    return;
  }
  playing = {
    id, gain, stepSec: 60 / track.bpm / 4, stopAt: null,
    voices: track.voices.map((voice) => ({ voice, steps: parseNotes(voice.notes), i: 0, next: start })),
  };
}

/** Switch music (crossfade). No-op if it's already playing. */
export function playBgm(id: BgmId): void {
  wanted = id;
  if (!ctx || playing?.id === id) return;
  if (playing) {
    const old = playing;
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, DATA.fadeSec / 3);
    old.stopAt = ctx.currentTime + DATA.fadeSec * 1.5;
    fading.push(old);
  }
  startTrack(id);
}

/** Look-ahead scheduler: queues the next 0.2 s of notes for the current and fading tracks. */
function schedule(): void {
  if (!ctx) return;
  const until = ctx.currentTime + 0.2;
  for (const pl of [playing, ...fading]) {
    if (!pl) continue;
    for (const v of pl.voices) {
      while (v.next < until && (pl.stopAt === null || v.next < pl.stopAt)) {
        const st = v.steps[v.i]!;
        const dur = st.steps * pl.stepSec;
        if (st.pitch !== 'R') {
          const drum = v.voice.wave === 'noise' ? st.pitch : undefined;
          const f = drum ? 0 : noteFreq(st.pitch);
          tone(pl.gain, v.voice.wave, v.next, dur * 0.9, v.voice.vol, f, f, drum);
        }
        v.next += dur;
        v.i = (v.i + 1) % v.steps.length;
      }
    }
  }
  for (let i = fading.length - 1; i >= 0; i--) {
    const f = fading[i]!;
    if (f.stopAt !== null && ctx.currentTime > f.stopAt) {
      f.source?.stop();
      f.gain.disconnect();
      fading.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- sound effects

export function playSfx(id: SfxId): void {
  if (!ctx || ctx.state !== 'running' || volumes.sfx <= 0) return;
  const file = buffers.get(`sfx_${id}`);
  if (file) {
    const src = ctx.createBufferSource();
    src.buffer = file;
    src.connect(sfxBus!);
    src.start();
    return;
  }
  let t = ctx.currentTime + 0.01;
  const start = t;
  for (const part of DATA.sfx[id] ?? []) {
    const at = part.at !== undefined ? start + part.at : t;
    const f = part.f;
    const [f0, f1] = Array.isArray(f) ? f : typeof f === 'string' ? [noteFreq(f), noteFreq(f)] : [f ?? 440, f ?? 440];
    tone(sfxBus!, part.wave, at, part.dur, part.vol, f0, f1);
    t = Math.max(t, at + part.dur);
  }
}

/** What the music is playing right now (for checks in the browser console and tests). */
export function nowPlaying(): { id: string; from: 'file' | 'chiptune' } | null {
  return playing ? { id: playing.id, from: playing.source ? 'file' : 'chiptune' } : null;
}

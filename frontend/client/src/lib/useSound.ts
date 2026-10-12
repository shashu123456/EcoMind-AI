import { useEffect, useRef } from "react";

type UseSoundOptions = {
  onPlay?: () => void;
};

type UseSoundReturn = {
  play: (overrides?: Partial<{ volume: number; rate: number }>) => void;
  stop: () => void;
  current: HTMLAudioElement | null;
};

// Sound policy: per-interaction sounds use short sine tones so the UI feels
// alive without needing any audio file. The start tone and completion chime
// (played on real milestones) use the AudioContext directly.
export function useSound({ onPlay }: UseSoundOptions = {}): UseSoundReturn {
  // Per-interaction sounds are intentionally disabled in this build: every
  // button click, navigation, and toggle stays silent so the interface feels
  // calm until a real milestone (run start, stage complete) plays a chime.
  // Milestone sounds use playStartTone / playCompletionChime directly and are
  // not affected by this hook.
  const noop = () => {};
  return { play: noop, stop: noop, current: null };
}

let chimeContext: AudioContext | null = null;

function createContext(): AudioContext | null {
  if (chimeContext) return chimeContext;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    chimeContext = new Ctor();
  } catch {
    return null;
  }
  return chimeContext;
}

/**
 * Browsers only allow audio to start from a real user gesture, and a context
 * created any other way stays `suspended` with a frozen clock — scheduling
 * notes on it produces silence. Call this from the first click so the context
 * that the chime later uses is already running.
 */
export function unlockAudio() {
  const context = createContext();
  if (context && context.state === "suspended") {
    void context.resume().catch(() => {});
  }
}

type Note = { f: number; t: number; dur: number; gain: number };

/**
 * Schedule a sequence of short sine notes. Awaits `resume()` first: a resumed
 * context has a moving `currentTime`, and notes scheduled against a suspended
 * one (time frozen at 0) never sound.
 */
async function playNotes(notes: Note[], type: OscillatorType = "sine") {
  const context = createContext();
  if (!context) return;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return;
    }
  }
  if (context.state !== "running") return;
  const now = context.currentTime + 0.01;
  for (const note of notes) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.value = note.f;
    const start = now + note.t;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(note.gain, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.dur);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.05);
  }
}

/** Short, quiet acknowledgement that a run or a stage has begun. */
export async function playStartTone(): Promise<void> {
  await playNotes(
    [
      { f: 392.0, t: 0.0, dur: 0.16, gain: 0.07 },
      { f: 523.25, t: 0.08, dur: 0.22, gain: 0.07 },
    ],
    "triangle",
  );
}

// Completion chime: a short, resolving rising arpeggio. Fired ONLY on real
// milestones. Gentle volume, never per-interaction.
export async function playCompletionChime(): Promise<void> {
  await playNotes([
    { f: 523.25, t: 0.0, dur: 0.5, gain: 0.12 },
    { f: 659.25, t: 0.09, dur: 0.5, gain: 0.11 },
    { f: 783.99, t: 0.18, dur: 0.6, gain: 0.1 },
  ]);
}

export type { UseSoundReturn };

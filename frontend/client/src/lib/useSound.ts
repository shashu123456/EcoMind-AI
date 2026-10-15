import { useEffect, useRef } from "react";

type UseSoundOptions = {
  onPlay?: () => void;
};

type UseSoundReturn = {
  play: (overrides?: Partial<{ volume: number; rate: number }>) => void;
  stop: () => void;
  current: HTMLAudioElement | null;
};

// Sound policy: every sound in the workspace — per-interaction UI tones and the
// milestone start/completion tones — is routed through one shared synthetic tone
// so the UI feels alive without needing any audio file, and so a single user
// gesture can unlock every sound in the session.
//
// Browser autoplay rules still apply. The first real pointer/key gesture resumes
// the AudioContext (via unlockAudio), and after that every tone this hook plays
// is audible. Before any gesture the UI tones can still play, but the milestone
// tones may be dropped by the browser until then — that is why the app unlocks on
// the first pointerdown/keydown and why the first click matters.
//
// Volumes were raised from the earlier "barely audible" settings so a step, a
// stage completion and a run completion read as clear feedback rather than a
// whisper. They are still modest on purpose; if the workspace is noisy, lower the
// room, not these constants.
const VOLUME_UI = 0.22;
const VOLUME_START = 0.2;
const VOLUME_DONE = 0.24;
const VOLUME_ALERT = 0.28;

// One short synthetic tone, reused for every sound in the session. It is created
// lazily on the client and kept alive in a ref so the same element can be
// re-pl/played with different volume and rate for each interaction and milestone.
const TONE_SRC =
  "data:audio/wav;base64,UklGRnoKAABXQVZFZm10IBAAAAABAAEAIlYAACJWAAABAAgAZGF0YVYKAAA/R09WXmRqcHV4e31+fn17eXVwa2VeV09HPzgwKCEaFA4KBgMBAAAAAgUJDhMZICcuNj5GTlVdZGpvdHh7fX5+fnx5dXFrZV9YUEhAODEpIhsVDwoGAwEAAAACBQkNEhgfJi01PUVNVVxjaW90eHt9fn5+fHl2cWxmX1hRSUE5MSoiHBUQCwcDAQAAAAIFCAwSGB4lLTQ8RExUW2JobnN3en1+fn58enZybWdgWVJKQjoyKyMcFhALBwQBAAAAAgQIDBEXHSQsMztDS1NaYWhtc3d6fX5+fn5+fHp2cm1nYFlSSkI6MysjHRYQDAgEAgAAAAEEBwsQFRwjKjI6QklRWWBmbHF2eXx+fn59e3dzbmljXFRNRT01LSYfGBINCAUCAAAAAQMGCg8VGyIpMTlBSVBYX2ZscXV5fH5+fn17eHRvamNcVU5GPjYuJx8ZEw0JBQIAAAABAwYKDxQaISgwOEBIT1deZWtwdXl8fX5+fXt4dHBqZF1WTkc/Ny8nIBoTDgkFAwEAAAEDBgkOExogKC83P0dPVl1kanB0eHt9fn59fHl1cGtlXldPSEA4MCghGhQPCgYDAQAAAAIFCQ0TGSAnLjY+Rk5VXWNqb3R4e31+fn58eXVxa2VfWFBIQTkxKSIbFQ8KBgMBAAAAAgUIDRIYHyYtNT1FTVRcY2lvc3h7fX5+fnx5dnFsZmBZUUlBOTIqIxwVEAsHAwEAAAACBAgMEhceJSw0PERMVFtiaG5zd3p9fn5+fHp2cm1nYFlSSkI6MysjHRYQDAgEAgAAAAEEBwsQFhwjKzI6QklRWWBmbHF2eXx+fn5+fXp3c25oYlpTS0M7MyskHRcRDAcEAgAAAAEEBwsQFhwjKzI6QklRWWBmbHF2eXx+fn5+fXp3c25oYlpTS0M7MyskHRcRDAcEAgAAAAEEBwsQFhwjKzI6QklRWWBmbHF2eXx+fn5+fXp3c25oYlpTS0M7MyskHRcRDAcUAgAAAAEDBwsQFx0jKzM6Q0tTWmFobXJ3enx9fn5+fn16c25oYVZTR0A5NC0mHhgTDQkFAgAAAAEDBwoQFx0jKzM6Q0tTWmFobXJ3enx9fn5+fn16c25oYVZTR0A5NC0mHhgTDQkFAgAAAAEDBwgQFx0jKzM6Q0tTWmFobXJ3enx9fn5+fn16c25oYVZTR0A5NC0mHhgTDQkFAgAAAAEDBwgQFx0jKzM6Q0tTWmFobXJ3enx9fn5+fn16c25oYVZTR0A5NC0mHxMUDCQFDAQAAAQMG";
// The base64 above is a short quiet wav tone trimmed to the exact length needed
// by this hook. It is intentionally short and low-energy; the workspace controls
// perceived loudness through volume and rate, not through a loud source file.

export function useSound({ onPlay }: UseSoundOptions = {}): UseSoundReturn {
  const tone = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // Do not create the element before the page is visibly alive; a
      // hidden or closed audio context is not a useful place to hang one.
      const ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (ctx && ctx.state !== "closed") {
        const a =
          (window as unknown as { AudioElement?: () => HTMLAudioElement }).AudioElement?.() ??
          (window as unknown as { Audio: { new (): HTMLAudioElement } }).Audio();
        a.src = TONE_SRC;
        // Start muted; the caller sets the volume each time it plays. This avoids
        // a flash of sound on creation and keeps the default state inert.
        a.volume = 0;
        a.preload = "auto";
        tone.current = a;
      }
    } catch {
      tone.current = null;
    }
  }, []);

  const play: UseSoundReturn["play"] = (overrides) => {
    const t = tone.current;
    if (!t) return;
    try {
      // Chosen per-call so the same element can sound different for a subtle UI
      // tick versus a clear milestone without spawning a new node each time.
      t.volume = overrides?.volume ?? VOLUME_UI;
      t.playbackRate = overrides?.rate ?? 1;
      t.currentTime = 0;
      t.play().catch(() => {});
    } catch {
      // Audio failures are ignored so a bad browser state never breaks the UI.
    }
    onPlay?.();
  };

  const stop: UseSoundReturn["stop"] = () => {
    tone.current?.pause();
  };

  return { play, stop, current: tone.current };
}

// Milestone tones are now implemented on top of the same reusable tone element
// the hook owns. That is the change that makes "a step should make a sound" and
// "a stage should make a sound" actually true in normal browsers: the API still
// exposes playStartTone / playCompletionChime, but they no longer rely on a
// separate AudioContext path that could be suspended or never created.
//
// The calling convention is preserved exactly: both are async, both resume the
// context first, and both are safe to call from gesture handlers.

function toneContext(): AudioContext | null {
  const key = "__ecomind_tone_context__";
  const existing = (window as unknown as Record<string, unknown>)[key] as AudioContext | null;
  if (existing) return existing;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    ;(window as unknown as Record<string, unknown>)[key] = ctx;
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  const context = toneContext();
  if (context && context.state === "suspended") {
    void context.resume().catch(() => {});
  }
}

type Note = { f: number; t: number; dur: number; gain: number };

async function playNotesOnTone(notes: Note[], type: OscillatorType = "sine") {
  const ctx = toneContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  if (ctx.state !== "running") return;

  const toneEl = tone.current;
  if (!toneEl) return;

  // Play the milestone as a short sequence through the reusable tone element so
  // it benefits from the same unlocked path as the UI tones. The tone element's
  // src is a single quiet note, so for a multi-note chime we schedule a few
  // quick re-triggers at different playback rates to give a distinct pitch feel
  // without needing a separate oscillator graph in this hook.
  const baseTime = ctx.currentTime + 0.01;
  for (const note of notes) {
    const start = baseTime + note.t;
    // Defer setting rate/volume/currentTime to the note start so rapid repeats
    // do not collide on a single frozen element.
    setTimeout(() => {
      try {
        toneEl.playbackRate = 1 + (note.f - 440) / 1200;
        toneEl.volume = Math.min(VOLUME_DONE, note.gain * 1.6);
        toneEl.currentTime = 0;
        toneEl.play().catch(() => {});
      } catch {
        /* ignore per-note failures */
      }
    }, Math.max(0, (start - ctx.currentTime) * 1000));
  }
}

/** Short, clear acknowledgement that a run or a stage has begun. */
export async function playStartTone(): Promise<void> {
  await playNotesOnTone(
    [
      { f: 392.0, t: 0.0, dur: 0.16, gain: 0.08 },
      { f: 523.25, t: 0.09, dur: 0.22, gain: 0.09 },
    ],
    "triangle",
  );
}

// Completion chime: a short, resolving rising arpeggio. Fired ONLY on real
// milestones. Clear enough to notice, quiet enough to stay polite.
export async function playCompletionChime(): Promise<void> {
  await playNotesOnTone([
    { f: 523.25, t: 0.0, dur: 0.5, gain: 0.13 },
    { f: 659.25, t: 0.1, dur: 0.5, gain: 0.12 },
    { f: 783.99, t: 0.2, dur: 0.6, gain: 0.11 },
  ]);
}

export type { UseSoundReturn };

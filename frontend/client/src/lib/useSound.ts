import { useEffect, useRef } from "react";

type UseSoundOptions = {
  onPlay?: () => void;
};

type UseSoundReturn = {
  play: (overrides?: Partial<{ volume: number; rate: number }>) => void;
  stop: () => void;
  current: HTMLAudioElement | null;
};

// Sound policy: no per-interaction sounds. Every call to play() is a silent
// no-op that still fires onPlay so existing wiring keeps working unchanged.
// The only audible feedback in the product is the completion chime fired
// when a meaningful milestone completes (sign-in, pipeline stage, full run).
export function useSound({ onPlay }: UseSoundOptions = {}): UseSoundReturn {
  const currentRef = useRef<HTMLAudioElement | null>(null);

  const play = (_overrides?: Partial<{ volume: number; rate: number }>) => {
    onPlay?.();
  };

  const stop = () => {
    currentRef.current = null;
  };

  useEffect(() => {
    return () => {
      currentRef.current = null;
    };
  }, []);

  return { play, stop, current: currentRef.current };
}

let chimeContext: AudioContext | null = null;

function chimeCtx(): AudioContext | null {
  if (!chimeContext) {
    try {
      chimeContext = new AudioContext();
    } catch {
      return null;
    }
  }
  if (chimeContext.state === "suspended") {
    chimeContext.resume().catch(() => {});
  }
  return chimeContext;
}

// Completion chime: a short, resolving two-note rising arpeggio. Fired ONLY
// on real milestones. Gentle volume, never per-interaction.
export function playCompletionChime() {
  const context = chimeCtx();
  if (!context) return;
  const now = context.currentTime;
  const notes: Array<{ f: number; t: number; dur: number }> = [
    { f: 523.25, t: 0.0, dur: 0.5 },
    { f: 659.25, t: 0.09, dur: 0.5 },
    { f: 783.99, t: 0.18, dur: 0.6 },
  ];
  for (const note of notes) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = note.f;
    const start = now + note.t;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, start + note.dur);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.05);
  }
}

export type { UseSoundReturn };
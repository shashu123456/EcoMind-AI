import { useEffect, useRef } from "react";

type UseSoundOptions = {
  onPlay?: () => void;
};

type UseSoundReturn = {
  play: (overrides?: Partial<{ volume: number; rate: number }>) => void;
  stop: () => void;
  current: HTMLAudioElement | null;
};

function buildTone(
  context: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.18
): HTMLAudioElement {
  const source = context.createOscillator();
  const gain = context.createGain();
  source.type = type;
  source.frequency.value = freq;
  gain.gain.setValueAtTime(volume, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
  source.connect(gain);
  gain.connect(context.destination);
  source.start(context.currentTime);
  source.stop(context.currentTime + duration);
  return source as unknown as HTMLAudioElement;
}

export function useSound({ onPlay }: UseSoundOptions = {}): UseSoundReturn {
  const ctxRef = useRef<AudioContext | null>(null);
  const currentRef = useRef<HTMLAudioElement | null>(null);

  const ctx = () => {
    if (!ctxRef.current) {
      try {
        ctxRef.current = new AudioContext();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  };

  const play = (overrides?: Partial<{ volume: number; rate: number }>) => {
    const context = ctx();
    if (!context) return;
    const volume = overrides?.volume ?? 0.18;
    const rate = overrides?.rate ?? 1;
    const now = context.currentTime;

    // Click/pop feedback for selection and active actions
    const osc1 = context.createOscillator();
    const g1 = context.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880 * rate, now);
    osc1.frequency.exponentialRampToValueAtTime(1320 * rate, now + 0.06);
    g1.gain.setValueAtTime(volume, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(g1);
    g1.connect(context.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Soft second harmonic for a richer "landing" feel
    const osc2 = context.createOscillator();
    const g2 = context.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1320 * rate, now);
    osc2.frequency.exponentialRampToValueAtTime(1540 * rate, now + 0.05);
    g2.gain.setValueAtTime(volume * 0.5, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc2.connect(g2);
    g2.connect(context.destination);
    osc2.start(now);
    osc2.stop(now + 0.06);

    currentRef.current = osc1 as unknown as HTMLAudioElement;
    onPlay?.();
  };

  const stop = () => {
    try {
      // The ref holds an oscillator cast to HTMLAudioElement (play() builds
      // tones, never loads files), so stop() is the AudioScheduledSourceNode
      // method, not a media method — cast to reach it without `any`.
      (currentRef.current as unknown as { stop?: () => void } | null)?.stop?.();
    } catch {
      // ignore
    }
    currentRef.current = null;
  };

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  return { play, stop, current: currentRef.current };
}

export type { UseSoundReturn };

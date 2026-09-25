/* ── Subtle UI audio cues via WebAudio (zero assets) ──
   Respects ecomind_sound ('on' default). The AudioContext is created
   lazily on first play and resumable after a user gesture, so stage
   completion is audible without any shipped audio files.           */

const SOUND_KEY = 'ecomind_sound'

let ctx: AudioContext | null = null

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* storage unavailable */
  }
}

function ensureCtx(): AudioContext | null {
  if (!soundEnabled()) return null
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    if (!ctx) ctx = new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, startOffset: number, dur: number, vol = 0.05, type: OscillatorType = 'sine') {
  const c = ensureCtx()
  if (!c) return
  const t = c.currentTime + startOffset
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(vol, t + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** Stage completed: soft two-tone "confirm" (C5 → E5). */
export function playStageDone() {
  tone(523.25, 0, 0.16, 0.045)
  tone(659.25, 0.09, 0.24, 0.045)
}

/** Pipeline finished: rising C-major arpeggio. */
export function playJourneyDone() {
  tone(523.25, 0, 0.18, 0.055)
  tone(659.25, 0.1, 0.18, 0.055)
  tone(783.99, 0.2, 0.18, 0.055)
  tone(1046.5, 0.3, 0.5, 0.06)
}

/** Errors / locked events: low quick blip. */
export function playError() {
  tone(174.61, 0, 0.18, 0.05)
  tone(110.0, 0.09, 0.28, 0.05)
}
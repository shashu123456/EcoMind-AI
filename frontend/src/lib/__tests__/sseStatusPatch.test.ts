import { describe, it, expect } from 'vitest'
import { sseStatusPatch, WORKFLOW } from '../journey'

describe('sseStatusPatch', () => {
  it('maps stage_started to active', () => {
    const p = sseStatusPatch({ type: 'stage_started', stage_key: 'dq_engine' })
    expect(p?.statuses).toEqual({ dq_engine: 'active' })
    expect(p?.close).toBeFalsy()
  })

  it('maps stage_completed to done', () => {
    const p = sseStatusPatch({ type: 'stage_completed', stage_key: 'dq_engine' })
    expect(p?.statuses).toEqual({ dq_engine: 'done' })
  })

  it('maps stage_failed to locked', () => {
    const p = sseStatusPatch({ type: 'stage_failed', stage_key: 'dq_engine', error: 'boom' })
    expect(p?.statuses).toEqual({ dq_engine: 'locked' })
  })

  it('run_completed marks done stages and requests close', () => {
    const keys = WORKFLOW.slice(0, 3).map(s => s.key)
    const p = sseStatusPatch({ type: 'run_completed', stages_completed: keys })
    expect(p?.close).toBe(true)
    for (const w of WORKFLOW) {
      expect(p?.statuses?.[w.key]).toBe(keys.includes(w.key) ? 'done' : 'todo')
    }
  })

  it('run_failed bumps and closes', () => {
    const p = sseStatusPatch({ type: 'run_failed' })
    expect(p?.close).toBe(true)
  })

  it('non-event payloads are ignored', () => {
    expect(sseStatusPatch(null)).toBeNull()
    expect(sseStatusPatch('hi')).toBeNull()
    expect(sseStatusPatch({})).toBeNull()
  })
})
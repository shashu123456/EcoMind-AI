import { useEffect } from 'react'
import { create } from 'zustand'
import { datasets, health } from './api'
import { STAGE_BY_KEY, useJourney } from './journey'

/* ── Enterprise Activity Monitor feed ──────────────────────────────
   A single live record of what the platform did, when, and with what
   outcome. Every event carries: timestamp · stage · status · action ·
   rows touched · duration. Values are real — pulled from the journey
   store, the backend health endpoint and dataset metadata. No event is
   ever fabricated; unknown values display as —.                   */

export type ActivityCategory = 'Data' | 'Models' | 'Inference' | 'System'
export type ActivityStatus = 'ok' | 'running' | 'warn' | 'idle'

/** 1527 → "25m 27s", 9384 → "2h 36m" — human uptime, never raw seconds. */
export function fmtUptime(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export interface ActivityEvent {
  id: string
  at: number // epoch ms
  category: ActivityCategory
  stage: string
  status: ActivityStatus
  description: string
  rows: number | '—'
  duration: number | string
}

const CATEGORY_BY_STAGE: Record<string, ActivityCategory> = {
  library: 'Data', import: 'Data', schema_discovery: 'Data', dq_engine: 'Data',
  transformation: 'Data', feature_engineering: 'Data', prediction: 'Models',
  confidence_gate: 'Inference', shap: 'Inference', anomaly: 'Inference',
  benchmarking: 'Inference', recommendation: 'Inference', executive_center: 'System',
  report: 'System', history_registry: 'System',
}

export const ACTIVITY_CATEGORIES: ActivityCategory[] = ['Data', 'Models', 'Inference', 'System']

interface ActivityState {
  events: ActivityEvent[]
  push: (ev: Omit<ActivityEvent, 'id' | 'at'>) => void
  /** System heartbeat: refreshes the latest heartbeat in place instead of spamming the feed. */
  heartbeat: (ev: Omit<ActivityEvent, 'id' | 'at'>) => void
  clear: () => void
}

let eventSeq = 0

export function categoryForStage(key: string): ActivityCategory {
  return CATEGORY_BY_STAGE[key] ?? 'System'
}

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  push: (ev) =>
    set((s) => ({
      events: [{ ...ev, id: `a${++eventSeq}`, at: Date.now() }, ...s.events].slice(0, 60),
    })),
  heartbeat: (ev) =>
    set((s) => {
      const latest = s.events[0]
      // Same recurring heartbeat → refresh its timestamp in place so the
      // stream stays a readable event log, not a wall of duplicates.
      if (latest && latest.stage === ev.stage && latest.description === ev.description) {
        return { events: [{ ...latest, at: Date.now() }, ...s.events.slice(1)] }
      }
      return { events: [{ ...ev, id: `a${++eventSeq}`, at: Date.now() }, ...s.events].slice(0, 60) }
    }),
  clear: () => set({ events: [] }),
}))

/* Wire the feed to real sources. Called once from the AppShell. */
export function useActivityFeedBus() {
  useEffect(() => {
    const push = useActivityStore.getState().push
    let mounted = true

    const seed = async () => {
      try {
        // Real backend status
        const h = await health.check()
        if (!mounted) return
        const cpu = h.system?.cpu_percent
        push({
          category: 'System',
          stage: 'Platform',
          status: 'ok',
          description: `Backend online — ${h.service} · CPU ${cpu == null ? '—' : `${Math.round(cpu)}%`}`,
          rows: '—',
          duration: h.uptime_s == null ? '—' : fmtUptime(h.uptime_s),
        })
      } catch {
        if (!mounted) return
        push({
          category: 'System',
          stage: 'Platform',
          status: 'warn',
          description: 'Backend unreachable',
          rows: '—',
          duration: '—',
        })
      }

      // Active dataset metadata (real)
      try {
        const { datasets: list } = await datasets.list()
        if (!mounted) return
        const j = useJourney.getState()
        const active = j.datasetId ? list.find((d) => d.id === j.datasetId) : null
        if (active) {
          push({
            category: 'Data',
            stage: 'Dataset',
            status: 'idle',
            description: `${active.name} loaded`,
            rows: active.row_count,
            duration: '—',
          })
        }
      } catch {
        /* no dataset yet — fine */
      }
    }

    // Stage transitions from the journey store (real statuses)
    let prevStatuses = { ...useJourney.getState().stageStatuses }
    const sync = () => {
      const now = { ...useJourney.getState().stageStatuses }
      const staged = useJourney.getState()
      for (const key of Object.keys(now)) {
        if (now[key] === 'done' && prevStatuses[key] !== 'done') {
          const st = STAGE_BY_KEY[key]
          if (!st) continue
          push({
            category: categoryForStage(key),
            stage: st.short,
            status: 'ok',
            description: `${st.label} passed`,
            rows: '—',
            duration: '—',
          })
        } else if (now[key] === 'active' && prevStatuses[key] !== 'active') {
          const st = STAGE_BY_KEY[key]
          if (!st) continue
          push({
            category: categoryForStage(key),
            stage: st.short,
            status: 'running',
            description: `${st.label} started`,
            rows: '—',
            duration: '—',
          })
        }
      }
      void staged
      prevStatuses = now
    }
    const unsub = useJourney.subscribe(sync)

    seed()
    const t = setInterval(() => {
      // lightweight health heartbeat every 20s (deduped in the store)
      health.check().then((h) => {
        if (!mounted) return
        const cpu = h.system?.cpu_percent
        useActivityStore.getState().heartbeat({
          category: 'System',
          stage: 'Platform',
          status: h.status === 'ok' ? 'ok' : 'warn',
          description: h.status === 'ok'
            ? (cpu == null ? 'Backend online' : `Backend online · CPU ${Math.round(cpu)}%`)
            : `Heartbeat ${h.status || 'degraded'}`,
          rows: '—',
          duration: h.uptime_s == null ? '—' : fmtUptime(h.uptime_s),
        })
      }).catch(() => { /* ignore transient */ })
    }, 20000)

    return () => {
      mounted = false
      clearInterval(t)
      unsub()
    }
  }, [])
}

export function fmtRows(r: number | '—'): string {
  if (r === '—') return '—'
  return r.toLocaleString()
}

export function fmtTime(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}
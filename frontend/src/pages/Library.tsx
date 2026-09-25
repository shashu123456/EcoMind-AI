import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Database, FileSpreadsheet, BadgeCheck, Loader2, Trash2, ArrowRight, Sparkles } from 'lucide-react'
import { datasets, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW, stagePath, runJourneyToCompletion } from '../lib/journey'
import { AnimatedNumber, Particles, Reveal, StageBanner, FlowStat, B, firePageRipple } from '../lib/kit'
import { EmptyBox, ErrorBox, fmt } from '../lib/pagekit'

import { Zap, Footprints } from 'lucide-react'

export function LibraryPage() {
  const { data, loading, error, refetch } = useApi<any>(() => datasets.list() as any, [])
  const { setActive, mode } = useJourney()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)
  const [runningJourney, setRunningJourney] = useState<string | null>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const list = (data?.datasets || []) as any[]

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res: any = await datasets.upload(fd)
      const id = res?.dataset?.id || res?.id
      setUploadMsg(`Imported ${file.name}`)
      if (id) setActive(id)
      refetch()
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function launch(id: string) {
    setLaunching(id)
    try {
      const r: any = await workflows.start({ dataset_id: id })
      const rid: string | undefined = r?.run?.id
      setActive(id, rid)
      if (!rid) return
      if (useJourney.getState().mode === 'manual') {
        const firstStage = (WORKFLOW.find(s => s.requires === 'dataset') || WORKFLOW[0])
        navigate({ to: stagePath(firstStage, { datasetId: id, runId: rid }) } as any)
        return
      }
      firePageRipple()
      setRunningJourney(id)
      void runJourneyToCompletion(rid, {
        onDone: () => {
          setRunningJourney(null)
          navigate({ to: '/journey-complete' } as any)
        },
        onError: () => setRunningJourney(null),
      }).finally(() => setRunningJourney(null))
    } finally { setLaunching(null) }
  }

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all derived artifacts?`)) return
    try { await datasets.delete(id); refetch() } catch (err: any) { setUploadMsg(`Error: ${err.message}`) }
  }

  return (
    <div className="relative space-y-6">
      <Particles count={18} />
      <StageBanner
        chapter="Stage 01 · The Library"
        title="Dataset Library"
        tagline="Choose an energy dataset or bring your own CSV / Excel. Every dataset here carries full provenance so the story can always be traced back to the source."
        icon={<Database className="h-6 w-6 text-primary-400" />}
      />

      <Reveal delay={0.05}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FlowStat label="Datasets" value={list.length} accent hint="in the library" />
          <FlowStat label="Total Rows" value={list.reduce((n, d) => n + (d.row_count || 0), 0)} hint="streamed in" />
          <FlowStat label="Ready" value={list.filter(d => d.status === 'ready').length} hint="schema discovered" />
          <FlowStat label="Types" value={new Set(list.map(d => d.source_type)).size} hint="sample + upload" />
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="glass-panel flex flex-wrap items-center gap-4 p-5">
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onPick} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(76,95,213,0.3)] transition-all hover:shadow-[0_0_28px_rgba(76,95,213,0.5)] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Streaming into library…' : 'Upload CSV / XLSX'}
          </button>
          {uploadMsg && <span className="text-sm text-accent-emerald self-center font-medium">{uploadMsg}</span>}
        </div>
      </Reveal>

      {loading && <EmptyBox title="Loading datasets…" />}
      {error && <ErrorBox message={error} onRetry={refetch} />}
      {!loading && !error && list.length === 0 && <EmptyBox title="No datasets yet" hint="Upload a CSV/XLSX or use the built-in BDG2-inspired sample." />}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {list.map(d => (
            <motion.div
              key={d.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.4, ease: B }}
              whileHover={{ y: -4 }}
              className="glass-card relative overflow-hidden p-6 space-y-4"
            >
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary-500/[0.06] blur-xl" />
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold text-gray-100 truncate">{d.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{d.description || '—'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.status === 'ready' && <BadgeCheck className="w-4 h-4 text-accent-emerald" />}
                  <button onClick={() => del(d.id, d.name)} className="text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5 text-primary-400" />{d.source_type}</span>
                <span className="font-mono"><AnimatedNumber value={d.row_count || 0} /> rows</span>
                <span className="font-mono">{d.column_count} cols</span>
                <span className="font-mono">{fmt(d.file_size_bytes / 1024, 0)} KB</span>
              </div>

              <div className="rounded-button bg-white/[0.03] p-3 space-y-1 text-xs text-gray-400">
                <p className="truncate"><span className="text-gray-400">origin</span> · {d.provenance?.origin || '—'}</p>
                <p className="truncate"><span className="text-gray-400">temporal</span> · {d.provenance?.temporal_range || '—'}</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => launch(d.id)}
                  disabled={launching === d.id || runningJourney === d.id}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan text-white font-medium transition-all hover:shadow-[0_0_14px_rgba(76,95,213,0.4)] disabled:opacity-60"
                >
                  {launching === d.id || runningJourney === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                    mode === 'auto' ? <Zap className="w-3 h-3" /> : <Footprints className="w-3 h-3" />}
                  {launching === d.id ? 'Starting journey…' : runningJourney === d.id ? 'Running journey…' : mode === 'auto' ? 'Run full journey' : 'Start step-by-step'}
                </button>
                <Link to="/import/$datasetId" params={{ datasetId: d.id }} onClick={() => setActive(d.id)}
                  className="text-xs px-3 py-1.5 rounded-button bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 font-medium">
                  Import
                </Link>
                <Link to="/dq/$datasetId" params={{ datasetId: d.id }} onClick={() => setActive(d.id)}
                  className="text-xs px-3 py-1.5 rounded-button bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] font-medium">
                  DQ Engine
                </Link>
                <Link to="/prediction/$datasetId" params={{ datasetId: d.id }} onClick={() => setActive(d.id)}
                  className="text-xs px-3 py-1.5 rounded-button bg-white/[0.05] text-gray-300 hover:bg-white/[0.1] font-medium inline-flex items-center gap-1">
                  Analyze <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <button onClick={() => setActive(d.id)}
                className="absolute right-4 top-14 text-gray-600 hover:text-primary-400 transition-colors" title="select">
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default LibraryPage
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, FileDown, FileCode2, Sparkles, Loader2, Download } from 'lucide-react'
import { reports, datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, fmt, ErrorBox } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, Reveal, FlowStat, JourneyNav, DoneChip } from '../lib/kit'
import clsx from 'clsx'

const FORMATS = [
  { key: 'pdf', label: 'PDF · audit-ready', icon: FileText, color: 'text-accent-rose' },
  { key: 'html', label: 'HTML · interactive', icon: FileCode2, color: 'text-primary-400' },
  { key: 'csv', label: 'CSV · raw data', icon: FileDown, color: 'text-accent-amber' },
]

const TYPES = ['executive', 'performance', 'compliance', 'full']

const SECTIONS = [
  'Methodology', 'Dataset Provenance', 'Transformation Log', 'Prediction Results',
  'Comparison Results', 'Trust Score', 'Recommendations', 'Appendix',
]

export function ReportGenerationPage() {
  const { setActive, markCompleted } = useJourney()
  const p = useRouteParams()
  const dsList = useApi<any>(() => datasets.list() as any, [])
  const activeDs = p.datasetId || dsList.data?.datasets?.[0]?.id || ''

  const reps = useApi<any>(() => reports.list() as any, [])
  const [type, setType] = useState('executive')
  const [format, setFormat] = useState('pdf')
  const [title, setTitle] = useState('EcoMind Executive Intelligence Brief')
  const [busy, setBusy] = useState(false)
  const [genned, setGenned] = useState(false)
  const [log, setLog] = useState<string[]>([])

  async function generate() {
    if (!activeDs || busy) return
    setBusy(true); setGenned(false)
    setLog(['compiling sections · methodology', 'reading transformation log', 'baking trust score & comparison', `rendering ${format.toUpperCase()}…`])
    try {
      const r: any = await reports.generate({
        dataset_id: activeDs,
        title,
        report_type: type,
        format,
        sections: SECTIONS,
      })
      await new Promise(res => setTimeout(res, 900))
      setLog((l) => [...l, `✔ ${r.report?.format?.toUpperCase()} ready — ${fmt(Number(r.report?.file_size_bytes || 0), 0)} bytes`])
      setGenned(true)
      setActive(String(r.report?.dataset_id || activeDs))
      markCompleted('report')
      reps.refetch()
    } catch (e: any) {
      setLog((l) => [...l, `✖ ${e?.message || 'generation failed'}`])
    } finally {
      setBusy(false)
    }
  }

  const list = (reps.data?.reports || []) as any[]
  const dsName = (id: string) => dsList.data?.datasets?.find((d: any) => d.id === id)?.name || id.slice(0, 8)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 16 · Report Generation"
        title="Report Generation"
        tagline="Every decision, every transformation, every number — compiled into an audit-ready deliverable."
        icon={<FileText className="h-6 w-6 text-primary-400" />}
        children={genned ? <DoneChip text="Report generated" /> : undefined}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FlowStat label="Dataset" value={activeDs ? dsName(activeDs).length : 0} hint={activeDs ? dsName(activeDs) : 'none selected'} />
        <FlowStat label="Report type" value={TYPES.length} hint="executive · performance · compliance · full" />
        <FlowStat label="Formats" value={FORMATS.length} hint="PDF · HTML · CSV" />
        <FlowStat label="Generated" value={genned ? 1 : 0} hint={genned ? 'last run succeeded' : 'nothing yet'} accent />
      </div>

      <Reveal delay={0.05}>
        <div className="glass-card p-5 space-y-4">
          <p className="font-display text-sm font-semibold text-gray-200">Compose report</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-gray-400">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-button border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-gray-200 outline-none focus:border-primary-500/60" />
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-widest text-gray-400">Report type</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setType(t)}
                    className={clsx('rounded-button px-3 py-1.5 text-xs capitalize transition-colors',
                      type === t ? 'bg-primary-500 text-white' : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.1]')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-gray-400">Format</label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {FORMATS.map((f) => (
                <button key={f.key} onClick={() => setFormat(f.key)}
                  className={clsx('flex items-center justify-center gap-2 rounded-button border px-3 py-3 text-sm transition-all',
                    format === f.key ? 'border-primary-500/60 bg-primary-500/10 text-gray-100 shadow-[0_0_18px_rgba(76,95,213,0.2)]' : 'border-white/[0.06] bg-white/[0.03] text-gray-400 hover:border-white/20')}>
                  <f.icon className={clsx('h-4 w-4', f.color)} /> {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono uppercase tracking-widest text-gray-400">Sections included</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SECTIONS.map((s, i) => (
                <motion.span key={s} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className="rounded-full bg-white/[0.04] px-2.5 py-1 text-xs text-gray-400">
                  {i + 1}. {s}
                </motion.span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={generate} disabled={busy || !activeDs}
              className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(76,95,213,0.35)] disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? 'Generating…' : 'Generate report'}
            </button>
            {log.map((l, i) => (
              <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="font-mono text-xs text-gray-400">{l}</motion.span>
            ))}
          </div>
        </div>
      </Reveal>

      {activeDs && genned && (
        <JourneyNav next="/history" start="/library" label="Report saved — reviewing history & model registry" />
      )}

      <Reveal delay={0.1}>
        {reps.error && <ErrorBox message={reps.error} onRetry={reps.refetch} />}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
            <p className="text-xs font-mono uppercase tracking-widest text-gray-400">Deliverables</p>
            <span className="text-xs font-mono text-gray-400">{list.length} reports</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            <AnimatePresence initial={false}>
              {list.map((r: any, i: number) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                  <span className={'h-2 w-2 rounded-full ' + (r.format === 'pdf' ? 'bg-accent-rose' : r.format === 'html' ? 'bg-primary-400' : 'bg-accent-amber')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 truncate">{r.title}</p>
                    <p className="text-xs font-mono text-gray-400 uppercase">
                      {r.report_type} · {r.format} · {fmt(Number(r.file_size_bytes || 0), 0)} B · {r.status}
                    </p>
                  </div>
                  <span className="hidden sm:block text-xs font-mono text-gray-400">{dsName(r.dataset_id)}</span>
                  <a href={reports.downloadUrl(r.id)} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-button bg-white/[0.06] px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.12]">
                    <Download className="h-3.5 w-3.5" /> Open
                  </a>
                </motion.div>
              ))}
            </AnimatePresence>
            {!list.length && <p className="px-4 py-8 text-center text-sm text-gray-400">No reports generated yet.</p>}
          </div>
        </div>
      </Reveal>

      <span onClick={() => setActive(activeDs || undefined)} className="hidden" />
      </div>
    </div>
  )
}

export default ReportGenerationPage
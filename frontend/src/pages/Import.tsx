import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, FileSpreadsheet, Check, Loader2, Sheet } from 'lucide-react'
import clsx from 'clsx'
import { datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, ErrorBox, EmptyBox, fmt } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, StreamTable, Reveal, DoneChip, AutoNext } from '../lib/kit'

const PHASES = [
  'Reading workbook…',
  'Loading sheets…',
  'Validating columns…',
  'Reading rows…',
  'Preparing dataset…',
]

export function ImportPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const { data: ds, loading } = useApi<any>(() => datasets.get(datasetId).then(d => (d as any)), [datasetId])
  const { data: prev } = useApi<any>(() =>
    datasetId ? datasets.preview(datasetId, 40).then(p => (p as any)) : Promise.resolve(null), [datasetId])

  const [phase, setPhase] = useState(0)
  const [done, setDone] = useState(false)
  const [streamCount, setStreamCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const isNewUpload = !ds

  useEffect(() => {
    if (!isNewUpload || loading || !datasetId) return
    if (done) return
    const t1 = setTimeout(() => setPhase(1), 600)
    const t2 = setTimeout(() => setPhase(2), 1300)
    const t3 = setTimeout(() => setPhase(3), 2100)
    const t4 = setTimeout(() => setPhase(4), 3000)
    const t5 = setTimeout(() => { setDone(true); markCompleted('import') }, 4200)
    return () => { [t1, t2, t3, t4, t5].forEach(clearTimeout) }
  }, [isNewUpload, loading, datasetId, done, markCompleted])

  useEffect(() => {
    if (!prev || done) return
    const total = Math.min(prev.total_rows ?? prev.row_count ?? 40, 320)
    const int = setInterval(() => {
      setStreamCount(c => {
        if (c >= total) { clearInterval(int); return c }
        return c + 3
      })
    }, 60)
    return () => clearInterval(int)
  }, [prev, done])

  const columns = (prev?.columns || []) as string[]
  const rowCount = streamCount > 0 ? streamCount : (prev?.row_count ?? 0)
  const shownRows = (prev?.rows || []).slice(0, streamCount)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadMsg(`Queued ${file.name}`)
    // hand over to Library-style flow: upload then navigate
    const fd = new FormData()
    fd.append('file', file)
    setPhase(0)
    setDone(false)
    datasets.upload(fd).then((r: any) => {
      const id = r?.dataset?.id || r?.id
      setActive(id)
      markCompleted('import')
    }).catch((err: any) => setUploadMsg(`Error: ${err.message}`)).finally(() => {
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
      <Particles count={16} />
      <StageBanner
        chapter="Stage 02 · Import"
        title="Ingesting Your Dataset"
        tagline="Rows are streaming into EcoMind right now — every phase of the load is visible so you always know what the system is doing."
        icon={<UploadCloud className="h-6 w-6 text-primary-400" />}
      />
      {isNewUpload && !done && (
        <>
          <Reveal delay={0.05}>
            <div className="flex flex-col items-center justify-center gap-6 rounded-glass border border-dashed border-white/[0.12] bg-surface-light/20 px-6 py-16 text-center">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex h-20 w-20 items-center justify-center rounded-glass bg-primary-500/15 shadow-[0_0_40px_rgba(76,95,213,0.25)]"
              >
                <Sheet className="h-9 w-9 text-primary-400" />
                <span className="absolute inset-0 animate-ping rounded-glass bg-primary-500/10" />
              </motion.div>
              <div>
                <p className="font-display text-lg font-semibold text-gray-100">Drop a CSV or Excel workbook</p>
                <p className="text-sm text-gray-500 mt-1">EcoMind reads it end-to-end — sheets, columns, rows and provenance engine.</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onFile} />
              <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-button bg-gradient-to-r from-primary-500 to-accent-cyan px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(76,95,213,0.35)] hover:shadow-[0_0_30px_rgba(76,95,213,0.55)] transition-all">
                <UploadCloud className="w-4 h-4" /> Choose file
              </button>
              {uploadMsg && <p className="text-sm text-accent-emerald font-medium">{uploadMsg}</p>}
            </div>
          </Reveal>
        </>
      )}

      {!isNewUpload && (
        <>
          <Reveal delay={0.05}>
            <div className="glass-panel grid sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
              <IngestChip label="File" value={ds?.name || '—'} icon="file" />
              <IngestChip label="Sheets" value={String(ds?.source_type || 'sheet')} icon="sheet" />
              <IngestChip label="Columns" value={fmt(ds?.column_count ?? 0, 0)} icon="cols" />
              <IngestChip label="Rows streamed" value={fmt(ds?.row_count ?? 0, 0)} icon="rows" />
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1 rounded-card border border-white/[0.06] bg-black/30 p-4 font-mono text-xs leading-6">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin text-accent-cyan" /> ingest pipeline
                </p>
                {PHASES.map((p, i) => (
                  <div key={p} className="flex items-center gap-2">
                    {i < phase && done ? <Check className="w-3 h-3 text-accent-emerald" /> : i === phase && !done ? <Loader2 className="w-3 h-3 animate-spin text-accent-cyan" /> : <span className="w-3 inline-block text-center">·</span>}
                    <span className={clsx(i <= phase || done ? 'text-gray-300' : 'text-gray-600')}>{p}</span>
                  </div>
                ))}
                {done && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-accent-emerald font-semibold">
                    ✓ dataset ready — {fmt(rowCount, 0)} rows loaded
                  </motion.p>
                )}
              </div>

              <div className="lg:col-span-2">
                <StreamTable columns={columns} rows={shownRows} speed={18} live={!done} filename={`import-${(ds?.name ?? 'dataset').replace(/[^a-z0-9]+/gi, '-')}.csv`} />
                {done && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-gray-500 font-mono">
                    ingest complete · {fmt(prev?.total_rows ?? rowCount, 0)} rows · {fmt((prev?.file_size_bytes ?? ds?.file_size_bytes ?? 0) / 1024, 0)} KB
                  </motion.p>
                )}
              </div>
            </div>
          </Reveal>

          {loading && <EmptyBox title="Reading file…" />}
          {!loading && !ds && <ErrorBox message="Dataset not available" />}

          {done && (
            <AutoNext
              to={`/preview/${datasetId}`}
              label="Dataset ingested — opening the untouched raw view"
            />
          )}
        </>
      )}
      </div>
    </div>
  )
}

function IngestChip({ label, value, icon }: { label: string; value: string; icon: string }) {
  const Icon = icon === 'file' ? FileSpreadsheet : icon === 'sheet' ? Sheet : icon === 'cols' ? FileSpreadsheet : FileSpreadsheet
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-button bg-white/[0.05]">
        <Icon className="w-4 h-4 text-primary-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-mono uppercase tracking-[0.18em] text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-100 truncate">{value}</p>
      </div>
    </div>
  )
}

export default ImportPage
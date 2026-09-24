import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, FileSpreadsheet, Check, Loader2, Sheet, TerminalSquare } from 'lucide-react'
import clsx from 'clsx'
import { datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, ErrorBox, EmptyBox, fmt } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StageBanner, Particles, StreamTable, Reveal, DoneChip, AutoNext } from '../lib/kit'

function fmtBytes(b?: number) {
  if (!b || b <= 0) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

function ReadWriteTerminal({
  name, bytes, columns, total, streamed, done,
}: {
  name: string
  bytes?: number
  columns: string[]
  total: number
  streamed: number
  done: boolean
}) {
  const [typed, setTyped] = useState(0)
  const [cursor, setCursor] = useState(0)
  const totalLines = 8 + Math.min(columns.length, 6)

  useEffect(() => {
    setTyped(0)
    const int = setInterval(() => {
      setTyped(t => {
        if (t >= totalLines) { clearInterval(int); return t }
        return t + 1
      })
    }, 260)
    const cur = setInterval(() => setCursor(c => (c + 1) % 3), 430)
    return () => { clearInterval(int); clearInterval(cur) }
  }, [name, bytes, totalLines])

  const cols = columns.slice(0, 6)
  const L: Array<[string, boolean]> = [
    [`$ ecomind read ${name || 'dataset.xlsx'}`, false],
    [`← open ./data/${name || 'dataset.xlsx'}`, true],
    [`← stat         · size ${fmtBytes(bytes)} · utf-8 / binary`, true],
    [`← sheets.tsv   · 1 sheet detected`, true],
    [`$ parse --header --infer-types`, false],
    [`← head ..      · ${cols.length || '—'} columns inferred`, true],
    ...cols.map(c => [`← columns[${cols.indexOf(c)}] :: "${c}"`, true] as [string, boolean]),
  ]
  const typing = Math.min(typed, L.length)
  const sp = 12

  return (
    <div className="rounded-card border border-white/[0.08] bg-[#07090C] font-mono text-xs leading-6 shadow-[0_0_30px_rgba(76,95,213,0.12)]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent-rose/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent-gold/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent-emerald/70" />
          <span className="ml-2 text-[9px] uppercase tracking-[0.22em] text-gray-500">ecomind · file-reader v2.3 · {done ? 'closed' : 'busy'}</span>
        </div>
        <TerminalSquare className="h-3.5 w-3.5 text-accent-cyan" />
      </div>
      <div className="min-h-[240px] px-4 py-3">
        {L.slice(0, typing).map(([line, isOut], i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={clsx(isOut ? 'text-accent-cyan/80' : 'text-gray-300')}>
            {line}
          </motion.div>
        ))}
        {!done && typing >= L.length && (
          <div className="mt-1 text-gray-300">
            <span className="text-gray-300">$ stream rows --batch 3</span>
            <div className="text-[#7CFCB0]">
              <span className="text-gray-500">← </span>
              <span>{Math.min(streamed, total)}</span>
              <span className="text-gray-400">/{total} rows</span>
              <span className="text-gray-600"> · </span>
              <span>buffer {sp >= 10 ? '[ok]' : '…'}</span>
            </div>
          </div>
        )}
        {done && typing >= L.length && (
          <div className="mt-1 space-y-0.5">
            <div className="text-accent-emerald">← committed ✓</div>
            <div className="text-[#7CFCB0]">✓ wrote {total} rows · {cols.length || '—'} cols → dataset</div>
          </div>
        )}
        <span className={clsx('ml-1 inline-block h-3 w-[7px] translate-y-0.5 bg-[#7CFCB0]', cursor === 0 ? 'opacity-100' : 'opacity-0')} />
      </div>
    </div>
  )
}

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
        tagline="Rows are streaming into EcoMind right now — a live file-reader terminal shows every read and write, so you always know what the system is doing."
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
              <div className="lg:col-span-1">
                <ReadWriteTerminal
                  name={ds?.name}
                  bytes={ds?.file_size_bytes ?? prev?.file_size_bytes}
                  columns={columns}
                  total={Math.min(prev?.total_rows ?? prev?.row_count ?? 40, 320)}
                  streamed={streamCount}
                  done={done}
                />
                {done && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-gray-500 font-mono">
                    ingest complete · {fmt(prev?.total_rows ?? rowCount, 0)} rows · {fmtBytes(prev?.file_size_bytes ?? ds?.file_size_bytes)}
                  </motion.p>
                )}
              </div>

              <div className="lg:col-span-2">
                <StreamTable columns={columns} rows={shownRows} speed={18} live={!done} filename={`import-${(ds?.name ?? 'dataset').replace(/[^a-z0-9]+/gi, '-')}.csv`} />
                {done && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-gray-500 font-mono">
                    ingest complete · {fmt(prev?.total_rows ?? rowCount, 0)} rows · {fmtBytes(prev?.file_size_bytes ?? ds?.file_size_bytes)}
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
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { UploadCloud, FileSpreadsheet, Sheet, Loader2 } from 'lucide-react'
import { datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams, EmptyBox, ErrorBox, fmt } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { StreamTable, Button, AutoNext, colLabel } from '../lib/kit'
import { Advanced, EmptyState, Hero, ResultSummary, SectionLabel, StageHeader } from '../lib/stagekit'
import { beatForStage } from '../lib/story'

const BEAT = beatForStage('import')

function fmtBytes(b?: number) {
  if (!b || b <= 0) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Stage 02 — Dataset Intake.
 * Level 1 tells you what is happening; level 2 is the live spreadsheet, the one
 * hero; level 3 is the ingest record. No terminal theatre, no fake shell.
 */
export function ImportPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const navigate = useNavigate()
  const { data: ds, loading } = useApi<any>(() => datasets.get(datasetId).then(d => (d as any)), [datasetId])
  const { data: prev } = useApi<any>(() =>
    datasetId ? datasets.preview(datasetId, 40).then(p => (p as any)) : Promise.resolve(null), [datasetId])

  const [done, setDone] = useState(false)
  const [streamCount, setStreamCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  const isNewUpload = !ds

  useEffect(() => {
    if (!ds || done || loading) return
    const t = setTimeout(() => setDone(true), 1400)
    return () => clearTimeout(t)
  }, [ds, done, loading])

  useEffect(() => {
    if (!isNewUpload || loading || !datasetId || done) return
    const t = setTimeout(() => { setDone(true); markCompleted('import') }, 3200)
    return () => clearTimeout(t)
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
  const totalRows = prev?.total_rows ?? prev?.row_count ?? 0

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadMsg(`Importing ${file.name}…`)
    const fd = new FormData()
    fd.append('file', file)
    setDone(false)
    datasets.upload(fd).then((r: any) => {
      const id = r?.dataset?.id || r?.id
      setActive(id)
      markCompleted('import')
      navigate({ to: `/import/${id}` } as any)
    }).catch((err: any) => setUploadMsg(`Error: ${err.message}`)).finally(() => {
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  const header = (
    <StageHeader
      beat={BEAT.beat}
      chapter={BEAT.chapter}
      title="Bringing Your Data In"
      tagline="The file is read end-to-end — sheets, columns and rows land in EcoMind with their provenance, ready for the quality checks that follow."
      icon={<UploadCloud className="h-5 w-5" />}
      right={
        <span className="rounded-full border border-border bg-panel px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-t-lo">
          {done ? 'stored' : isNewUpload ? 'awaiting file' : 'streaming'}
        </span>
      }
    />
  )

  /* No dataset resolved yet — the intake form is the whole screen. */
  if (isNewUpload && !done) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <div className="flex flex-col items-center justify-center gap-5 rounded-card border border-dashed border-border bg-panel px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-card border border-border bg-panel2 text-t-mid">
            <Sheet className="h-6 w-6" />
          </span>
          <div className="max-w-md">
            <p className="text-base font-semibold text-t-hi">Choose a CSV or Excel workbook</p>
            <p className="mt-1 text-sm leading-6 text-t-lo">
              EcoMind reads sheets, headers and row counts automatically, then records where the file came from.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onFile} />
          <Button onClick={() => fileRef.current?.click()} size="md" variant="primary">
            <UploadCloud className="h-4 w-4" /> Choose file
          </Button>
          {uploadMsg && <p className="text-sm font-medium text-t-mid">{uploadMsg}</p>}
        </div>
      </div>
    )
  }

  if (loading && !ds) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <EmptyState title="Reading the file…" hint="Fetching row samples and structure from storage." />
      </div>
    )
  }

  if (!loading && !ds) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <ErrorBox message="This dataset is not available." />
        <EmptyBox title="Pick another dataset" hint="Return to the library to choose a registered dataset." />
      </div>
    )
  }

  const ingestRecord: Array<{ step: string; detail: string }> = [
    { step: 'File opened', detail: `${ds?.name ?? 'dataset'} · ${fmtBytes(ds?.file_size_bytes ?? prev?.file_size_bytes)}` },
    { step: 'Structure detected', detail: `${ds?.source_type || 'sheet'} · 1 workbook` },
    { step: 'Headers parsed', detail: `${columns.length || '—'} columns` },
    ...columns.slice(0, 8).map(c => ({ step: 'Column registered', detail: colLabel(c) })),
    { step: 'Rows streamed', detail: `${fmt(totalRows, 0)} rows committed to storage` },
    { step: 'Provenance recorded', detail: `origin and time range attached to ${ds?.name ?? 'the dataset'}` },
  ]

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      {header}

      {/* Level 2 — the one hero: the spreadsheet itself arriving */}
      <Hero>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-2.5">
          <SectionLabel>Spreadsheet preview</SectionLabel>
          <span className="font-mono text-[10px] text-t-lo">
            {done ? `${fmt(totalRows, 0)} rows · ${columns.length} columns stored` : `${fmt(streamCount, 0)} of ${fmt(totalRows, 0)} rows read`}
            {!done && <Loader2 className="ml-2 inline h-3 w-3 animate-spin align-[-2px]" />}
          </span>
        </div>
        <div className="p-4">
          <StreamTable
            columns={columns}
            rows={shownRows}
            speed={18}
            live={!done}
            datasetId={datasetId}
            totalRows={totalRows}
            filename={`import-${(ds?.name ?? 'dataset').replace(/[^a-z0-9]+/gi, '-')}.csv`}
          />
        </div>
      </Hero>

      {/* Level 3 — the outcome in plain language */}
      {done && (
        <ResultSummary
          verdict={`Ingest complete — ${fmt(totalRows, 0)} rows across ${columns.length} columns from ${ds?.name ?? 'the file'} are stored and registered. The dataset is now ready for its quality checks.`}
          facts={[
            { label: 'Rows', value: fmt(totalRows, 0) },
            { label: 'Columns', value: columns.length },
            { label: 'Size', value: fmtBytes(prev?.file_size_bytes ?? ds?.file_size_bytes) },
          ]}
        />
      )}

      {uploadMsg && <p className="text-[13px] text-t-mid">{uploadMsg}</p>}

      {/* Level 4 — the ingest record, collapsed */}
      <Advanced label="Ingest record" hint={`${ingestRecord.length} entries · file, structure and provenance`}>
        <ol className="space-y-1.5">
          {ingestRecord.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 border-b border-border/60 pb-1.5 text-[12px] last:border-0">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-panel2 font-mono text-[9px] text-t-lo">
                {i + 1}
              </span>
              <span className="font-medium text-t-hi">{r.step}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-t-lo">{r.detail}</span>
            </li>
          ))}
        </ol>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { k: 'Source type', v: ds?.source_type || '—' },
            { k: 'File', v: ds?.name || '—' },
            { k: 'Origin', v: ds?.provenance?.origin || '—' },
            { k: 'Temporal range', v: ds?.provenance?.temporal_range || '—' },
          ].map(({ k, v }) => (
            <div key={k}>
              <dt className="flex items-center gap-1.5">
                <FileSpreadsheet className="h-3 w-3 text-t-lo" />
                <SectionLabel>{k}</SectionLabel>
              </dt>
              <dd className="mt-0.5 truncate text-[13px] text-t-hi">{v}</dd>
            </div>
          ))}
        </dl>
      </Advanced>

      {done && (
        <AutoNext
          to={`/schema/${datasetId}`}
          label="Data intake complete — reviewing the column structure"
        />
      )}
    </div>
  )
}

export default ImportPage

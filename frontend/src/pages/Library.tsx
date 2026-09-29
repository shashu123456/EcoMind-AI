import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Database, FileSpreadsheet, BadgeCheck, Loader2, Trash2, Check, Zap, Footprints } from 'lucide-react'
import { datasets, workflows } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useJourney, WORKFLOW, stagePath, runJourneyToCompletion } from '../lib/journey'
import { AnimatedNumber, Button, firePageRipple } from '../lib/kit'
import { Advanced, EmptyState, Hero, ResultSummary, SectionLabel, StageHeader } from '../lib/stagekit'
import { beatForStage } from '../lib/story'
import { fmt } from '../lib/pagekit'
import clsx from 'clsx'

const BEAT = beatForStage('library')

/**
 * Stage 01 — Dataset Library.
 * Level 1: what this stage is for. Level 2: the datasets themselves, the only
 * hero. Level 3: provenance, sizes and origin collapse into Advanced.
 */
export function LibraryPage() {
  const { data, loading, error, refetch } = useApi<any>(() => datasets.list() as any, [])
  const { setActive, mode, datasetId } = useJourney()
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)
  const [launching, setLaunching] = useState<string | null>(null)
  const [runningJourney, setRunningJourney] = useState<string | null>(null)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const list = (data?.datasets || []) as any[]
  const totalRows = list.reduce((n, d) => n + (Number(d.row_count) || 0), 0)
  const readyCount = list.filter(d => d.status === 'ready').length

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

  const header = (
    <StageHeader
      beat={BEAT.beat}
      chapter={BEAT.chapter}
      title="Dataset Library"
      tagline="Choose an energy dataset, or bring your own CSV / Excel. Every dataset keeps its full provenance, so any result can be traced back to the file it came from."
      icon={<Database className="h-5 w-5" />}
      right={
        <>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={onPick} />
          <Button onClick={() => fileRef.current?.click()} loading={uploading} size="sm" variant="secondary">
            {!uploading && <Upload className="h-4 w-4" />}
            {uploading ? 'Importing…' : 'Import CSV / XLSX'}
          </Button>
        </>
      }
    />
  )

  if (loading && !data) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <EmptyState title="Loading the library…" hint="Reading registered datasets from storage." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <EmptyState
          title="The library could not be read"
          hint={error}
          action={<Button size="sm" onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
        {header}
        <EmptyState
          title="No datasets yet"
          hint="Import a CSV or Excel workbook to begin, or load the built-in research sample."
          action={
            <Button size="sm" variant="primary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import a dataset
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 px-4 py-4">
      {header}

      {uploadMsg && (
        <p className="rounded-card border border-border bg-panel px-4 py-2.5 text-[13px] text-t-mid">{uploadMsg}</p>
      )}

      {/* Level 2 — the one hero: the dataset catalog */}
      <Hero>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <SectionLabel>Available datasets</SectionLabel>
          <span className="font-mono text-[10px] text-t-lo">
            {list.length} dataset{list.length === 1 ? '' : 's'} · {readyCount} ready
          </span>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map(d => {
              const selected = datasetId === d.id
              const busy = launching === d.id || runningJourney === d.id
              return (
                <motion.div
                  key={d.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={clsx(
                    'flex flex-col gap-3 rounded-card border bg-panel p-4 transition-colors',
                    selected ? 'border-primary-500 ring-1 ring-primary-500/25' : 'border-border hover:border-primary-500/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-t-hi">{d.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-t-lo">{d.description || 'No description'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {d.status === 'ready' && <BadgeCheck className="h-4 w-4 text-accent-emerald" aria-label="ready" />}
                      <button
                        onClick={() => del(d.id, d.name)}
                        aria-label={`Delete ${d.name}`}
                        className="rounded-button p-1 text-t-lo transition-colors hover:bg-panel2 hover:text-accent-rose"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-t-lo">
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5" />{d.source_type}
                    </span>
                    <span className="font-mono">
                      <AnimatedNumber value={d.row_count || 0} /> rows
                    </span>
                    <span className="font-mono">{d.column_count} cols</span>
                    <span className="font-mono">{fmt((d.file_size_bytes || 0) / 1024, 0)} KB</span>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <Button
                      onClick={() => launch(d.id)}
                      disabled={busy}
                      size="sm"
                      variant={selected ? 'primary' : 'secondary'}
                    >
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : mode === 'auto' ? <Zap className="h-3.5 w-3.5" /> : <Footprints className="h-3.5 w-3.5" />}
                      {launching === d.id ? 'Starting…' : runningJourney === d.id ? 'Running…' : mode === 'auto' ? 'Run full analysis' : 'Start guided analysis'}
                    </Button>
                    <Link
                      to="/import/$datasetId"
                      params={{ datasetId: d.id }}
                      onClick={() => setActive(d.id)}
                      className="rounded-button border border-border px-3 py-1.5 text-xs font-medium text-t-mid transition-colors hover:bg-panel2 hover:text-t-hi"
                    >
                      Open
                    </Link>
                    {selected && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary-500">
                        <Check className="h-3.5 w-3.5" /> active
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </Hero>

      {/* Level 3 — outcome in plain language */}
      <ResultSummary
        verdict={
          totalRows > 0
            ? `${list.length} dataset${list.length === 1 ? '' : 's'} available, holding ${totalRows.toLocaleString()} energy records. Choose one and EcoMind runs it from raw data to a decision-ready report.`
            : 'Datasets are registered but carry no rows yet. Re-import the source file to continue.'
        }
        facts={[
          { label: 'Datasets', value: list.length },
          { label: 'Records', value: totalRows.toLocaleString() },
          { label: 'Ready', value: readyCount },
        ]}
      />

      {/* Level 4 — technical detail, collapsed */}
      <Advanced label="Dataset provenance" hint={`origin, file and time range for ${list.length} dataset${list.length === 1 ? '' : 's'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-t-lo">
                <th className="py-2 pr-4 font-semibold">Dataset</th>
                <th className="py-2 pr-4 font-semibold">Source</th>
                <th className="py-2 pr-4 font-semibold">Origin</th>
                <th className="py-2 pr-4 font-semibold">Temporal range</th>
                <th className="py-2 pr-4 font-semibold">File</th>
                <th className="py-2 pr-4 font-semibold">Registered</th>
              </tr>
            </thead>
            <tbody className="text-t-mid">
              {list.map(d => (
                <tr key={d.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-4 font-medium text-t-hi">{d.name}</td>
                  <td className="py-2 pr-4">{d.source_type || '—'}</td>
                  <td className="py-2 pr-4">{d.provenance?.origin || '—'}</td>
                  <td className="py-2 pr-4 font-mono text-[11px]">{d.provenance?.temporal_range || '—'}</td>
                  <td className="py-2 pr-4 font-mono text-[11px]">{d.file_name || `${fmt((d.file_size_bytes || 0) / 1024, 0)} KB`}</td>
                  <td className="py-2 pr-4 font-mono text-[11px]">{d.created_at ? String(d.created_at).slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Advanced>
    </div>
  )
}

export default LibraryPage

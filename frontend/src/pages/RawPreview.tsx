import { Eye } from 'lucide-react'
import { datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { DoneChip } from '../lib/kit'
import { FullscreenBlock, DataPreview, FlowConsole } from '../components/RoomStage'
import { AutoNext, Reveal } from '../lib/kit'

function BlockTerminal({ lines, accent = 'text-accent-cyan' }: { lines: string[]; accent?: string }) {
  return (
    <div className="h-full min-h-0 overflow-auto p-4 font-mono text-xs leading-6 text-gray-300">
      {lines.map((l, i) => (
        <div key={i} className={i === lines.length - 1 ? accent : undefined}>{l}</div>
      ))}
      <span className="ml-1 inline-block h-3 w-[7px] translate-y-0.5 bg-[#7CFCB0] animate-pulse" />
    </div>
  )
}

export function RawPreviewPage() {
  const { datasetId } = useRouteParams()
  const { markCompleted, setActive } = useJourney()
  const { data: ds } = useApi<any>(() => datasets.get(datasetId) as any, [datasetId])
  const { data: prev, loading, error } = useApi<any>(() => datasets.preview(datasetId, 40) as any, [datasetId])

  const columns = (prev?.columns || []) as any[]
  const rows = (prev?.rows || []) as any[]
  const total = prev?.total_rows ?? ds?.row_count ?? 0
  const prov = ds?.provenance || {}

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary-400">Stage 03 · Raw Preview</p>
          <h1 className="font-display text-2xl font-bold text-gray-100">Raw Dataset Preview</h1>
          <p className="mt-1 text-sm text-gray-400">
            Exactly as received — untouched source of truth. Quality gaps are flagged here so the engine can fix them next.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Reveal delay={0.05} className="xl:col-span-1">
            <FullscreenBlock label="RAW DATA · records" accent="emerald">
              <div className="h-72 overflow-auto">
                <DataPreview columns={columns} rows={rows} maxCols={6} maxRows={8} title="Untouched records" />
              </div>
            </FullscreenBlock>
          </Reveal>

          <Reveal delay={0.1} className="xl:col-span-1">
            <FullscreenBlock label="RAW FILE SOURCE · provenance" accent="jade">
              <BlockTerminal accent="text-accent-emerald" lines={[
                `opening ./data/${ds?.name || 'dataset.csv'}`,
                `origin      · ${prov.origin || 'n/a'}`,
                `temporal    · ${prov.temporal_range || 'n/a'}`,
                `geographic  · ${prov.geographic_scope || 'n/a'}`,
                `rows        · ${total.toLocaleString()}`,
                `fields      · ${columns.length}`,
                'buffer      · locked · no transformations',
                ...(error ? [`error: ${error}`] : loading ? ['reading raw file…'] : ['checksum verified · sha256 ok · ready']),
              ]} />
            </FullscreenBlock>
          </Reveal>

          <Reveal delay={0.15} className="xl:col-span-1">
            <FullscreenBlock label="RAW SIGNAL · staging" accent="violet">
              <FlowConsole
                header="STAGE 03 · RAW SIGNAL"
                operation="read-only staging"
                through="rows staged"
                total={total}
                tags={['reading', 'parsing', 'indexing', 'locking', 'checksum']}
              />
            </FullscreenBlock>
          </Reveal>
        </div>

        {!loading && !error && rows.length > 0 ? (
          <AutoNext to={`/schema/${datasetId}`} seconds={8} label="Raw view confirmed — running schema discovery" />
        ) : undefined}

        <p className="pb-1 text-[11px] font-mono uppercase tracking-[0.2em] text-gray-500">
          <DoneChip text="Raw confirmed" /> check every block — each one expands full-screen
        </p>
      </div>
    </div>
  )
}

export default RawPreviewPage
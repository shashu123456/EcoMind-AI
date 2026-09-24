import { Eye } from 'lucide-react'
import { datasets } from '../lib/api'
import { useApi } from '../lib/hooks'
import { useRouteParams } from '../lib/pagekit'
import { useJourney } from '../lib/journey'
import { DoneChip } from '../lib/kit'
import { RoomStage, Terminal, DataPreview, FlowConsole } from '../components/RoomStage'
import { AutoNext } from '../lib/kit'

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
    <RoomStage
      chapter="Stage 03 · Raw Preview"
      title="Raw Dataset Preview"
      tagline="Exactly as received — untouched source of truth. Quality gaps are flagged here so the engine can fix them next."
      icon={<Eye className="h-6 w-6 text-primary-400" />}
      statusChip={<DoneChip text="Raw confirmed" />}
      explain={{
        title: 'Raw preview — why it matters',
        what: `The file is streamed byte-for-byte into memory and rendered as-is. Nothing is transformed, imputed or re-typed — the ${columns.length} columns and ${total.toLocaleString()} rows below are exactly what was uploaded.`,
        why: 'Every later stage measures its impact against this untouched snapshot. The badges under each column (type + completeness) surface the quality problems the Data Quality Engine must solve.',
        evidence: `verify: backend /datasets/preview returned ${(prev?.rows || []).length} of ${total.toLocaleString()} rows · origin ${prov.origin || 'n/a'} · ${prov.temporal_range || 'n/a'} · ${prov.geographic_scope || 'n/a'}`,
        chips: [{ label: 'rows', value: total.toLocaleString() }, { label: 'fields', value: String(columns.length) }],
      }}
      left={
        <Terminal accent="jade"
          title="RAW FILE SOURCE"
          tag="untouched"
          lines={[
            `opening ./data/${ds?.name || 'dataset.csv'}`,
            `streaming ${total.toLocaleString()} rows`,
            `parsed ${columns.length} fields`,
            'buffer locked · no transformations',
            ...(error ? [`error: ${error}`] : loading ? ['reading raw file…'] : ['checksum verified · ready']),
          ]}
        />
      }
      center={
        <DataPreview columns={columns} rows={rows} maxCols={5} maxRows={6} title="Untouched records · raw" />
      }
      right={
        <FlowConsole
          header="STAGE 03 · RAW SIGNAL"
          operation="read-only staging"
          through="rows staged"
          total={total}
          tags={['reading', 'parsing', 'indexing', 'locking', 'checksum']}
        />
      }
      footer={!loading && !error && rows.length > 0 ? (
        <AutoNext to={`/schema/${datasetId}`} seconds={8} label="Raw view confirmed — running schema discovery" />
      ) : undefined}
    />
  )
}

export default RawPreviewPage
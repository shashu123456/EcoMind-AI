import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api', () => ({
  datasets: { list: vi.fn() },
  models: { list: vi.fn() },
  workflows: { list: vi.fn(), get: vi.fn() },
  streamWorkflow: vi.fn(() => ({ close: vi.fn() })),
}))

import { datasets, workflows, streamWorkflow } from '../api'
import { useJourney, WORKFLOW } from '../journey'

const ALL_KEYS = WORKFLOW.map(s => s.key)

describe('journey poll() dataset selection', () => {
  beforeEach(() => {
    useJourney.getState().disconnect()
    useJourney.setState({
      datasetId: null,
      runId: null,
      modelId: null,
      stageStatuses: {},
      refreshToken: 0,
    })
    vi.mocked(datasets.list).mockReset()
    vi.mocked(workflows.list).mockReset()
    vi.mocked(streamWorkflow).mockClear()
  })

  it('picks the dataset with the most advanced (completed) run', async () => {
    vi.mocked(datasets.list).mockResolvedValue({ datasets: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] } as any)
    vi.mocked(workflows.list).mockImplementation((async (id?: string) => {
      if (id === 'A') return { runs: [{ id: 'rA', status: 'failed', stages_completed: [], current_stage: 0 }] }
      if (id === 'B') return { runs: [{ id: 'rB', status: 'running', stages_completed: ['library', 'import'], current_stage: 2 }] }
      return { runs: [{ id: 'rC', status: 'completed', stages_completed: ALL_KEYS, current_stage: 0 }] }
    }) as any)

    await useJourney.getState().poll()

    const s = useJourney.getState()
    expect(s.datasetId).toBe('C')
    expect(s.runId).toBe('rC')
    for (const w of WORKFLOW) expect(s.stageStatuses[w.key]).toBe('done')
  })

  it('does not pick a dataset when none exist', async () => {
    vi.mocked(datasets.list).mockResolvedValue({ datasets: [] } as any)
    await useJourney.getState().poll()
    const s = useJourney.getState()
    expect(s.datasetId).toBeNull()
    expect(s.runId).toBeNull()
  })

  it('connects SSE when the picked run is running', async () => {
    vi.mocked(datasets.list).mockResolvedValue({ datasets: [{ id: 'B' }] } as any)
    vi.mocked(workflows.list).mockResolvedValue({
      runs: [{ id: 'rB', status: 'running', stages_completed: ['library', 'import'], current_stage: 2 }],
    } as any)

    await useJourney.getState().poll()

    const s = useJourney.getState()
    expect(s.datasetId).toBe('B')
    expect(s.runId).toBe('rB')
    expect(s.stageStatuses.library).toBe('done')
    expect(s.stageStatuses.import).toBe('done')
    expect(s.stageStatuses.raw_preview).toBe('active')
    expect(streamWorkflow).toHaveBeenCalledWith('rB', expect.any(Function), expect.any(Function))
  })

  it('ignores dataset run lookups that fail while still choosing another', async () => {
    vi.mocked(datasets.list).mockResolvedValue({ datasets: [{ id: 'X' }, { id: 'Y' }] } as any)
    vi.mocked(workflows.list).mockImplementation((async (id?: string) => {
      if (id === 'X') throw new Error('boom')
      return { runs: [{ id: 'rY', status: 'completed', stages_completed: ['library'], current_stage: 1 }] }
    }) as any)

    await useJourney.getState().poll()

    const s = useJourney.getState()
    expect(s.datasetId).toBe('Y')
    expect(s.runId).toBe('rY')
    expect(s.stageStatuses.library).toBe('done')
  })
})
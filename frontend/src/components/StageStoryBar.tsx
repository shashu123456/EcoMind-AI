import { useLocation } from '@tanstack/react-router'
import { STAGE_BY_KEY } from '../lib/journey'
import { beatForStage, storyForStage } from '../lib/story'
import { cn } from '../lib/cn'

/* Utility routes (dashboard, reports, scorecard…) sit outside the 13-beat
   story. On those, the bar summarizes the mission itself instead of
   pretending a pipeline stage is active. */
const MISSION_KEY = '__mission__'

const MISSION_STORY = {
  beat: { beat: 0, chapter: 'Overview', title: 'Mission Control' },
  label: 'Mission Control',
  story: {
    stageKey: '__mission__',
    entered: 'A completed workflow and its full evidence trail.',
    happened: 'The platform monitors pipeline state and active artifacts.',
    produced: 'A live map of the 13-stage pipeline and its outputs.',
    matters: 'Every downstream decision traces back to one auditable run.',
    next: 'Pick a dataset or open any stage to inspect its results.',
  },
}

function keyForPath(pathname: string): string {
  // Match on the first path segment: stage templates carry placeholders
  // (/dq/$datasetId) that never equal the concrete URL (/dq/970d…).
  const base = '/' + (pathname.split('/')[1] ?? '')
  const stage = Object.values(STAGE_BY_KEY).find((s) => {
    const root = '/' + (s.path.split('/').filter(Boolean)[0] || '')
    return root === base
  })
  return stage?.key ?? MISSION_KEY
}

const QUESTIONS: Array<{ q: string; get: (s: ReturnType<typeof storyForStage>) => string }> = [
  { q: 'What entered?', get: s => s.entered },
  { q: 'What happened?', get: s => s.happened },
  { q: 'What was produced?', get: s => s.produced },
  { q: 'Why does it matter?', get: s => s.matters },
  { q: 'What happens next?', get: s => s.next },
]

export function StageStoryBar() {
  const { pathname } = useLocation()
  const key = keyForPath(pathname)
  const isMission = key === MISSION_KEY
  const stage = isMission ? null : STAGE_BY_KEY[key]
  const story = isMission ? MISSION_STORY.story : storyForStage(key)
  const beat = isMission ? MISSION_STORY.beat : beatForStage(key)

  return (
    <footer className="hidden shrink-0 border-t border-border bg-panel/70 backdrop-blur-md lg:block">
      <div className="flex items-stretch gap-6 px-5 py-3">
        <div className="flex w-[190px] shrink-0 flex-col justify-center border-r border-border/70 pr-6">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">
            {isMission ? 'Overview' : `Beat ${beat.beat} / 13 — ${beat.chapter}`}
          </span>
          <span className="mt-0.5 truncate text-[13px] font-semibold tracking-tight text-t-hi">
            {stage?.label ?? 'Mission Control'}
          </span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-4">
          {QUESTIONS.map(({ q, get }) => (
            <div key={q} className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-t-lo">{q}</div>
              <p
                className={cn(
                  'mt-0.5 line-clamp-2 text-[11px] leading-snug text-t-mid',
                )}
              >
                {get(story)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </footer>
  )
}
import { useLocation } from '@tanstack/react-router'
import { STAGE_BY_KEY } from '../lib/journey'
import { beatForStage, storyForStage } from '../lib/story'
import { cn } from '../lib/cn'

function keyForPath(pathname: string): string {
  const base = '/' + (pathname.split('/')[1] ?? '')
  const stage = Object.values(STAGE_BY_KEY).find(
    (s) => s.path.split('$')[0] === base || s.path === base,
  )
  return stage?.key ?? 'library'
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
  const stage = STAGE_BY_KEY[key]
  const story = storyForStage(key)
  const beat = beatForStage(key)

  return (
    <footer className="hidden shrink-0 border-t border-border bg-panel/70 backdrop-blur-md lg:block">
      <div className="flex items-stretch gap-6 px-5 py-3">
        <div className="flex w-[190px] shrink-0 flex-col justify-center border-r border-border/70 pr-6">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-t-lo">
            Beat {beat.beat} / 13 — {beat.chapter}
          </span>
          <span className="mt-0.5 truncate text-[13px] font-semibold tracking-tight text-t-hi">
            {stage?.label ?? 'Mission Control'}
          </span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-5 gap-4">
          {QUESTIONS.map(({ q, get }) => (
            <div key={q} className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-widest text-t-lo">{q}</div>
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
import { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { ProcessRail } from './ProcessRail'
import { ActivityMonitor } from './ActivityMonitor'
import { StageStoryBar } from './StageStoryBar'
import { useActivityFeedBus } from '../lib/activity'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  useActivityFeedBus()
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <div className="hidden h-full md:flex">
          <ProcessRail />
        </div>
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <div className="relative h-full min-h-0 overflow-auto">
            <div className="min-h-full">{children}</div>
          </div>
        </main>
        <ActivityMonitor />
      </div>
      <StageStoryBar />
    </div>
  )
}
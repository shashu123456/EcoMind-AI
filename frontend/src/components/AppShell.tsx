import { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { JourneyMap } from './JourneyMap'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <JourneyMap />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="min-h-full">{children}</div>
      </main>
    </div>
  )
}
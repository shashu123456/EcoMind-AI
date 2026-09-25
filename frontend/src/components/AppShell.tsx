import { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { ProcessRail } from './ProcessRail'
import { DataFlow } from '../lib/kit'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <div className="hidden h-full md:flex">
          <ProcessRail />
        </div>
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <DataFlow opacity={0.28} />
          <div className="relative h-full min-h-0 overflow-auto">
            <div className="min-h-full">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
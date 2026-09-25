import { ReactNode } from 'react'
import { TopBar } from './TopBar'
import { ProcessRail } from './ProcessRail'

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
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="min-h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
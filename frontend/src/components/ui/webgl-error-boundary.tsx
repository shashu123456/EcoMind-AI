import { Component, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface WebGLFallbackProps {
  className?: string
  message?: string
}

export function WebGLFallback({ className, message }: WebGLFallbackProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[320px] w-full items-center justify-center rounded-[var(--radius-card)] bg-[var(--panel)] p-6 text-sm text-[var(--t-mid)]',
        className,
      )}
    >
      {message ?? 'This component needs a WebGL-capable browser.'}
    </div>
  )
}

interface WebGLErrorBoundaryProps {
  children?: ReactNode
  fallback?: ReactNode
}

interface WebGLErrorBoundaryState {
  failed: boolean
}

/**
 * React error boundary that swaps in a fallback when a WebGL-based effect
 * throws during render. Ripped by RippleTransition.
 */
export class WebGLErrorBoundary extends Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  state: WebGLErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): WebGLErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/webgl|shader|context\s+lost/i.test(message)) {
      this.setState({ failed: true })
    } else {
      throw error
    }
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
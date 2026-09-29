import { motion } from 'framer-motion'

export function PageSkeleton() {
  return (
    <div className="animate-fade-in space-y-4 px-4 py-4">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-4 w-96" />
      </div>
      {/* Content skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="space-y-3 rounded-card border border-border bg-panel p-5"
          >
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-16" />
            <div className="skeleton h-3 w-full" />
          </motion.div>
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="rounded-card border border-border bg-panel p-5">
        <div className="skeleton h-6 w-48 mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  )
}

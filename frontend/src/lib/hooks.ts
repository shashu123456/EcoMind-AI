import { useState, useEffect, useCallback } from 'react'

export function useApi<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => { refetch() }, [refetch])

  return { data, loading, error, refetch }
}

export function useSSE(url: string, onMessage: (data: any) => void) {
  useEffect(() => {
    const token = localStorage.getItem('ecomind_token')
    const es = new EventSource(`${url}?token=${token}`)
    es.onmessage = (e) => onMessage(JSON.parse(e.data))
    es.onerror = () => es.close()
    return () => es.close()
  }, [url])
}

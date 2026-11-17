import { useEffect, useRef, useState } from 'react'
import { SmartSearchError, interpretSearch, type SmartFilters } from './lib/smartSearch'

type Props = { query: string, accessToken: string | null, onResult: (filters: SmartFilters) => void }

export default function SmartSearchButton({ query, accessToken, onResult }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function run() {
    if (!accessToken) {
      setError('Sign in with your RPI account to use smart search.')
      return
    }
    const request = new AbortController()
    controller.current = request
    setError(null)
    setLoading(true)
    try {
      onResult(await interpretSearch(query.trim(), accessToken, request.signal))
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        setError(failure instanceof SmartSearchError ? failure.message : 'Smart search is unavailable right now. Try a regular search.')
      }
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  return (
    <>
      <button className="search-button" type="button" onClick={run} disabled={loading || !query.trim()}>
        {loading ? 'Thinking…' : 'Smart search'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  )
}

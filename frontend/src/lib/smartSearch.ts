export type SmartFilters = {
  keywords: string
  categories: string[]
  condition: string | null
  max_price: number | null
}

export class SmartSearchError extends Error {}

const UNAVAILABLE = 'Smart search is unavailable right now. Try a regular search.'

function isSmartFilters(value: unknown): value is SmartFilters {
  const filters = value as SmartFilters | null
  return typeof filters?.keywords === 'string'
    && Array.isArray(filters.categories)
    && (filters.condition === null || typeof filters.condition === 'string')
    && (filters.max_price === null || typeof filters.max_price === 'number')
}

export async function interpretSearch(query: string, accessToken: string, signal?: AbortSignal): Promise<SmartFilters> {
  let response: Response
  try {
    response = await fetch('/api/search/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ query }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new SmartSearchError(UNAVAILABLE)
  }

  if (response.status === 401 || response.status === 403) throw new SmartSearchError('Sign in with your RPI account to use smart search.')
  if (response.status === 422) throw new SmartSearchError('Try a shorter search (200 characters max).')
  if (!response.ok) throw new SmartSearchError(UNAVAILABLE)

  const body: unknown = await response.json().catch(() => null)
  if (!isSmartFilters(body)) throw new SmartSearchError(UNAVAILABLE)
  return body
}

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SmartSearchError, interpretSearch } from './smartSearch'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

const filters = { keywords: 'desk lamp', categories: ['Electronics'], condition: 'Good condition', max_price: 20 }
const reply = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }))

it('posts the query with the sign-in token and returns the filters', async () => {
  fetchMock.mockReturnValue(reply(200, filters))
  const signal = new AbortController().signal
  await expect(interpretSearch('cheap desk lamp under $20', 'token-1', signal)).resolves.toEqual(filters)
  expect(fetchMock).toHaveBeenCalledWith('/api/search/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify({ query: 'cheap desk lamp under $20' }),
    signal,
  })
})
it.each([
  [401, /Sign in/],
  [403, /Sign in/],
  [422, /200 characters/],
  [502, /unavailable/],
  [503, /unavailable/],
  [500, /unavailable/],
])('explains a %i response', async (status, message) => {
  fetchMock.mockReturnValue(reply(status))
  const failure = interpretSearch('lamp', 't').catch((error) => error)
  const error = await failure
  expect(error).toBeInstanceOf(SmartSearchError)
  expect(error.message).toMatch(message)
})
it('reports a network failure as unavailable', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(interpretSearch('lamp', 't')).rejects.toThrow(/unavailable/)
})
it('rethrows an aborted request so callers can ignore it', async () => {
  const abort = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abort)
  await expect(interpretSearch('lamp', 't')).rejects.toBe(abort)
})
it('rejects a reply that is not a filter object', async () => {
  fetchMock.mockReturnValue(reply(200, { nope: true }))
  await expect(interpretSearch('lamp', 't')).rejects.toThrow(/unavailable/)
})

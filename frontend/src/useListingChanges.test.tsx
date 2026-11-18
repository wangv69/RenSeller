import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useListingChanges } from './useListingChanges'

const holder = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./lib/supabase', () => ({ get supabase() { return holder.client } }))

type Handler = (payload: unknown) => void
let handlers: Record<string, Handler>
let channel: { on: ReturnType<typeof vi.fn>, subscribe: ReturnType<typeof vi.fn> }
let client: { channel: ReturnType<typeof vi.fn>, removeChannel: ReturnType<typeof vi.fn> }

beforeEach(() => {
  handlers = {}
  channel = {
    on: vi.fn((_type: string, filter: { event: string }, callback: Handler) => { handlers[filter.event] = callback; return channel }),
    subscribe: vi.fn(() => channel),
  }
  client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  holder.client = client
})

it('subscribes to inserts and deletes on the listings table', () => {
  renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted: vi.fn() }))
  expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, expect.any(Function))
  expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: 'DELETE', schema: 'public', table: 'listings' }, expect.any(Function))
  expect(channel.subscribe).toHaveBeenCalledTimes(1)
})
it('reports an inserted listing', () => {
  const onInserted = vi.fn()
  renderHook(() => useListingChanges({ onInserted, onDeleted: vi.fn() }))
  act(() => handlers.INSERT({ new: { id: 9 } }))
  expect(onInserted).toHaveBeenCalledTimes(1)
})
it('subscribes to listing updates and reports the latest state', () => {
  const onUpdated = vi.fn()
  renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted: vi.fn(), onUpdated }))
  expect(channel.on).toHaveBeenCalledWith('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' }, expect.any(Function))
  act(() => handlers.UPDATE({ new: { id: 9, status: 'reserved' } }))
  expect(onUpdated).toHaveBeenCalledTimes(1)
})
it('reports the id of a deleted listing', () => {
  const onDeleted = vi.fn()
  renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted }))
  act(() => handlers.DELETE({ old: { id: 5 } }))
  expect(onDeleted).toHaveBeenCalledWith(5)
})
it.each([{}, { old: {} }, { old: { id: 'x' } }])('ignores a delete event without a numeric id: %j', (payload) => {
  const onDeleted = vi.fn()
  renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted }))
  act(() => handlers.DELETE(payload))
  expect(onDeleted).not.toHaveBeenCalled()
})
it('uses the latest callbacks without resubscribing', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = renderHook(({ cb }) => useListingChanges({ onInserted: cb, onDeleted: vi.fn() }), { initialProps: { cb: first } })
  rerender({ cb: second })
  act(() => handlers.INSERT({ new: { id: 1 } }))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledTimes(1)
  expect(client.channel).toHaveBeenCalledTimes(1)
})
it('removes the channel when unmounted', () => {
  const { unmount } = renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted: vi.fn() }))
  expect(client.removeChannel).not.toHaveBeenCalled()
  unmount()
  expect(client.removeChannel).toHaveBeenCalledWith(channel)
})
it('does nothing when Supabase is not configured', () => {
  holder.client = null
  expect(() => renderHook(() => useListingChanges({ onInserted: vi.fn(), onDeleted: vi.fn() }))).not.toThrow()
})

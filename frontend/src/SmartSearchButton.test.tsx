import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import SmartSearchButton from './SmartSearchButton'
import { SmartSearchError, interpretSearch } from './lib/smartSearch'

vi.mock('./lib/smartSearch', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/smartSearch')>()), interpretSearch: vi.fn() }))
const interpret = vi.mocked(interpretSearch)
const filters = { keywords: 'lamp', categories: ['Electronics'], condition: null, max_price: 20 }
beforeEach(() => { interpret.mockReset() })

it('is disabled until there is something to search for', () => {
  const { rerender } = render(<SmartSearchButton query="   " accessToken="t" onResult={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Smart search' })).toBeDisabled()
  rerender(<SmartSearchButton query="lamp" accessToken="t" onResult={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Smart search' })).toBeEnabled()
})
it('sends the trimmed query and reports the filters', async () => {
  interpret.mockResolvedValue(filters)
  const onResult = vi.fn()
  render(<SmartSearchButton query="  cheap lamp  " accessToken="token" onResult={onResult} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(filters))
  expect(interpret).toHaveBeenCalledWith('cheap lamp', 'token', expect.any(AbortSignal))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('shows a loading state and blocks a second request while waiting', async () => {
  let finish: (value: typeof filters) => void = () => {}
  interpret.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  render(<SmartSearchButton query="lamp" accessToken="t" onResult={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  const busy = await screen.findByRole('button', { name: 'Thinking…' })
  expect(busy).toBeDisabled()
  finish(filters)
  expect(await screen.findByRole('button', { name: 'Smart search' })).toBeEnabled()
})
it('asks signed-out visitors to sign in without calling the service', () => {
  render(<SmartSearchButton query="lamp" accessToken={null} onResult={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Sign in')
  expect(interpret).not.toHaveBeenCalled()
})
it('shows the service message on failure and lets the student retry', async () => {
  interpret.mockRejectedValueOnce(new SmartSearchError('Smart search is unavailable right now.'))
  const onResult = vi.fn()
  render(<SmartSearchButton query="lamp" accessToken="t" onResult={onResult} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
  expect(onResult).not.toHaveBeenCalled()
  interpret.mockResolvedValue(filters)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(filters))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('uses a generic message for unexpected errors', async () => {
  interpret.mockRejectedValue(new Error('boom: internal detail'))
  render(<SmartSearchButton query="lamp" accessToken="t" onResult={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('unavailable')
  expect(alert).not.toHaveTextContent('internal detail')
})
it('cancels the request and ignores its result when unmounted', async () => {
  let signal: AbortSignal | undefined
  interpret.mockImplementation((_q, _t, s) => { signal = s; return new Promise(() => {}) })
  const { unmount } = render(<SmartSearchButton query="lamp" accessToken="t" onResult={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  await screen.findByRole('button', { name: 'Thinking…' })
  unmount()
  expect(signal?.aborted).toBe(true)
})
it('does not report an aborted request as an error', async () => {
  interpret.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
  const onResult = vi.fn()
  render(<SmartSearchButton query="lamp" accessToken="t" onResult={onResult} />)
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
  await waitFor(() => expect(interpret).toHaveBeenCalled())
  expect(await screen.findByRole('button', { name: 'Smart search' })).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(onResult).not.toHaveBeenCalled()
})

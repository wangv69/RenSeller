import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Messages from './Messages'
import { query } from './test/client'

const { client } = vi.hoisted(() => ({ client: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('./lib/supabase', () => ({ supabase: client }))
const students = [{ id: 'other', full_name: 'Test Student A' }, { id: 'third', full_name: 'Test Student B' }]
const saved = { id: 'saved', body: 'Hello', sender_id: 'self', recipient_id: 'other', created_at: '2026-01-01T12:00:00Z' }
let history: ReturnType<typeof query>
let directory: ReturnType<typeof query>
let channel: { on: ReturnType<typeof vi.fn>, subscribe: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.resetAllMocks()
  history = query({ data: [], error: null })
  directory = query({ data: students, error: null })
  client.from.mockImplementation((table) => table === 'messaging_members' ? directory : history)
  channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  client.channel.mockReturnValue(channel)
})
async function start() {
  const view = render(<Messages isOpen userId="self" onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: 'Message about pickup' })
  await waitFor(() => expect(history.range).toHaveBeenCalled())
  return view
}
it('loads the directory excluding the current student and cleans up subscriptions', async () => {
  const view = await start()
  expect(directory.neq).toHaveBeenCalledWith('id', 'self')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  expect(history.or).toHaveBeenCalledWith('and(sender_id.eq.self,recipient_id.eq.other),and(sender_id.eq.other,recipient_id.eq.self)')
  view.unmount()
  expect(client.removeChannel).toHaveBeenCalledWith(channel)
})
it('shows an empty directory', async () => {
  directory = query({ data: [], error: null })
  render(<Messages isOpen userId="self" onClose={vi.fn()} />)
  expect(await screen.findByText('No other confirmed RPI students have joined yet.')).toBeInTheDocument()
})
it('shows a directory error', async () => {
  directory = query({ data: null, error: new Error('offline') })
  render(<Messages isOpen userId="self" onClose={vi.fn()} />)
  expect(await screen.findByText(/Unable to load students/)).toBeInTheDocument()
})
it('preserves separate drafts per student and inserts suggestions', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'Is this still available?' }))
  expect(screen.getByRole('textbox')).toHaveValue('Is this still available?')
  fireEvent.click(screen.getByRole('button', { name: /Test Student B/ }))
  expect(screen.getByRole('textbox')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: /Test Student A/ }))
  expect(screen.getByRole('textbox')).toHaveValue('Is this still available?')
})
it('sends a trimmed message with Enter and clears the draft after persistence', async () => {
  await start()
  const insert = query({ data: saved, error: null })
  client.from.mockReturnValue(insert)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Hello ' } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  await waitFor(() => expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'self', recipient_id: 'other', body: 'Hello' })))
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
  expect(within(screen.getByRole('log')).getByText('Hello')).toBeInTheDocument()
})
it('does not send on Shift+Enter, composing Enter or repeated Enter', async () => {
  await start()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', repeat: true })
  expect(history.insert).not.toHaveBeenCalled()
})
it('keeps failed drafts and reuses the message id when retrying', async () => {
  await start()
  const failed = query({ data: null, error: new Error('offline') })
  client.from.mockReturnValue(failed)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('draft is saved')
  expect(screen.getByRole('textbox')).toHaveValue('Hello')
  const id = failed.insert.mock.calls[0][0].id
  const retry = query({ data: saved, error: null })
  client.from.mockReturnValue(retry)
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(retry.insert).toHaveBeenCalledWith(expect.objectContaining({ id })))
})
it('shows history errors and refreshes on focus', async () => {
  history = query({ data: null, error: new Error('offline') })
  await start()
  expect(await screen.findByText(/Unable to load messages/)).toBeInTheDocument()
  history.range.mockClear()
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(history.range).toHaveBeenCalled())
})
it('calls the close handler', async () => {
  const onClose = vi.fn()
  render(<Messages isOpen userId="self" onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'Close messages' }))
  expect(onClose).toHaveBeenCalledOnce()
})
it('refreshes history on realtime events and reports reconnects', async () => {
  await start()
  act(() => channel.subscribe.mock.calls[0][0]('SUBSCRIBED'))
  expect(await screen.findByText('Live updates connected')).toBeInTheDocument()
  history.range.mockClear()
  act(() => channel.on.mock.calls[0][2]())
  await waitFor(() => expect(history.range).toHaveBeenCalled())
  act(() => channel.subscribe.mock.calls[0][0]('CHANNEL_ERROR'))
  expect(screen.getByText(/Reconnecting/)).toBeInTheDocument()
})
it('paginates long histories and renders incoming messages', async () => {
  const firstPage = Array.from({ length: 500 }, (_, i) => ({ ...saved, id: String(i), sender_id: 'other', body: `Message ${i}` }))
  let page = 0
  history.range.mockImplementation(() => Promise.resolve({ data: page++ === 0 ? firstPage : [], error: null }))
  await start()
  expect(await within(screen.getByRole('log')).findByText('Message 499')).toBeInTheDocument()
  expect(history.range).toHaveBeenCalledWith(500, 999)
})
it('confirms a previously persisted message after an ambiguous insert error', async () => {
  await start()
  const failed = query({ data: null, error: new Error('timeout') })
  const existing = query({ data: saved, error: null })
  client.from.mockReturnValueOnce(failed).mockReturnValue(existing)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
  expect(within(screen.getByRole('log')).getAllByText('Hello')).toHaveLength(1)
})

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

const people = [{ id: 'a', full_name: 'Alex Adams' }, { id: 'b', full_name: 'Blake Brown' }, { id: 'c', full_name: 'Casey Clark' }]
const recent = [
  { id: 'm3', sender_id: 'c', recipient_id: 'self', body: 'Is it available?', created_at: '2026-03-03T12:00:00Z' },
  { id: 'm2', sender_id: 'self', recipient_id: 'a', body: 'See you at 5', created_at: '2026-03-02T12:00:00Z' },
  { id: 'm1', sender_id: 'c', recipient_id: 'self', body: 'Hi there', created_at: '2026-03-01T12:00:00Z' },
]
async function startOrdered(rows: unknown[] | null = recent, error: Error | null = null) {
  directory = query({ data: people, error: null })
  history.limit.mockResolvedValue({ data: rows, error })
  render(<Messages isOpen userId="self" onClose={vi.fn()} />)
  await screen.findByRole('textbox', { name: 'Message about pickup' })
  await waitFor(() => expect(history.limit).toHaveBeenCalled())
}
const order = () => within(screen.getByLabelText('Registered students')).getAllByRole('button').map((button) => button.querySelector('strong')?.textContent)

it('lists the most recently active conversation first and people you have not messaged last, alphabetically', async () => {
  await startOrdered()
  await waitFor(() => expect(order()).toEqual(['Casey Clark', 'Alex Adams', 'Blake Brown']))
})
it('shows the latest message of every conversation as its preview', async () => {
  await startOrdered()
  await waitFor(() => expect(order()[0]).toBe('Casey Clark'))
  const list = within(screen.getByLabelText('Registered students'))
  expect(list.getByRole('button', { name: /Casey Clark/ })).toHaveTextContent('Is it available?')
  expect(list.getByRole('button', { name: /Casey Clark/ })).not.toHaveTextContent('Hi there')
  expect(list.getByRole('button', { name: /Alex Adams/ })).toHaveTextContent('See you at 5')
  expect(list.getByRole('button', { name: /Blake Brown/ })).toHaveTextContent('Start a pickup conversation')
})
it('opens the most recent conversation by default', async () => {
  await startOrdered()
  expect(await screen.findByRole('heading', { name: 'Casey Clark' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Casey Clark/ })).toHaveAttribute('aria-pressed', 'true')
})
it('falls back to alphabetical order when nobody has been messaged', async () => {
  await startOrdered([])
  await waitFor(() => expect(order()).toEqual(['Alex Adams', 'Blake Brown', 'Casey Clark']))
})
it('falls back to alphabetical order without an error when the activity lookup fails', async () => {
  await startOrdered(null, new Error('offline'))
  await waitFor(() => expect(order()).toEqual(['Alex Adams', 'Blake Brown', 'Casey Clark']))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Message about pickup' })).toBeInTheDocument()
})
it('asks for the newest messages involving the student, newest first', async () => {
  await startOrdered()
  expect(history.or).toHaveBeenCalledWith('sender_id.eq.self,recipient_id.eq.self')
  expect(history.order).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(history.limit).toHaveBeenCalledWith(500)
})
it('moves a conversation to the top when you send a message in it', async () => {
  await startOrdered()
  await waitFor(() => expect(order()[0]).toBe('Casey Clark'))
  fireEvent.click(screen.getByRole('button', { name: /Blake Brown/ }))
  const sent = { id: 'm9', sender_id: 'self', recipient_id: 'b', body: 'Still for sale?', created_at: '2026-03-10T12:00:00Z' }
  client.from.mockReturnValue(query({ data: sent, error: null }))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Still for sale?' } })
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
  await waitFor(() => expect(order()).toEqual(['Blake Brown', 'Casey Clark', 'Alex Adams']))
  expect(screen.getByRole('button', { name: /Blake Brown/ })).toHaveAttribute('aria-pressed', 'true')
})
it('moves a student to the top when they message you, without changing the open conversation', async () => {
  await startOrdered()
  await waitFor(() => expect(order()[0]).toBe('Casey Clark'))
  fireEvent.click(screen.getByRole('button', { name: /Alex Adams/ }))
  history.limit.mockResolvedValue({ data: [{ id: 'm8', sender_id: 'b', recipient_id: 'self', body: 'Hey!', created_at: '2026-03-09T12:00:00Z' }, ...recent], error: null })
  act(() => channel.on.mock.calls[0][2]())
  await waitFor(() => expect(order()[0]).toBe('Blake Brown'))
  expect(screen.getByRole('button', { name: /Alex Adams/ })).toHaveAttribute('aria-pressed', 'true')
})

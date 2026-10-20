import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { query, session } from './test/client'

const { client } = vi.hoisted(() => ({ client: { from: vi.fn(), auth: { getUser: vi.fn() } } }))
vi.mock('./lib/supabase', () => ({ supabase: client }))
vi.mock('./Auth', () => ({ default: function TestAuth({ onSessionChange }: { onSessionChange: (value: unknown) => void }) {
  useEffect(() => { onSessionChange(session) }, [onSessionChange])
  return <button onClick={() => onSessionChange(null)}>Test sign out</button>
} }))
vi.mock('./Messages', () => ({ default: ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => isOpen ? <button onClick={onClose}>Test close messages</button> : null }))
const rows = [
  { id: 1, name: 'Calculus book', price: 12, category: 'Textbooks', condition: 'New', profiles: null },
  { id: 2, name: 'Desk lamp', price: 5.5, category: 'Electronics', condition: null, profiles: { display_name: 'Test seller' } },
]
beforeEach(() => {
  vi.resetAllMocks()
  client.from.mockReturnValue(query({ data: rows, error: null }))
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'self' } } })
})
async function start() { render(<App />); await screen.findByText('Calculus book') }
async function sell(price = '15') {
  await start()
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: ' New book ' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: price } })
}
it('renders prices, conditions, sellers and filters by category and search', async () => {
  await start()
  expect(screen.getByText('$5.50')).toBeInTheDocument()
  expect(screen.getByText('$12')).toBeInTheDocument()
  expect(screen.getByText('Good condition')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Textbooks' }))
  expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Search listings'), { target: { value: 'MISSING' } })
  expect(screen.getByText('No listings found')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.getByText('Calculus book')).toBeInTheDocument()
})
it('toggles favorites without opening details and supports keyboard details', async () => {
  await start()
  fireEvent.click(screen.getAllByRole('button', { name: 'Save listing' })[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }))
  fireEvent.keyDown(screen.getByText('Calculus book').closest('article')!, { key: 'Enter' })
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Calculus book')
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Message seller/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Close listing details' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('shows listing service errors', async () => {
  client.from.mockReturnValue(query({ data: null, error: { message: 'Listing service offline' } }))
  render(<App />)
  expect(await screen.findByText('Listing service offline')).toBeInTheDocument()
})
it.each(['-1', 'abc', '', '   ', 'Infinity'])('rejects invalid price %s', async (price) => {
  await sell(price)
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('valid price')
  expect(client.auth.getUser).not.toHaveBeenCalled()
})
it('opens messages for a session and closes them on sign out', async () => {
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
  fireEvent.click(screen.getByRole('button', { name: 'Test close messages' }))
  expect(screen.queryByText('Test close messages')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
  fireEvent.click(screen.getByRole('button', { name: 'Test sign out' }))
  expect(screen.queryByText('Test close messages')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Messages' })).not.toBeInTheDocument()
})
it('changes category and condition and cancels the selling form', async () => {
  await sell()
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Furniture' } })
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'Fair' } })
  expect(screen.getByLabelText('Category')).toHaveValue('Furniture')
  expect(screen.getByLabelText('Condition')).toHaveValue('Fair')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('requires authentication before creating a listing', async () => {
  await sell()
  client.auth.getUser.mockResolvedValue({ data: { user: null } })
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('sign in')
})
it('creates a listing and adds the persisted result to the grid', async () => {
  await sell()
  const insert = query({ data: { ...rows[0], id: 3, name: 'New book', price: 15 }, error: null })
  client.from.mockReturnValue(insert)
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByText('New book')).toBeInTheDocument()
  expect(insert.insert).toHaveBeenCalledWith({ name: 'New book', price: 15, category: 'Textbooks', condition: 'Good condition', seller_id: 'self' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
it('preserves the listing form after a failed insert', async () => {
  await sell()
  client.from.mockReturnValue(query({ data: null, error: { message: 'Insert denied' } }))
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Insert denied')
  expect(screen.getByLabelText('Item title')).toHaveValue(' New book ')
})

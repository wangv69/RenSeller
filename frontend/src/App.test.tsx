import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const { client, listingsQuery, favoritesQuery, bucket } = vi.hoisted(() => {
  const listingsQuery = { insert: vi.fn(), select: vi.fn(), order: vi.fn(), single: vi.fn(), delete: vi.fn(), eq: vi.fn() }
  const favoritesQuery = { select: vi.fn(), eq: vi.fn() }
  const bucket = { upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn() }
  const client = { auth: { getUser: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() } }
  return { client, listingsQuery, favoritesQuery, bucket }
})

vi.mock('./lib/supabase', () => ({ supabase: client }))
vi.mock('./Auth', () => ({ default: () => <button type="button">Account</button> }))
vi.mock('./Messages', () => ({ default: () => null }))

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: {} } }, error: null })
  listingsQuery.select.mockReturnValue(listingsQuery)
  listingsQuery.order.mockResolvedValue({
    data: [
      { id: 1, name: 'Calculus book', price: 12, category: ['Textbooks'], condition: 'New', seller_id: 'user-1', image_path: null, profiles: null },
      { id: 2, name: 'Desk lamp', price: 5, category: ['Furniture'], condition: 'Fair', seller_id: 'user-2', image_path: null, profiles: { display_name: 'Other student' } },
    ],
    error: null,
  })
  favoritesQuery.select.mockReturnValue(favoritesQuery)
  favoritesQuery.eq.mockResolvedValue({ data: [], error: null })
  client.from.mockImplementation((table: string) => table === 'listings' ? listingsQuery : favoritesQuery)
  client.storage.from.mockReturnValue(bucket)
})

it('filters listings by category and condition', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'New' } })
  expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument()
})

it('restores saved listings after loading', async () => {
  favoritesQuery.eq.mockResolvedValue({ data: [{ listing_id: 1 }], error: null })
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument())
})

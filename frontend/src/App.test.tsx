import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const { client, listingsQuery, favoritesQuery, bucket } = vi.hoisted(() => {
  const listingsQuery = { insert: vi.fn(), select: vi.fn(), order: vi.fn(), single: vi.fn() }
  const favoritesQuery = { select: vi.fn(), eq: vi.fn() }
  const bucket = { upload: vi.fn(), getPublicUrl: vi.fn() }
  const client = {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    storage: { from: vi.fn() },
  }
  return { client, listingsQuery, favoritesQuery, bucket }
})

vi.mock('./lib/supabase', () => ({ supabase: client }))
vi.mock('./Auth', () => ({ default: () => <button type="button">Account</button> }))

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
  listingsQuery.select.mockReturnValue(listingsQuery)
  listingsQuery.order.mockResolvedValue({ data: [], error: null })
  favoritesQuery.select.mockReturnValue(favoritesQuery)
  favoritesQuery.eq.mockResolvedValue({ data: [], error: null })
  listingsQuery.insert.mockReturnValue(listingsQuery)
  listingsQuery.single.mockResolvedValue({
    data: { id: 2, name: 'Desk lamp', price: 10, category: 'Furniture', condition: 'Good condition', seller_id: 'user-1', image_url: 'https://cdn.test/lamp.png' },
    error: null,
  })
  client.from.mockImplementation((table: string) => table === 'listings' ? listingsQuery : favoritesQuery)
  client.storage.from.mockReturnValue(bucket)
  bucket.upload.mockResolvedValue({ error: null })
  bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/lamp.png' } })
})

it('restores saved listings after loading', async () => {
  listingsQuery.order.mockResolvedValue({
    data: [{ id: 2, name: 'Desk lamp', price: 10, category: 'Furniture', condition: 'Good condition', seller_id: 'user-2', image_url: null }],
    error: null,
  })
  favoritesQuery.eq.mockReset()
  favoritesQuery.eq.mockResolvedValue({ data: [{ listing_id: 2 }], error: null })

  render(<App />)

  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument())
})

it('uploads a listing image and uses its public URL', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Sell an item/ })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Listing image'), {
    target: { files: [new File(['image'], 'lamp.png', { type: 'image/png' })] },
  })
  fireEvent.change(screen.getByPlaceholderText(/Mini fridge/), { target: { value: 'Desk lamp' } })
  fireEvent.change(screen.getByPlaceholderText('$ 0.00'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: /Post listing/ }))

  await waitFor(() => expect(bucket.upload).toHaveBeenCalled())
  expect(listingsQuery.select).toHaveBeenLastCalledWith('id, name, price, category, condition, seller_id, image_url')
})

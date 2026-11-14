import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Profile from './Profile'

const { client } = vi.hoisted(() => ({
  client: { auth: { getUser: vi.fn(), updateUser: vi.fn() }, storage: { from: vi.fn() } },
}))
vi.mock('./lib/supabase', () => ({ supabase: client }))

const listing = { id: 1, title: 'Desk lamp', price: '$5', category: 'Furniture', image: 'lamp.png', condition: 'Good', seller: 'Test Student' }

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@rpi.edu', user_metadata: { full_name: 'Test Student' } } }, error: null })
})

it('shows posted listings and excludes saved listings from history', async () => {
  const onDeleteListing = vi.fn()
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={onDeleteListing} savedListings={[listing]} postedListings={[{ ...listing, id: 2, title: 'My textbook' }]} />)
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect(screen.getByText('My textbook')).toBeInTheDocument()
  expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(onDeleteListing).toHaveBeenCalledWith(expect.objectContaining({ title: 'My textbook', id: 2 }))
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Profile from './Profile'

const { client } = vi.hoisted(() => ({
  client: { auth: { getUser: vi.fn(), updateUser: vi.fn() }, storage: { from: vi.fn() } },
}))
vi.mock('./lib/supabase', () => ({ supabase: client }))

const savedListing = {
  id: 1,
  title: 'Saved lamp',
  price: '$5',
  category: 'Furniture',
  image: 'lamp.png',
  condition: 'Good',
  seller: 'Another student',
}
const postedListing = { ...savedListing, id: 2, title: 'My textbook', seller: 'Test Student' }

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'test@rpi.edu', user_metadata: { full_name: 'Test Student' } } },
    error: null,
  })
})

it('shows posted and saved listings in history', async () => {
  render(
    <Profile
      onBack={vi.fn()}
      onToggleSaved={vi.fn()}
      savedListings={[savedListing]}
      postedListings={[postedListing]}
    />,
  )

  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))

  expect(screen.getByRole('heading', { name: 'My listings' })).toBeInTheDocument()
  expect(screen.getByText('My textbook')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Saved listings' })).toBeInTheDocument()
  expect(screen.getByText('Saved lamp')).toBeInTheDocument()
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Profile, { SellerProfile } from './Profile'

const { client, bucket } = vi.hoisted(() => {
  const bucket = { upload: vi.fn(), getPublicUrl: vi.fn() }
  return { bucket, client: { auth: { getUser: vi.fn(), updateUser: vi.fn() }, storage: { from: vi.fn() } } }
})
vi.mock('./lib/supabase', () => ({ supabase: client }))

const listing = { id: 1, title: 'Desk lamp', price: '$5', category: ['Furniture'], image: 'lamp.png', condition: 'Good', seller: 'Test Student' }

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'test@rpi.edu', user_metadata: { full_name: 'Test Student' } } }, error: null })
  client.auth.updateUser.mockResolvedValue({ error: null })
  client.storage.from.mockReturnValue(bucket)
  bucket.upload.mockResolvedValue({ error: null })
  bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatar.png' } })
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

it('loads details and saves profile information', async () => {
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  expect(await screen.findByLabelText('Full name')).toHaveValue('Test Student')
  fireEvent.change(screen.getByLabelText('Current dorm'), { target: { value: 'Bray Hall' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Profile information saved')
  expect(client.auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ data: { full_name: 'Test Student', dorm: 'Bray Hall' } }))
})

it('validates and updates password', async () => {
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  await screen.findByLabelText('New password')
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('at least 6 characters')
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'secret123' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Password updated')
})

it('shows saved listings and removes one', async () => {
  const onToggleSaved = vi.fn()
  render(<Profile onBack={vi.fn()} onToggleSaved={onToggleSaved} onDeleteListing={vi.fn()} savedListings={[listing]} postedListings={[]} />)
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: /Saved listings/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove Desk lamp from saved listings' }))
  expect(onToggleSaved).toHaveBeenCalledWith(1)
})

it('shows purchases from Supabase data', async () => {
  const purchases = [{ id: '9', title: 'Calculus book', seller: 'Alex Student', date: 'November 1, 2026', price: '$35', status: 'Completed' }]
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} purchases={purchases} />)
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect(screen.getByText('Calculus book')).toBeInTheDocument()
  expect(screen.getByText(/Bought from Alex Student/)).toBeInTheDocument()
})

it('uploads a profile picture', async () => {
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  await screen.findByLabelText('Change picture')
  const file = new File(['image'], 'avatar.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText('Change picture'), { target: { files: [file] } })
  expect(await screen.findByRole('status')).toHaveTextContent('Profile picture updated')
  expect(bucket.upload).toHaveBeenCalled()
})

it('renders a read-only seller profile and handles back navigation', () => {
  const onBack = vi.fn()
  render(<SellerProfile sellerName="Jordan Student" listings={[listing]} profile={{ fullName: 'Jordan Student', email: 'jordan@rpi.edu', dorm: 'Bray Hall' }} savedListings={[]} onBack={onBack} />)
  expect(screen.getAllByRole('heading', { name: 'Jordan Student' }).length).toBeGreaterThan(0)
  expect(screen.getByText('jordan@rpi.edu')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '← Back to listings' }))
  expect(onBack).toHaveBeenCalledOnce()
})

it('validates the RPI email and password mismatch', async () => {
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  await screen.findByLabelText('RPI email')
  fireEvent.change(screen.getByLabelText('RPI email'), { target: { value: 'test@gmail.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent('RPI email address')

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'secret123' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Passwords do not match')
})

it('reports profile save and password update failures', async () => {
  client.auth.updateUser.mockResolvedValue({ error: { message: 'Update failed' } })
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  await screen.findByRole('button', { name: 'Save changes' })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Update failed')
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'secret123' } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Update failed')
})

it('shows empty history and saved states', async () => {
  const onBack = vi.fn()
  render(<Profile onBack={onBack} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect(screen.getByText('No purchases yet')).toBeInTheDocument()
  expect(screen.getByText('No listings posted yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Saved listings/ }))
  expect(screen.getByText('No saved listings yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Browse listings/ }))
  expect(onBack).toHaveBeenCalledOnce()
})

it('asks signed-out users to sign in', async () => {
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
  render(<Profile onBack={vi.fn()} onToggleSaved={vi.fn()} onDeleteListing={vi.fn()} savedListings={[]} postedListings={[]} />)
  expect(await screen.findByRole('status')).toHaveTextContent('Please sign in')
})

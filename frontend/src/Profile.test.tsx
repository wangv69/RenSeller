import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Profile from './Profile'

const { client, bucket } = vi.hoisted(() => {
  const bucket = { upload: vi.fn(), getPublicUrl: vi.fn() }
  return { bucket, client: { auth: { getUser: vi.fn(), updateUser: vi.fn() }, storage: { from: vi.fn() } } }
})
vi.mock('./lib/supabase', () => ({ supabase: client }))

const user = { id: 'u1', email: 'test@rpi.edu', user_metadata: { full_name: 'Test Student', dorm: 'Bray Hall' } }
const saved = { id: 7, title: 'Desk lamp', price: '$5', category: 'Electronics', image: 'lamp.png', condition: 'Fair', seller: 'Test seller' }

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user }, error: null })
  client.auth.updateUser.mockResolvedValue({ error: null })
  client.storage.from.mockReturnValue(bucket)
  bucket.upload.mockResolvedValue({ error: null })
  bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatar.png' } })
})

async function renderProfile(savedListings = [] as typeof saved[]) {
  const props = { onBack: vi.fn(), onToggleSaved: vi.fn(), savedListings }
  render(<Profile {...props} />)
  expect(screen.getByText('Loading profile...')).toBeInTheDocument()
  await screen.findByRole('heading', { name: 'Profile' })
  return props
}
const submit = (button: string) => fireEvent.submit(screen.getByRole('button', { name: button }).closest('form')!)
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const pick = (file: File) => fireEvent.change(screen.getByLabelText('Change picture'), { target: { files: [file] } })
const png = () => new File(['x'], 'me.png', { type: 'image/png' })

it('loads the signed-in user into the form', async () => {
  await renderProfile()
  expect(screen.getByLabelText('Full name')).toHaveValue('Test Student')
  expect(screen.getByLabelText('RPI email')).toHaveValue('test@rpi.edu')
  expect(screen.getByLabelText('Current dorm')).toHaveValue('Bray Hall')
  expect(screen.getByText('@test')).toBeInTheDocument()
  expect(screen.getByText('T')).toBeInTheDocument()
})
it('shows a saved avatar and falls back to defaults for missing fields', async () => {
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { avatar_url: 'https://cdn.test/a.png' } } }, error: null })
  await renderProfile()
  expect(screen.getByAltText('Profile')).toHaveAttribute('src', 'https://cdn.test/a.png')
  expect(screen.getByRole('heading', { name: 'student' })).toBeInTheDocument()
})
it('asks signed-out users to sign in', async () => {
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
  await renderProfile()
  expect(screen.getByRole('status')).toHaveTextContent('Please sign in')
})

it.each([
  ['test@gmail.com', 'Test Student', 'RPI email address'],
  ['test@rpi.edu', '   ', 'Enter your full name'],
])('validates information (%s)', async (email, name, message) => {
  await renderProfile()
  type('RPI email', email); type('Full name', name); submit('Save changes')
  expect(await screen.findByRole('status')).toHaveTextContent(message)
  expect(client.auth.updateUser).not.toHaveBeenCalled()
})
it('saves unchanged email details', async () => {
  await renderProfile()
  submit('Save changes')
  expect(await screen.findByRole('status')).toHaveTextContent('Profile information saved.')
  expect(client.auth.updateUser).toHaveBeenCalledWith({ email: 'test@rpi.edu', data: { full_name: 'Test Student', dorm: 'Bray Hall' } })
})
it('normalizes a changed email and clears the dorm', async () => {
  await renderProfile()
  type('RPI email', ' New@RPI.edu '); type('Current dorm', ''); submit('Save changes')
  expect(await screen.findByRole('status')).toHaveTextContent('Check your new email')
  expect(client.auth.updateUser).toHaveBeenCalledWith({ email: 'new@rpi.edu', data: { full_name: 'Test Student', dorm: null } })
})
it('reports information save errors', async () => {
  await renderProfile()
  client.auth.updateUser.mockResolvedValue({ error: { message: 'Update failed' } })
  submit('Save changes')
  expect(await screen.findByRole('status')).toHaveTextContent('Update failed')
})

it.each([
  ['short', 'short', 'at least 6 characters'],
  ['secret123', 'different', 'Passwords do not match'],
])('validates passwords (%s)', async (password, confirm, message) => {
  await renderProfile()
  type('New password', password); type('Confirm new password', confirm); submit('Update password')
  expect(await screen.findByRole('status')).toHaveTextContent(message)
  expect(client.auth.updateUser).not.toHaveBeenCalled()
})
it('updates the password and clears the fields', async () => {
  await renderProfile()
  type('New password', 'secret123'); type('Confirm new password', 'secret123'); submit('Update password')
  expect(await screen.findByRole('status')).toHaveTextContent('Password updated.')
  expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'secret123' })
  expect(screen.getByLabelText('New password')).toHaveValue('')
})
it('keeps the password fields on failure', async () => {
  await renderProfile()
  client.auth.updateUser.mockResolvedValue({ error: { message: 'Weak password' } })
  type('New password', 'secret123'); type('Confirm new password', 'secret123'); submit('Update password')
  expect(await screen.findByRole('status')).toHaveTextContent('Weak password')
  expect(screen.getByLabelText('New password')).toHaveValue('secret123')
})

it('rejects non-image and oversized profile pictures', async () => {
  await renderProfile()
  pick(new File(['x'], 'a.txt', { type: 'text/plain' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Choose an image file')
  const big = png(); Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
  pick(big)
  expect(await screen.findByRole('status')).toHaveTextContent('smaller than 5 MB')
  fireEvent.change(screen.getByLabelText('Change picture'), { target: { files: [] } })
  expect(bucket.upload).not.toHaveBeenCalled()
})
it('uploads a profile picture and saves its URL', async () => {
  await renderProfile()
  pick(png())
  expect(await screen.findByRole('status')).toHaveTextContent('Profile picture updated.')
  expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^u1\/avatar-\d+$/), expect.any(File), { upsert: true })
  expect(client.auth.updateUser).toHaveBeenCalledWith({ data: { avatar_url: 'https://cdn.test/avatar.png' } })
  expect(screen.getByAltText('Profile')).toHaveAttribute('src', 'https://cdn.test/avatar.png')
})
it('reports upload and avatar update errors', async () => {
  await renderProfile()
  bucket.upload.mockResolvedValueOnce({ error: { message: 'Upload denied' } })
  pick(png())
  expect(await screen.findByRole('status')).toHaveTextContent('Upload denied')
  client.auth.updateUser.mockResolvedValue({ error: { message: 'Avatar rejected' } })
  pick(png())
  expect(await screen.findByRole('status')).toHaveTextContent('Avatar rejected')
  expect(screen.queryByAltText('Profile')).not.toBeInTheDocument()
})
it('skips the upload when the session has ended', async () => {
  await renderProfile()
  client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
  pick(png())
  await waitFor(() => expect(client.auth.getUser).toHaveBeenCalledTimes(2))
  expect(bucket.upload).not.toHaveBeenCalled()
})

it('shows purchase and listing history', async () => {
  await renderProfile()
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect(screen.getByText('Calculus: Early Transcendentals')).toBeInTheDocument()
  expect(screen.getByText('Sold')).toBeInTheDocument()
})
it('shows an empty saved state that returns to listings', async () => {
  const props = await renderProfile()
  fireEvent.click(screen.getByRole('button', { name: /Saved listings/ }))
  expect(screen.getByText('No saved listings yet')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Browse listings/ }))
  fireEvent.click(screen.getByRole('button', { name: /Back to listings/ }))
  expect(props.onBack).toHaveBeenCalledTimes(2)
})
it('lists saved listings and removes one', async () => {
  const props = await renderProfile([saved])
  fireEvent.click(screen.getByRole('button', { name: /Saved listings/ }))
  expect(screen.getByText('1 item')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Desk lamp from saved listings' }))
  expect(props.onToggleSaved).toHaveBeenCalledWith(7)
  fireEvent.click(screen.getByRole('button', { name: 'Information' }))
  expect(screen.getByLabelText('Full name')).toBeInTheDocument()
})
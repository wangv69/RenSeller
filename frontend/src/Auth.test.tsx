import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Auth from './Auth'
import { session } from './test/client'

const { auth } = vi.hoisted(() => ({ auth: {
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(),
  signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(),
} }))
vi.mock('./lib/supabase', () => ({ supabase: { auth } }))
const unsubscribe = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } })
  for (const method of [auth.signInWithPassword, auth.signUp, auth.updateUser, auth.resetPasswordForEmail]) {
    method.mockResolvedValue({ data: {}, error: null })
  }
})
async function open(signup = false) {
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  if (signup) fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled())
}
function fill(signup = false, email = 'TEST@rpi.edu') {
  fireEvent.change(screen.getByLabelText('RPI email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password', { exact: true }), { target: { value: 'secret123' } })
  if (signup) {
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: ' Test Student ' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret123' } })
  }
}
function submit() { fireEvent.submit(screen.getByRole('dialog').querySelector('form')!) }

it('normalizes sign-in credentials and exposes the resulting session', async () => {
  auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null })
  await open(); fill(); submit()
  await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'test@rpi.edu', password: 'secret123' }))
  expect(await screen.findByRole('button', { name: /test/ })).toBeInTheDocument()
})
it('sends normalized signup metadata and asks for confirmation', async () => {
  await open(true); fill(true); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('Check your RPI email')
  expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'test@rpi.edu', options: expect.objectContaining({ data: { username: 'test', full_name: 'Test Student' } }) }))
})
it.each(['user@example.com', 'user@rpi.edu.evil', 'a..b@rpi.edu', `${'a'.repeat(65)}@rpi.edu`])('rejects invalid signup email %s', async (email) => {
  await open(true); fill(true, email); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('valid RPI email')
  expect(auth.signUp).not.toHaveBeenCalled()
})
it('rejects mismatched passwords', async () => {
  await open(true); fill(true)
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } }); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('Passwords do not match')
})
it.each([
  { data: {}, error: { code: 'email_exists', message: 'Duplicate' } },
  { data: { user: { identities: [] } }, error: null },
])('reports existing accounts', async (result) => {
  auth.signUp.mockResolvedValue(result)
  await open(true); fill(true); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('User already exists')
})
it('reports service errors', async () => {
  auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
  await open(); fill(); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('Invalid credentials')
})
it('reports network failures and enables retry', async () => {
  auth.signInWithPassword.mockRejectedValue(new Error('offline'))
  await open(); fill(); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('check your connection')
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Sign in/ })).toBeEnabled()
})
it('requests a recovery link with the correct redirect', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }))
  fireEvent.change(screen.getByLabelText('RPI email'), { target: { value: 'test@rpi.edu' } }); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('If an account exists')
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@rpi.edu', { redirectTo: `${window.location.origin}/?recovery=1` })
})
it('blocks expired recovery links', async () => {
  window.history.replaceState(null, '', '/?recovery=1')
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  expect(await screen.findByRole('status')).toHaveTextContent('invalid or expired')
  expect(screen.getByRole('button', { name: /Update password/ })).toBeDisabled()
})
it('updates a password for a valid recovery session', async () => {
  window.history.replaceState(null, '', '/?recovery=1')
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Update password/ })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newsecret' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'newsecret' } }); submit()
  expect(await screen.findByText('Password updated')).toBeInTheDocument()
  expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newsecret' })
})
it('signs out and unsubscribes on unmount', async () => {
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  const view = render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  view.unmount(); expect(unsubscribe).toHaveBeenCalledOnce()
})
it('handles a recovery event without exposing the session to the app', async () => {
  const onSessionChange = vi.fn()
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={onSessionChange} />)
  await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled())
  act(() => auth.onAuthStateChange.mock.calls[0][0]('PASSWORD_RECOVERY', session))
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Set a new password')
  expect(onSessionChange).toHaveBeenLastCalledWith(null)
})
it('reports password update failures', async () => {
  window.history.replaceState(null, '', '/?recovery=1')
  auth.getSession.mockResolvedValue({ data: { session }, error: null })
  auth.updateUser.mockResolvedValue({ error: { message: 'Password rejected' } })
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Update password/ })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newsecret' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'newsecret' } }); submit()
  expect(await screen.findByRole('status')).toHaveTextContent('Password rejected')
})

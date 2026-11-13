import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { resetSmokeClient } from './test/smokeClient'

vi.mock('./lib/supabase', async () => {
  const { smokeClient } = await import('./test/smokeClient')
  return { supabase: smokeClient }
})

beforeEach(() => resetSmokeClient())

it('connects listing details to real messaging, sends a draft, and signs out', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByText('Demo calculus book'))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: /Message seller/ }),
  )
  const conversation = await screen.findByRole('region', { name: 'Conversation with Demo Seller' })
  await user.click(within(conversation).getByRole('button', { name: 'Is this still available?' }))
  await user.click(within(conversation).getByRole('button', { name: 'Send message' }))
  expect(
    await within(screen.getByRole('log')).findByText('Is this still available?'),
  ).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Message about pickup' })).toHaveValue('')
  await user.click(screen.getByRole('button', { name: 'Close messages' }))
  await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Moderate listings' })).not.toBeInTheDocument()
})

it('connects marketplace favorites to profile saved listings and removes them', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('Demo calculus book')
  await user.click(screen.getAllByRole('button', { name: 'Save listing' })[0])
  await user.click(screen.getByRole('menuitem', { name: 'View profile' }))
  await user.click(await screen.findByRole('button', { name: /Saved listings/ }))
  expect(screen.getByRole('heading', { name: 'Demo desk lamp' })).toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: 'Remove Demo desk lamp from saved listings' }),
  )
  expect(screen.getByText('No saved listings yet')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Browse listings/ }))
  expect(await screen.findByRole('heading', { name: 'Freshly listed' })).toBeInTheDocument()
})

it('submits a pending listing and publishes it only after admin approval', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(await screen.findByRole('button', { name: /Sell an item/ }))
  await user.type(screen.getByLabelText('Item title'), 'Demo notebook')
  await user.type(screen.getByLabelText('Price'), '0')
  await user.click(screen.getByRole('button', { name: 'Post listing' }))
  await screen.findByText(/submitted for admin approval/)
  expect(screen.queryByRole('heading', { name: 'Demo notebook' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Moderate listings' }))
  await user.click(await screen.findByRole('button', { name: 'Review Demo notebook' }))
  await user.type(screen.getByLabelText('Moderation reason'), 'Reviewed demo listing')
  await user.click(screen.getByRole('button', { name: 'Approve' }))
  await user.click(screen.getByRole('button', { name: 'Confirm approve' }))
  await screen.findByText(/Listing updated/)
  await user.click(screen.getByRole('button', { name: 'Back to listings' }))
  expect(await screen.findByRole('heading', { name: 'Demo notebook' })).toBeInTheDocument()
})

it('keeps moderation unavailable to regular accounts throughout navigation', async () => {
  resetSmokeClient('user')
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('Demo calculus book')
  expect(screen.queryByRole('button', { name: 'Moderate listings' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('menuitem', { name: 'View profile' }))
  await waitFor(() => expect(screen.getByText('Account group: User')).toBeInTheDocument())
  expect(screen.queryByRole('button', { name: 'Moderate listings' })).not.toBeInTheDocument()
})

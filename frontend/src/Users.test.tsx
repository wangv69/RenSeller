import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Users from './Users'
import { query } from './test/client'
const { client } = vi.hoisted(() => ({ client: { rpc: vi.fn() } }))
vi.mock('./lib/supabase', () => ({ supabase: client }))
const rows = [
  { user_id: 'self', email: 'admin@rpi.edu', account_group: 'admin', eligible: true },
  { user_id: 'other', email: 'other@rpi.edu', account_group: 'user', eligible: true },
  { user_id: 'pending', email: 'pending@rpi.edu', account_group: 'user', eligible: false },
]
beforeEach(() => {
  vi.resetAllMocks()
  client.rpc.mockReturnValue(query({ data: rows, error: null }))
})
it('loads accounts, protects self and ineligible accounts, and searches by email', async () => {
  render(<Users userId="self" onBack={vi.fn()} />)
  await screen.findByText('other@rpi.edu')
  expect(screen.getByRole('button', { name: 'Admin role protected admin@rpi.edu' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Make admin pending@rpi.edu' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Search accounts by email'), {
    target: { value: 'other' },
  })
  fireEvent.submit(screen.getByRole('button', { name: 'Search accounts' }).closest('form')!)
  await waitFor(() =>
    expect(client.rpc).toHaveBeenCalledWith('list_account_groups', {
      query_text: 'other',
      page_offset: 0,
    }),
  )
})
it('requires a reason and confirmation before changing the selected account', async () => {
  render(<Users userId="self" onBack={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Make admin other@rpi.edu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }))
  expect(screen.getByRole('alert')).toHaveTextContent('1 to 500')
  fireEvent.change(screen.getByLabelText('Reason for role change'), {
    target: { value: ' Team moderator ' },
  })
  client.rpc.mockImplementation((name) =>
    query({ data: name === 'list_account_groups' ? rows : null, error: null }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }))
  expect(await screen.findByText(/Account role updated/)).toBeInTheDocument()
  expect(client.rpc).toHaveBeenCalledWith('set_account_group', {
    target_user_id: 'other',
    new_group: 'admin',
    expected_group: 'user',
    reason: 'Team moderator',
  })
})
it('shows directory failures and supports retry and empty results', async () => {
  client.rpc.mockReturnValue(
    query({ data: null, error: { message: 'Administrator access required' } }),
  )
  render(<Users userId="self" onBack={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Administrator access required')
  client.rpc.mockReturnValue(query({ data: [], error: null }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh accounts' }))
  expect(await screen.findByText('No accounts found.')).toBeInTheDocument()
})

it('paginates accounts and returns to the previous page', async () => {
  client.rpc.mockReturnValue(
    query({
      data: Array.from({ length: 51 }, (_, i) => ({
        ...rows[1],
        user_id: String(i),
        email: `student${i}@rpi.edu`,
      })),
      error: null,
    }),
  )
  render(<Users userId="self" onBack={vi.fn()} />)
  await screen.findByText('student0@rpi.edu')
  expect(screen.queryByText('student50@rpi.edu')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next accounts' }))
  await waitFor(() =>
    expect(client.rpc).toHaveBeenLastCalledWith('list_account_groups', {
      query_text: '',
      page_offset: 50,
    }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Previous accounts' }))
  await waitFor(() =>
    expect(client.rpc).toHaveBeenLastCalledWith('list_account_groups', {
      query_text: '',
      page_offset: 0,
    }),
  )
})

it('aborts directory requests on unmount and displays loading while waiting', () => {
  const request = query({ data: [], error: null })
  request.abortSignal.mockReturnValue(new Promise(() => {}))
  client.rpc.mockReturnValue(request)
  const view = render(<Users userId="self" onBack={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading accounts')
  view.unmount()
  expect(request.abortSignal.mock.calls[0][0].aborted).toBe(true)
})

it('protects every admin from demotion, including another admin', async () => {
  client.rpc.mockReturnValue(query({ data: [{ ...rows[1], account_group: 'admin' }], error: null }))
  render(<Users userId="self" onBack={vi.fn()} />)
  const action = await screen.findByRole('button', { name: 'Admin role protected other@rpi.edu' })
  expect(action).toBeDisabled()
  fireEvent.click(action)
  expect(screen.queryByLabelText('Reason for role change')).not.toBeInTheDocument()
  expect(client.rpc).not.toHaveBeenCalledWith('set_account_group', expect.anything())
})

it('reports thrown network failures for account loading', async () => {
  client.rpc.mockImplementation(() => {
    throw new Error('Network unavailable')
  })
  render(<Users userId="self" onBack={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
})
it('keeps failed decisions visible and permits cancelling', async () => {
  render(<Users userId="self" onBack={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Make admin other@rpi.edu' }))
  fireEvent.change(screen.getByLabelText('Reason for role change'), {
    target: { value: 'Team moderator' },
  })
  client.rpc.mockReturnValue(
    query({ data: null, error: { message: 'Account changed; refresh before retrying' } }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm role change' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Account changed')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel role change' }))
  expect(screen.queryByLabelText('Reason for role change')).not.toBeInTheDocument()
})

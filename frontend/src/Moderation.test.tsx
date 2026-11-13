import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import Moderation from './Moderation'
import { query } from './test/client'

const { client } = vi.hoisted(() => ({
  client: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}))
vi.mock('./lib/supabase', () => ({ supabase: client }))
const row = {
  id: 1,
  name: 'Review this book',
  price: 12,
  category: 'Textbooks',
  condition: 'New',
  seller_id: 'seller-1',
  image_path: null,
  moderation_status: 'pending',
}

beforeEach(() => {
  vi.resetAllMocks()
  client.from.mockReturnValue(query({ data: [row], error: null }))
  client.storage.from.mockReturnValue({
    getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.test/book.png' } }),
  })
})

it('loads pending listings with review details and switches status filters', async () => {
  const request = query({ data: [row], error: null })
  client.from.mockReturnValue(request)
  render(<Moderation onBack={vi.fn()} onModerated={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading')
  expect(await screen.findByRole('heading', { name: row.name })).toBeInTheDocument()
  expect(screen.getByText(/seller-1/)).toBeInTheDocument()
  expect(screen.getByText(/Textbooks/)).toBeInTheDocument()
  expect(screen.getByText(/\$12/)).toBeInTheDocument()
  expect(request.eq).toHaveBeenCalledWith('moderation_status', 'pending')
  fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: 'approved' } })
  await waitFor(() => expect(request.eq).toHaveBeenCalledWith('moderation_status', 'approved'))
})

it('shows an empty queue and supports returning to the marketplace', async () => {
  client.from.mockReturnValue(query({ data: [], error: null }))
  const onBack = vi.fn()
  render(<Moderation onBack={onBack} onModerated={vi.fn()} />)
  expect(await screen.findByText('No listings in this queue.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Back to listings' }))
  expect(onBack).toHaveBeenCalledOnce()
})

it.each([false, true])('reports failed loads and allows retry (%s)', async (network) => {
  client.from.mockImplementationOnce(() => {
    if (network) throw new Error('Network unavailable')
    return query({ data: null, error: { message: 'Access denied' } })
  })
  render(<Moderation onBack={vi.fn()} onModerated={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    network ? 'Network unavailable' : 'Access denied',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Refresh listings' }))
  expect(await screen.findByRole('heading', { name: row.name })).toBeInTheDocument()
})

it('ignores a listing response after unmount', async () => {
  let resolve!: (value: unknown) => void
  const response = new Promise((done) => {
    resolve = done
  })
  client.from.mockReturnValue({ ...query(null), then: response.then.bind(response) })
  const { unmount } = render(<Moderation onBack={vi.fn()} onModerated={vi.fn()} />)
  unmount()
  resolve({ data: [row], error: null })
  await response
  expect(screen.queryByText(row.name)).not.toBeInTheDocument()
})

async function review() {
  const onModerated = vi.fn()
  const view = render(<Moderation onBack={vi.fn()} onModerated={onModerated} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Review Review this book' }))
  return { ...view, onModerated }
}

it.each(['Approve', 'Reject', 'Remove'])(
  'confirms a reason before %s and refreshes after success',
  async (action) => {
    client.rpc.mockReturnValue(query({ data: null, error: null }))
    const { onModerated } = await review()
    fireEvent.change(screen.getByLabelText('Moderation reason'), {
      target: { value: '  Checked campus rules  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: action }))
    expect(
      screen.getByRole('button', { name: `Confirm ${action.toLowerCase()}` }),
    ).toBeInTheDocument()
    expect(client.rpc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: `Confirm ${action.toLowerCase()}` }))
    await waitFor(() => expect(onModerated).toHaveBeenCalledWith(1))
    expect(client.rpc).toHaveBeenCalledWith('moderate_listing', {
      listing_id: 1,
      decision: action.toLowerCase(),
      reason: 'Checked campus rules',
      expected_status: 'pending',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Listing updated')
  },
)

it.each(['', '   ', 'x'.repeat(501)])(
  'rejects an invalid moderation reason (%s)',
  async (reason) => {
    await review()
    fireEvent.change(screen.getByLabelText('Moderation reason'), { target: { value: reason } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(screen.getByRole('alert')).toHaveTextContent('1 to 500')
    expect(client.rpc).not.toHaveBeenCalled()
  },
)

it('cancels a decision without changing the listing', async () => {
  await review()
  fireEvent.change(screen.getByLabelText('Moderation reason'), {
    target: { value: 'Policy violation' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel decision' }))
  expect(screen.queryByRole('button', { name: 'Confirm remove' })).not.toBeInTheDocument()
  expect(client.rpc).not.toHaveBeenCalled()
})

it.each([false, true])('preserves the review and shows a failed decision (%s)', async (network) => {
  client.rpc.mockImplementation(() => {
    if (network) throw new Error('Connection lost')
    return query({ data: null, error: { message: 'Listing changed; refresh before reviewing' } })
  })
  const { onModerated } = await review()
  fireEvent.change(screen.getByLabelText('Moderation reason'), { target: { value: 'Reviewed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    network ? 'Connection lost' : 'Listing changed',
  )
  expect(screen.getByLabelText('Moderation reason')).toHaveValue('Reviewed')
  expect(onModerated).not.toHaveBeenCalled()
})

it('disables duplicate decisions and aborts the request on unmount', async () => {
  let resolve!: (value: unknown) => void
  const response = new Promise((done) => {
    resolve = done
  })
  const request = { ...query(null), then: response.then.bind(response) }
  client.rpc.mockReturnValue(request)
  const { onModerated, unmount } = await review()
  fireEvent.change(screen.getByLabelText('Moderation reason'), { target: { value: 'Reviewed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm approve' }))
  expect(screen.getByRole('button', { name: 'Saving decision...' })).toBeDisabled()
  expect(screen.getByLabelText('Listing status')).toBeDisabled()
  const signal = request.abortSignal.mock.calls[0][0]
  unmount()
  expect(signal.aborted).toBe(true)
  resolve({ data: null, error: null })
  await response
  expect(onModerated).not.toHaveBeenCalled()
})

it('shows photos and offers only removal for approved listings', async () => {
  client.from.mockReturnValue(
    query({
      data: [{ ...row, image_path: 'seller/book.png', moderation_status: 'approved' }],
      error: null,
    }),
  )
  await review()
  expect(screen.getByAltText(row.name)).toHaveAttribute('src', 'https://cdn.test/book.png')
  expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
})

it('keeps removed listings read-only', async () => {
  client.from.mockReturnValue(
    query({ data: [{ ...row, moderation_status: 'removed' }], error: null }),
  )
  render(<Moderation onBack={vi.fn()} onModerated={vi.fn()} />)
  await screen.findByRole('heading', { name: row.name })
  expect(screen.queryByRole('button', { name: /Review Review/ })).not.toBeInTheDocument()
})

it('clears the previous queue when loading another status fails', async () => {
  render(<Moderation onBack={vi.fn()} onModerated={vi.fn()} />)
  await screen.findByRole('heading', { name: row.name })
  client.from.mockReturnValue(query({ data: null, error: { message: 'Queue unavailable' } }))
  fireEvent.change(screen.getByLabelText('Listing status'), { target: { value: 'rejected' } })
  await screen.findByRole('alert')
  expect(screen.queryByRole('heading', { name: row.name })).not.toBeInTheDocument()
})

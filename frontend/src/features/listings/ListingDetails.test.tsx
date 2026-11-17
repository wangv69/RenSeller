import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ListingDetails from './ListingDetails'
import { query } from '../../test/client'

const { client } = vi.hoisted(() => ({
  client: { from: vi.fn(), storage: { from: vi.fn() } },
}))
vi.mock('../../lib/supabase', () => ({ supabase: client }))

const listing = {
  id: 7,
  sellerId: 'owner',
  title: 'My book',
  price: '$5',
  category: 'Textbooks',
  image: 'book.png',
  condition: 'New',
  seller: 'Student',
}
const onDeleted = vi.fn()
const remove = vi.fn()
let deletion: ReturnType<typeof query>
const deleteRows = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  deletion = query({ data: [{ id: 7, image_path: 'owner/book.png' }], error: null })
  deleteRows.mockImplementation(() => deletion)
  client.from.mockReturnValue({ delete: deleteRows })
  client.storage.from.mockReturnValue({ remove })
  remove.mockResolvedValue({ error: null })
})

function details(currentUserId: string | null = 'owner') {
  return render(
    <ListingDetails
      listing={listing}
      saved={false}
      canMessage={!!currentUserId}
      currentUserId={currentUserId}
      onDeleted={onDeleted}
      onClose={vi.fn()}
      onToggleFavorite={vi.fn()}
      onMessage={vi.fn()}
    />,
  )
}

function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete listing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
}

it('requires confirmation, supports cancellation, and deletes the owner row and photo', async () => {
  details()
  fireEvent.click(screen.getByRole('button', { name: 'Delete listing' }))
  expect(deleteRows).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Keep listing' }))
  expect(screen.queryByRole('button', { name: 'Yes, delete it' })).not.toBeInTheDocument()
  confirm()
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7, 'Listing deleted.'))
  expect(deletion.eq).toHaveBeenCalledWith('id', 7)
  expect(deletion.eq).toHaveBeenCalledWith('seller_id', 'owner')
  expect(remove).toHaveBeenCalledWith(['owner/book.png'])
})

it.each([null, 'someone-else'])('hides delete controls from non-owners (%s)', (identity) => {
  details(identity)
  expect(screen.queryByRole('button', { name: 'Delete listing' })).not.toBeInTheDocument()
  expect(deleteRows).not.toHaveBeenCalled()
})

it.each(['service', 'network', 'missing'])(
  'keeps the listing after a %s failure and allows retry',
  async (failure) => {
    deletion = query(
      failure === 'service'
        ? { data: null, error: { message: 'Permission denied' } }
        : { data: [], error: null },
    )
    if (failure === 'network') deletion.abortSignal.mockRejectedValueOnce(new Error('Offline'))
    details()
    confirm()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      failure === 'service'
        ? 'Permission denied'
        : failure === 'network'
          ? 'Unable to delete listing'
          : 'no longer available',
    )
    expect(onDeleted).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    deletion = query({ data: [{ id: 7, image_path: null }], error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7, 'Listing deleted.'))
  },
)

it('locks repeated deletion while pending and aborts on unmount', async () => {
  let finish!: (value: unknown) => void
  deletion.abortSignal.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const { unmount } = details()
  confirm()
  const pending = screen.getByRole('button', { name: 'Deleting…' })
  expect(pending).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Keep listing' })).toBeDisabled()
  fireEvent.click(pending)
  expect(deleteRows).toHaveBeenCalledTimes(1)
  const signal = deletion.abortSignal.mock.calls[0][0] as AbortSignal
  unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => finish({ data: [{ id: 7, image_path: 'owner/book.png' }], error: null }))
  expect(remove).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

it.each(['service', 'network'])(
  'reports successful deletion with a photo cleanup %s failure',
  async (failure) => {
    if (failure === 'service')
      remove.mockResolvedValue({ error: { message: 'Storage unavailable' } })
    else remove.mockRejectedValue(new Error('Storage unavailable'))
    details()
    confirm()
    await waitFor(() =>
      expect(onDeleted).toHaveBeenCalledWith(
        7,
        'Listing deleted, but its photo could not be removed.',
      ),
    )
  },
)

it.each([null, 'someone-else/book.png'])(
  'does not remove a missing or foreign photo (%s)',
  async (path) => {
    deletion = query({ data: [{ id: 7, image_path: path }], error: null })
    details()
    confirm()
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(7, 'Listing deleted.'))
    expect(remove).not.toHaveBeenCalled()
  },
)

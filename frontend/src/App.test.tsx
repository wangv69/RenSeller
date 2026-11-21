import { useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const { client, listingsQuery, membersQuery, favoritesQuery, walletQuery, purchaseQuery, transactionQuery, ratingQuery, bucket, favoriteDeleteChain } = vi.hoisted(() => {
  const listingsQuery = { insert: vi.fn(), select: vi.fn(), order: vi.fn(), single: vi.fn(), delete: vi.fn(), eq: vi.fn(), then: vi.fn() }
  const favoritesQuery = { select: vi.fn(), eq: vi.fn(), insert: vi.fn(), delete: vi.fn(), maybeSingle: vi.fn() }
  const membersQuery = { select: vi.fn(), in: vi.fn() }
  const bucket = { upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn() }
  const favoriteDeleteChain = { eq: vi.fn() }
  const walletQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  const purchaseQuery = { select: vi.fn(), eq: vi.fn() }
  const transactionQuery = { select: vi.fn(), eq: vi.fn(), then: vi.fn() }
  const ratingQuery = { select: vi.fn(), then: vi.fn() }
  favoriteDeleteChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const client = { auth: { getUser: vi.fn() }, from: vi.fn(), storage: { from: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn(), rpc: vi.fn() }
  return { client, listingsQuery, membersQuery, favoritesQuery, walletQuery, purchaseQuery, transactionQuery, ratingQuery, bucket, favoriteDeleteChain }
})
const changeHandlers: Record<string, (payload: unknown) => void> = {}
const changeChannel = { on: vi.fn(), subscribe: vi.fn() }
vi.mock('./lib/supabase', () => ({ supabase: client }))
vi.mock('./Auth', () => ({
  default: function TestAuth({ onProfileOpen, onSessionChange }: { onProfileOpen: () => void; onSessionChange: (session: unknown) => void }) {
    useEffect(() => onSessionChange({ access_token: 'test-token', user: { id: 'user-1', email: 'test@rpi.edu', user_metadata: { full_name: 'Test Student' } } }), [onSessionChange])
    return <button type="button" onClick={onProfileOpen}>Account</button>
  },
}))
vi.mock('./Messages', () => ({ default: () => null }))

beforeEach(() => {
  vi.resetAllMocks()
  client.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: {} } }, error: null })
  client.rpc.mockResolvedValue({ data: { transaction_id: 4, balance: 488, seller_id: 'user-2' }, error: null })
  listingsQuery.select.mockReturnValue(listingsQuery)
  listingsQuery.order.mockResolvedValue({
    data: [
      { id: 1, name: 'Calculus book', price: 12, category: ['Textbooks'], condition: 'New', seller_id: 'user-1', image_path: null, profiles: null },
      { id: 2, name: 'Desk lamp', price: 5, category: ['Furniture'], condition: 'Fair', seller_id: 'user-2', image_path: null, profiles: { display_name: 'Other student' } },
    ],
    error: null,
  })
  membersQuery.select.mockReturnValue(membersQuery)
  membersQuery.in.mockResolvedValue({ data: [], error: null })
  favoritesQuery.select.mockReturnValue(favoritesQuery)
  favoritesQuery.eq.mockImplementation((field: string) => Promise.resolve(field === 'listing_id'
    ? { data: [], error: null }
    : { data: [{ id: 9, title: 'Calculus book', seller_name: 'Alex Student', amount: 35, purchased_at: '2026-11-01T12:00:00Z', status: 'Completed' }], error: null }))
  favoritesQuery.maybeSingle.mockResolvedValue({ data: { balance: 500 }, error: null })
  favoritesQuery.insert.mockResolvedValue({ error: null })
  walletQuery.select.mockReturnValue(walletQuery)
  walletQuery.eq.mockReturnValue(walletQuery)
  walletQuery.maybeSingle.mockResolvedValue({ data: { balance: 500 }, error: null })
  purchaseQuery.select.mockReturnValue(purchaseQuery)
  purchaseQuery.eq.mockResolvedValue({ data: [], error: null })
  transactionQuery.select.mockReturnValue(transactionQuery)
  transactionQuery.eq.mockReturnValue(transactionQuery)
  transactionQuery.then.mockImplementation((resolve) => Promise.resolve({ data: [], error: null }).then(resolve))
  ratingQuery.select.mockReturnValue(ratingQuery)
  ratingQuery.then.mockImplementation((resolve) => Promise.resolve({ data: [], error: null }).then(resolve))
  favoriteDeleteChain.eq.mockReset()
  favoriteDeleteChain.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  favoritesQuery.delete.mockReturnValue(favoriteDeleteChain)
  listingsQuery.delete.mockReturnValue(listingsQuery)
  listingsQuery.eq.mockImplementation(() => listingsQuery)
  listingsQuery.then.mockImplementation((resolve) => Promise.resolve({ data: [{ id: 1 }], error: null }).then(resolve))
  listingsQuery.insert.mockReturnValue(listingsQuery)
  listingsQuery.single.mockResolvedValue({ data: { id: 3, name: 'New book', price: 15, category: ['Textbooks'], condition: 'Good condition', seller_id: 'user-1', image_path: null }, error: null })
  client.from.mockImplementation((table: string) => {
    if (table === 'listings') return listingsQuery
    if (table === 'messaging_members') return membersQuery
    if (table === 'fake_wallets') return walletQuery
    if (table === 'purchases') return purchaseQuery
    if (table === 'marketplace_transactions') return transactionQuery
    if (table === 'seller_ratings') return ratingQuery
    return favoritesQuery
  })
  client.storage.from.mockReturnValue(bucket)
  changeChannel.on.mockImplementation((_type: string, filter: { event: string }, callback: (payload: unknown) => void) => { changeHandlers[filter.event] = callback; return changeChannel })
  changeChannel.subscribe.mockReturnValue(changeChannel)
  client.channel.mockReturnValue(changeChannel)
  bucket.upload.mockResolvedValue({ error: null })
  bucket.remove.mockResolvedValue({ error: null })
  bucket.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:preview'), revokeObjectURL: vi.fn() }))
})

afterEach(() => vi.unstubAllGlobals())

it('filters listings by category and condition', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'New' } })
  expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument()
})

it('restores saved listings after loading', async () => {
  favoritesQuery.eq.mockResolvedValue({ data: [{ listing_id: 1 }], error: null })
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument())
})

it('shows the fake wallet balance on the home page', async () => {
  walletQuery.maybeSingle.mockResolvedValue({ data: { balance: 488 }, error: null })
  render(<App />)
  expect(await screen.findByText('$488')).toBeInTheDocument()
  expect(screen.queryByText(/fake money/i)).not.toBeInTheDocument()
})

it('searches listings and clears the search', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.change(screen.getByLabelText('Search listings'), { target: { value: 'lamp' } })
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.getByText('Calculus book')).toBeInTheDocument()
})

it('toggles favorites and shows listing details', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getAllByRole('button', { name: 'Save listing' })[0])
  expect(favoritesQuery.insert).toHaveBeenCalledWith({ user_id: 'user-1', listing_id: 1 })
  fireEvent.click(screen.getByText('Calculus book'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close listing details' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('validates and creates a listing', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('valid price')
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: 'New book' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByText('New book')).toBeInTheDocument()
  expect(listingsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'New book', price: 15 }))
})

it('shows a seller profile and returns to listings', async () => {
  render(<App />)
  const links = await screen.findAllByRole('button', { name: /Listed by Other student/ })
  fireEvent.click(links[links.length - 1])
  expect((await screen.findAllByRole('heading', { name: 'Other student' })).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '← Back to listings' }))
  expect(await screen.findByText('Calculus book')).toBeInTheDocument()
})

it('deletes an owned listing from the profile', async () => {
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(listingsQuery.delete).toHaveBeenCalled())
})

it('toggles category filters and requires at least one selling category', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: 'Textbooks' }))
  expect(screen.getByText('Calculus book')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'All listings' }))
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: 'New book' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '15' } })
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: /Textbooks/ }))
  fireEvent.click(dialog.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('at least one category')
})

it('uploads a listing image and creates the listing', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: 'Lamp bundle' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Listing image'), { target: { files: [new File(['x'], 'lamp.png', { type: 'image/png' })] } })
  listingsQuery.single.mockResolvedValue({ data: { id: 4, name: 'Lamp bundle', price: 20, category: ['Textbooks'], condition: 'Good condition', seller_id: 'user-1', image_path: 'user-1/lamp.png' }, error: null })
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByText('Lamp bundle')).toBeInTheDocument()
  expect(bucket.upload).toHaveBeenCalled()
})

it('shows listing insert and upload failures', async () => {
  bucket.upload.mockResolvedValue({ error: { message: 'Upload failed' } })
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: 'Lamp' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '10' } })
  fireEvent.change(screen.getByLabelText('Listing image'), { target: { files: [new File(['x'], 'lamp.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed')
})

it('allows cancellation before deleting an owned listing', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByText('Calculus book'))
  fireEvent.click(screen.getByRole('button', { name: 'Delete listing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Keep listing' }))
  expect(screen.queryByRole('button', { name: 'Yes, delete it' })).not.toBeInTheDocument()
})

it('loads purchase history into the profile', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect((await screen.findAllByText('Calculus book')).length).toBeGreaterThan(0)
})

it('rejects invalid images and oversized listing images', async () => {
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  const image = screen.getByLabelText('Photo')
  fireEvent.change(image, { target: { files: [new File(['x'], 'note.txt', { type: 'text/plain' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('JPEG, PNG, or WebP')
  const big = new File(['x'], 'big.png', { type: 'image/png' })
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 })
  fireEvent.change(image, { target: { files: [big] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('under 5 MB')
})

it('removes a saved favorite and reports favorite failures', async () => {
  favoritesQuery.eq.mockResolvedValue({ data: [{ listing_id: 1 }], error: null })
  render(<App />)
  await screen.findByRole('button', { name: 'Remove from favorites' })
  fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }))
  favoritesQuery.insert.mockResolvedValue({ error: { message: 'Save failed' } })
  const saveButtons = screen.getAllByRole('button', { name: 'Save listing' })
  fireEvent.click(saveButtons[saveButtons.length - 1])
  expect(await screen.findByText('Save failed')).toBeInTheDocument()
})

it('reports listing insert failures and preserves the form', async () => {
  listingsQuery.single.mockResolvedValue({ data: null, error: { message: 'Insert failed' } })
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByRole('button', { name: /Sell an item/ }))
  fireEvent.change(screen.getByLabelText('Item title'), { target: { value: 'New lamp' } })
  fireEvent.change(screen.getByLabelText('Price'), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Post listing' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Insert failed')
  expect(screen.getByLabelText('Item title')).toHaveValue('New lamp')
})

it('confirms deletion from the listing modal', async () => {
  listingsQuery.then.mockImplementation((resolve) => Promise.resolve({ data: [], error: null }).then(resolve))
  render(<App />)
  await screen.findByText('Calculus book')
  fireEvent.click(screen.getByText('Calculus book'))
  fireEvent.click(screen.getByRole('button', { name: 'Delete listing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, delete it' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('opens transaction confirmation and confirms buying an item', async () => {
  await start()
  fireEvent.click(screen.getByText('Desk lamp'))
  fireEvent.click(screen.getByRole('button', { name: 'Buy item' }))
  expect(await screen.findByRole('heading', { name: 'Confirm purchase' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm purchase' }))
  await waitFor(() => expect(client.rpc).toHaveBeenCalledWith('start_purchase', { p_listing_id: 2 }))
  expect(await screen.findByText(/Purchase started/)).toBeInTheDocument()
})

async function start() { render(<App />); await screen.findByText('Calculus book') }
it('shows a listing posted by someone else without a page refresh', async () => {
  await start()
  listingsQuery.order.mockResolvedValue({ data: [
    { id: 3, name: 'Fresh lamp', price: 8, category: ['Furniture'], condition: 'New', seller_id: 'user-2', image_path: null, profiles: null },
    { id: 1, name: 'Calculus book', price: 12, category: ['Textbooks'], condition: 'New', seller_id: 'user-1', image_path: null, profiles: null },
  ], error: null })
  expect(screen.queryByText('Fresh lamp')).not.toBeInTheDocument()
  act(() => { changeHandlers.INSERT({ new: { id: 3 } }) })
  expect(await screen.findByText('Fresh lamp')).toBeInTheDocument()
})
it('removes a listing deleted by someone else and closes its open details', async () => {
  await start()
  fireEvent.keyDown(screen.getByText('Calculus book').closest('article')!, { key: 'Enter' })
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Calculus book')
  act(() => { changeHandlers.DELETE({ old: { id: 1 } }) })
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
})
it('keeps open details when a different listing is deleted', async () => {
  await start()
  fireEvent.keyDown(screen.getByText('Calculus book').closest('article')!, { key: 'Enter' })
  act(() => { changeHandlers.DELETE({ old: { id: 2 } }) })
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Calculus book')
})
it('stops listening for listing changes when unmounted', async () => {
  const { unmount } = render(<App />)
  await screen.findByText('Calculus book')
  unmount()
  expect(client.removeChannel).toHaveBeenCalledWith(changeChannel)
})

const smartFilters = (overrides = {}) => ({ keywords: 'lamp', categories: ['Furniture'], condition: 'Fair', max_price: 10, ...overrides })
function stubSmartSearch(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
async function smartSearch(text = 'cheap lamp for my dorm') {
  fireEvent.change(screen.getByLabelText('Search listings'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Smart search' }))
}
it('applies smart search filters to the listings', async () => {
  const fetchMock = stubSmartSearch(smartFilters())
  await start()
  await smartSearch()
  expect(await screen.findByText('Under $10')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/search/interpret', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-token' }) }))
  expect(screen.getByLabelText('Search listings')).toHaveValue('lamp')
  expect(screen.getByRole('button', { name: 'Furniture' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
})
it('hides listings above the smart price limit and keeps ones at it', async () => {
  stubSmartSearch(smartFilters({ keywords: '', categories: [], condition: null, max_price: 5 }))
  await start()
  await smartSearch()
  await screen.findByText('Under $5')
  expect(screen.getByText('Desk lamp')).toBeInTheDocument()
  expect(screen.queryByText('Calculus book')).not.toBeInTheDocument()
})
it('shows the empty state when nothing is under the price limit', async () => {
  stubSmartSearch(smartFilters({ keywords: '', categories: [], condition: null, max_price: 1 }))
  await start()
  await smartSearch()
  expect(await screen.findByText('No listings found')).toBeInTheDocument()
})
it('clears the smart price limit and resets earlier filters on a new smart search', async () => {
  stubSmartSearch(smartFilters({ keywords: '', categories: [], condition: null, max_price: 1 }))
  await start()
  await smartSearch()
  fireEvent.click(await screen.findByRole('button', { name: 'Clear price limit' }))
  expect(screen.queryByText('Under $1')).not.toBeInTheDocument()
  expect(screen.getByText('Calculus book')).toBeInTheDocument()
  stubSmartSearch(smartFilters({ categories: ['Textbooks'], condition: null, max_price: null, keywords: '' }))
  await smartSearch('textbooks')
  await waitFor(() => expect(screen.queryByText('Desk lamp')).not.toBeInTheDocument())
  expect(screen.queryByText(/^Under/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Furniture' })).toHaveAttribute('aria-pressed', 'false')
})
it('keeps the current filters when smart search fails', async () => {
  stubSmartSearch({}, 503)
  await start()
  await smartSearch()
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
  expect(screen.getByLabelText('Search listings')).toHaveValue('cheap lamp for my dorm')
  expect(screen.getByRole('button', { name: 'Furniture' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByText(/^Under/)).not.toBeInTheDocument()
})
it('shows a Buy item button on another student\'s listing details', async () => {
  await start()
  fireEvent.keyDown(screen.getByText('Desk lamp').closest('article')!, { key: 'Enter' })
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByRole('button', { name: /Buy item/ })).toBeEnabled()
  expect(dialog.getByRole('button', { name: /Message seller/ })).toBeInTheDocument()
})
it('does not offer Buy item on your own listing', async () => {
  await start()
  fireEvent.keyDown(screen.getByText('Calculus book').closest('article')!, { key: 'Enter' })
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.queryByRole('button', { name: /Buy item/ })).not.toBeInTheDocument()
  expect(dialog.getByRole('button', { name: 'Delete listing' })).toBeInTheDocument()
})

it('does not allow deleting an owned reserved listing', async () => {
  const reservedListing = {
    id: 1,
    name: 'Calculus book',
    price: 12,
    category: ['Textbooks'],
    condition: 'New',
    seller_id: 'user-1',
    image_path: null,
    status: 'reserved',
    profiles: null,
  }
  listingsQuery.order.mockResolvedValue({ data: [reservedListing], error: null })
  vi.stubGlobal('confirm', vi.fn())
  render(<App />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  expect(screen.getByText('Reserved')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
})

it('confirms receipt and opens the rating interface', async () => {
  transactionQuery.then.mockImplementation((resolve) => Promise.resolve({
    data: [{ id: 7, listing_id: 2, seller_id: 'user-2', amount: 12, status: 'pending_receipt' }],
    error: null,
  }).then(resolve))
  client.rpc.mockResolvedValue({ data: { status: 'completed', seller_id: 'user-2' }, error: null })
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm received' }))
  expect(await screen.findByRole('heading', { name: /Rate Other student/ })).toBeInTheDocument()
  const ratingButtons = screen.getAllByRole('button', { name: 'Rate seller 5 stars' })
  fireEvent.click(ratingButtons[ratingButtons.length - 1])
  expect(client.rpc).toHaveBeenCalledWith('confirm_receipt', { p_transaction_id: 7 })
  expect(client.rpc).toHaveBeenCalledWith('rate_seller', { p_transaction_id: 7, p_seller_id: 'user-2', p_rating: 5 })
})

it('cancels a pending purchase and refunds the wallet', async () => {
  transactionQuery.then.mockImplementation((resolve) => Promise.resolve({
    data: [{ id: 8, listing_id: 2, seller_id: 'user-2', amount: 12, status: 'pending_receipt' }],
    error: null,
  }).then(resolve))
  client.rpc.mockResolvedValue({ data: { status: 'cancelled', refund: 12 }, error: null })
  await start()
  fireEvent.click(screen.getByRole('button', { name: 'Account' }))
  await screen.findByRole('heading', { name: 'Profile' })
  fireEvent.click(screen.getByRole('button', { name: 'Purchase & listing history' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel purchase' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Purchase canceled')
  expect(client.rpc).toHaveBeenCalledWith('cancel_purchase', { p_transaction_id: 8 })
})

function sellerLine(title: string) {
  return within(screen.getByText(title).closest('article')!).getByText(/Listed by/)
}
it('prefers the seller\'s profile display name over the directory name', async () => {
  membersQuery.in.mockResolvedValue({ data: [{ id: 'user-2', full_name: 'Priya Shah' }], error: null })
  await start()
  expect(sellerLine('Desk lamp')).toHaveTextContent('Listed by Other student')
  expect(within(screen.getByText('Desk lamp').closest('article')!).getByText('O')).toBeInTheDocument()
  expect(screen.queryByText(/Priya Shah/)).not.toBeInTheDocument()
})
it('uses the student directory name when the seller has no display name', async () => {
  listingsQuery.order.mockResolvedValue({ data: [
    { id: 2, name: 'Desk lamp', price: 5, category: ['Furniture'], condition: 'Fair', seller_id: 'user-2', image_path: null, profiles: { display_name: '   ' } },
  ], error: null })
  membersQuery.in.mockResolvedValue({ data: [{ id: 'user-2', full_name: 'Priya Shah' }], error: null })
  render(<App />)
  await screen.findByText('Desk lamp')
  expect(membersQuery.select).toHaveBeenCalledWith('id, full_name')
  expect(sellerLine('Desk lamp')).toHaveTextContent('Listed by Priya Shah')
})
it('asks the directory once for each distinct seller', async () => {
  listingsQuery.order.mockResolvedValue({ data: [
    { id: 1, name: 'Calculus book', price: 12, category: ['Textbooks'], condition: 'New', seller_id: 'user-1', image_path: null, profiles: null },
    { id: 2, name: 'Desk lamp', price: 5, category: ['Furniture'], condition: 'Fair', seller_id: 'user-2', image_path: null, profiles: null },
    { id: 3, name: 'Mini fridge', price: 40, category: ['Furniture'], condition: 'Good condition', seller_id: 'user-2', image_path: null, profiles: null },
  ], error: null })
  await start()
  expect(membersQuery.in).toHaveBeenCalledTimes(1)
  expect(membersQuery.in).toHaveBeenCalledWith('id', ['user-1', 'user-2'])
})
it("falls back to the listing's profile name, then to RPI student, when the directory has no entry", async () => {
  listingsQuery.order.mockResolvedValue({ data: [
    { id: 2, name: 'Desk lamp', price: 5, category: ['Furniture'], condition: 'Fair', seller_id: 'user-2', image_path: null, profiles: { display_name: 'Other student' } },
    { id: 3, name: 'Mini fridge', price: 40, category: ['Furniture'], condition: 'Good condition', seller_id: 'user-3', image_path: null, profiles: null },
  ], error: null })
  render(<App />)
  await screen.findByText('Desk lamp')
  expect(sellerLine('Desk lamp')).toHaveTextContent('Listed by Other student')
  expect(sellerLine('Mini fridge')).toHaveTextContent('Listed by RPI student')
})
it('still shows the listings with fallback names when the directory lookup fails', async () => {
  membersQuery.in.mockResolvedValue({ data: null, error: { message: 'Directory offline' } })
  await start()
  expect(sellerLine('Desk lamp')).toHaveTextContent('Listed by Other student')
  expect(screen.queryByText('Directory offline')).not.toBeInTheDocument()
})
it("shows the seller's display name in the listing details", async () => {
  await start()
  fireEvent.keyDown(screen.getByText('Desk lamp').closest('article')!, { key: 'Enter' })
  expect(within(screen.getByRole('dialog')).getByText(/Listed by Other student/)).toBeInTheDocument()
})

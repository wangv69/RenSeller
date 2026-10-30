 import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import Messages from './Messages'
import { supabase } from './lib/supabase'
import './App.css'
import Auth from './Auth'
import Profile from './Profile'

type Listing = {
  id: number
  sellerId: string
  title: string
  price: string
  category: string
  image: string
  condition: string
  seller: string
}

const categories = ['All listings', 'Textbooks', 'Electronics', 'Furniture', 'Clothing', 'Tickets']

type ListingRow = {
  id: number
  seller_id: string
  name: string
  price: number
  category: string
  condition: string
  image_path: string | null
  profiles: { display_name: string } | null
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/900x700?text=No+photo'

function toListing(row: ListingRow): Listing {
  const imageUrl = row.image_path && supabase
    ? supabase.storage.from('listing-images').getPublicUrl(row.image_path).data.publicUrl
    : PLACEHOLDER_IMAGE
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.name,
    price: `$${Number(row.price).toFixed(2).replace(/\.00$/, '')}`,
    category: row.category,
    condition: row.condition ?? 'Good condition',
    image: imageUrl,
    seller: row.profiles?.display_name ?? 'RPI student',
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [showMessages, setShowMessages] = useState(false)
  const [messageRecipientId, setMessageRecipientId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('All listings')
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<number[]>([])
  const [showSellForm, setShowSellForm] = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const handleSessionChange = useCallback((nextSession: Session | null) => {
    setSession(nextSession)
    if (!nextSession) setShowMessages(false)
  }, [])
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<'home' | 'profile'>(
    window.location.hash === '#profile' ? 'profile' : 'home',
  )

  const [newTitle, setNewTitle] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newCategory, setNewCategory] = useState('Textbooks')
  const [newCondition, setNewCondition] = useState('Good condition')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [newImage, setNewImage] = useState<File | null>(null)

  const imagePreview = useMemo(() => (newImage ? URL.createObjectURL(newImage) : null), [newImage])

  useEffect(() => {
  if (!imagePreview) return
    return () => URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setFormError('Image must be under 5 MB.')
      return
    }
    setFormError(null)
    setNewImage(file)
  }

  useEffect(() => {
    async function loadListings() {
      if (!supabase) {
        setError('Listings are unavailable. Supabase is not configured.')
        setLoading(false)
        return
      }
      const { data, error } = await supabase
        .from('listings')
        .select('id, name, price, category, condition, image_path, seller_id')
        .order('id', { ascending: false })

      if (error) setError(error.message)
      else setListings((data as unknown as ListingRow[]).map(toListing))
      setLoading(false)
    }
    loadListings()
  }, [])

  useEffect(() => {
    function handleHashChange() {
      const hash = window.location.hash
      setCurrentPage(hash === '#profile' ? 'profile' : 'home')
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  function openProfile() {
    window.location.hash = 'profile'
  }

  function returnHome() {
    window.location.hash = 'top'
  }

  const visibleListings = listings.filter((listing) => {
    const matchesCategory = activeCategory === 'All listings' || listing.category === activeCategory
    const searchText = `${listing.title} ${listing.category}`.toLowerCase()
    return matchesCategory && searchText.includes(search.toLowerCase())
  })

  function toggleFavorite(id: number) {
    setFavorites((current) => current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id])
  }

  async function handleCreateListing() {
    setFormError(null)
    if (!supabase) {
      setFormError('Supabase is not configured.')
      return
    }

    const price = Number(newPrice.replace('$', ''))
    if (!newTitle.trim() || !newPrice.replace('$', '').trim() || !Number.isFinite(price) || price < 0) {
      setFormError('Enter a title and a valid price.')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setFormError('You need to sign in to post a listing.')
      return
    }

    setSaving(true)
    let imagePath: string | null = null
    if (newImage) {
      const ext = newImage.name.split('.').pop()?.toLowerCase() || 'jpg'
      imagePath = `${userData.user.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('listing-images')
        .upload(imagePath, newImage, { contentType: newImage.type, upsert: false })
      if (uploadError) {
        setSaving(false)
        setFormError(uploadError.message)
        return
      }
    }

    const { data, error } = await supabase
      .from('listings')
      .insert({
        name: newTitle.trim(),
        price,
        category: newCategory,
        condition: newCondition,
        seller_id: userData.user.id,
        image_path: imagePath,
      })
      .select('id, name, price, category, condition, image_path')
      .single()
    setSaving(false)

    if (error) {
      setFormError(error.message)
      if (imagePath) {
        await supabase.storage.from('listing-images').remove([imagePath]).catch(() => {})
      }
      return
    }

    setListings((current) => [toListing({ ...data, profiles: null } as ListingRow), ...current])
    setNewTitle('')
    setNewPrice('')
    setNewImage(null)
    setShowSellForm(false)
  }

  function closeListingDetails() {
    setSelectedListing(null)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-top page-width">
          <a className="wordmark" href="#top" aria-label="RenSeller home"><span>REN</span>SELLER</a>
          <p className="campus-note">THE RPI STUDENT MARKETPLACE</p>
          <nav className="account-nav" aria-label="Account navigation">
            {session && (
              <button className="text-button messages-nav-button" type="button" onClick={() => setShowMessages(true)}>
                Messages
              </button>
            )}
            <Auth onSessionChange={handleSessionChange} onProfileOpen={openProfile} />
            {session && (
              <button className="sell-button" type="button" onClick={() => setShowSellForm(true)}>
                Sell an item <span>+</span>
              </button>
            )}
          </nav>
        </div>
        <div className="search-row page-width">
          <label className="search-box"><span className="search-icon" aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for anything" aria-label="Search listings" />{search && <button type="button" className="clear-search" onClick={() => setSearch('')} aria-label="Clear search">×</button>}</label>
          <button className="search-button" type="button" aria-label="Submit search">Search</button>
        </div>
      </header>

      <main id="top">
        {currentPage === 'profile' ? (
          <Profile
            onBack={returnHome}
            savedListings={listings.filter((listing) => favorites.includes(listing.id))}
            onToggleSaved={toggleFavorite}
          />
        ) : (
          <>
            <section className="welcome-band">
              <div className="page-width welcome-content">
                <div>
                  <p className="eyebrow">BUILT FOR CAMPUS LIFE</p>
                  <h1>Find your next <em>good thing.</em></h1>
                  <p className="welcome-copy">Buy, sell, and trade with people around you. No shipping, no strangers, no hassle.</p>
                  <div className="trust-row">
                    <span>✓ Student-first</span>
                    <span>✓ Local pickup</span>
                    <span>✓ No listing fees</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="category-section page-width" aria-label="Browse campus categories">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">BROWSE RPI CAMPUS</p>
                  <h2>What are you looking for?</h2>
                </div>
                <button className="view-all" type="button">View all listings <span></span></button>
              </div>
              <div className="category-scroller">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={activeCategory === category ? 'category-chip active' : 'category-chip'}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </section>

            <section className="listings-section page-width">
              <div className="listing-heading">
                <div>
                  <h2>Freshly listed</h2>
                  <p>{visibleListings.length} items listed by RPI students</p>
                </div>
                <button className="filter-button" type="button">Filter <span></span></button>
              </div>

              {loading ? (
                <p>Loading…</p>
              ) : error ? (
                <p>{error}</p>
              ) : visibleListings.length > 0 ? (
                <div className="listing-grid">
                  {visibleListings.map((listing) => (
                    <article
                      className="listing-card"
                      key={listing.id}
                      onClick={() => setSelectedListing(listing)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedListing(listing)
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="listing-image-wrap">
                        <img src={listing.image} alt={listing.title} />
                        <button
                          className={favorites.includes(listing.id) ? 'favorite-button saved' : 'favorite-button'}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleFavorite(listing.id)
                          }}
                          type="button"
                          aria-label={favorites.includes(listing.id) ? 'Remove from favorites' : 'Save listing'}
                        >
                          {favorites.includes(listing.id) ? '♥' : '♡'}
                        </button>
                        <span className="condition-tag">{listing.condition}</span>
                      </div>
                      <div className="listing-details">
                        <div className="price-line">
                          <h3>{listing.title}</h3>
                          <strong>{listing.price}</strong>
                        </div>
                        <p className="listing-meta">RPI campus <span>·</span> {listing.category}</p>
                        <p className="seller-line">
                          <span className="avatar">{listing.seller[0]}</span> Listed by {listing.seller}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No listings found</strong>
                  <span>Try another search or category.</span>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {session && <Messages key={session.user.id} isOpen={showMessages} userId={session.user.id} initialMemberId={messageRecipientId} onClose={() => { setShowMessages(false); setMessageRecipientId(null) }} />}

      <footer className="site-footer"><div className="page-width"><span className="wordmark small"><span>REN</span>SELLER</span><span>MADE FOR STUDENTS, BY STUDENTS.</span><span>© 2026 RENSELLER</span></div></footer>

      {selectedListing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeListingDetails() }}><div className="listing-modal" role="dialog" aria-modal="true" aria-labelledby="listing-title"><button className="modal-close" onClick={closeListingDetails} type="button" aria-label="Close listing details">×</button><div className="listing-modal-image"><img src={selectedListing.image} alt={selectedListing.title} /><span className="condition-tag">{selectedListing.condition}</span></div><div className="listing-modal-content"><div className="listing-modal-heading"><div><p className="eyebrow">{selectedListing.category}</p><h2 id="listing-title">{selectedListing.title}</h2></div><strong>{selectedListing.price}</strong></div><p className="listing-modal-meta">RPI campus <span>·</span> Listed by {selectedListing.seller}</p><p className="modal-copy">A campus pickup listing in {selectedListing.condition.toLowerCase()}. Message the seller to ask a question or arrange a convenient meeting time.</p><div className="listing-modal-actions"><button className="favorite-detail-button" type="button" onClick={() => toggleFavorite(selectedListing.id)}>{favorites.includes(selectedListing.id) ? '♥ Saved' : '♡ Save listing'}</button><button className="sell-button" type="button" onClick={() => { if (!session) return; setSelectedListing(null); setMessageRecipientId(selectedListing.sellerId); setShowMessages(true) }} disabled={!session} title={session ? 'Open your conversation with this seller' : 'Sign in to contact this seller'}>Message seller <span>→</span></button></div></div></div></div>}

      {showSellForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSellForm(false) }}>
          <div className="sell-modal" role="dialog" aria-modal="true" aria-labelledby="sell-title">
            <button className="modal-close" onClick={() => setShowSellForm(false)} type="button" aria-label="Close">×</button>
            <p className="eyebrow">LIST SOMETHING NEW</p>
            <h2 id="sell-title">What are you selling?</h2>
            <p className="modal-copy">Add the basics now. You can fill in more details before posting.</p>
            <label>Photo
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </label>
            {imagePreview && (
              <img src={imagePreview} alt="Preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />
            )}
            <label>Item title
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Mini fridge, desk lamp..." />
            </label>
            <label>Price
              <input value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="$ 0.00" inputMode="decimal" />
            </label>
            <label>Category
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                {categories.filter((c) => c !== 'All listings').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Condition
              <select value={newCondition} onChange={(e) => setNewCondition(e.target.value)}>
                <option>New</option>
                <option>Like new</option>
                <option>Good condition</option>
                <option>Fair</option>
              </select>
            </label>
            {formError && <p role="alert">{formError}</p>}
            <div className="modal-actions">
              <button className="cancel-button" type="button" onClick={() => setShowSellForm(false)}>Cancel</button>
              <button className="sell-button" type="button" onClick={handleCreateListing} disabled={saving}>
                {saving ? 'Posting…' : 'Post listing'} <span></span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import Messages from './Messages'
import './App.css'
import Auth from './Auth'
import Profile from './Profile'
import Moderation from './Moderation'
import Users from './Users'
import { type Listing } from './features/listings/listing'
import SellListingForm from './features/listings/SellListingForm'
import Marketplace from './features/listings/Marketplace'
import ListingDetails from './features/listings/ListingDetails'
import { useListings } from './features/listings/useListings'

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [showMessages, setShowMessages] = useState(false)
  const [messageRecipientId, setMessageRecipientId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [favorites, setFavorites] = useState<number[]>([])
  const [showSellForm, setShowSellForm] = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [showModeration, setShowModeration] = useState(false)
  const [showUsers, setShowUsers] = useState(false)
  const [listingNotice, setListingNotice] = useState('')
  const { listings, setListings, loading, error, reload } = useListings()
  const handleSessionChange = useCallback((nextSession: Session | null) => {
    setSession(nextSession)
    if (!nextSession) {
      setShowMessages(false)
      setShowSellForm(false)
      setMessageRecipientId(null)
    }
    if (nextSession?.user.app_metadata?.group !== 'admin') {
      setShowModeration(false)
      setShowUsers(false)
    }
  }, [])
  const [currentPage, setCurrentPage] = useState<'home' | 'profile'>(
    window.location.hash === '#profile' ? 'profile' : 'home',
  )

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

  function toggleFavorite(id: number) {
    setFavorites((current) =>
      current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id],
    )
  }

  function closeListingDetails() {
    setSelectedListing(null)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-top page-width">
          <a className="wordmark" href="#top" aria-label="RenSeller home">
            <span>REN</span>SELLER
          </a>
          <p className="campus-note">THE RPI STUDENT MARKETPLACE</p>
          <nav className="account-nav" aria-label="Account navigation">
            {session?.user.app_metadata?.group === 'admin' && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setShowUsers(true)
                  setShowModeration(false)
                  setSelectedListing(null)
                }}
              >
                Manage users
              </button>
            )}
            {session?.user.app_metadata?.group === 'admin' && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSelectedListing(null)
                  setShowModeration(true)
                  setShowUsers(false)
                }}
              >
                Moderate listings
              </button>
            )}
            {session && (
              <button
                className="text-button messages-nav-button"
                type="button"
                onClick={() => setShowMessages(true)}
              >
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
          <label className="search-box">
            <span className="search-icon" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search for anything"
              aria-label="Search listings"
            />
            {search && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>
          <button className="search-button" type="button" aria-label="Submit search">
            Search
          </button>
        </div>
      </header>

      <main id="top">
        {listingNotice && (
          <p className="page-width" role="status">
            {listingNotice}
          </p>
        )}
        {showUsers && session?.user.app_metadata?.group === 'admin' ? (
          <Users
            key={session.user.id}
            userId={session.user.id}
            onBack={() => setShowUsers(false)}
          />
        ) : showModeration && session?.user.app_metadata?.group === 'admin' ? (
          <Moderation
            key={session.user.id}
            onBack={() => setShowModeration(false)}
            onModerated={(id) => {
              setListings((current) => current.filter((listing) => listing.id !== id))
              setFavorites((current) => current.filter((favorite) => favorite !== id))
              setSelectedListing(null)
              reload()
            }}
          />
        ) : currentPage === 'profile' ? (
          <Profile
            onBack={returnHome}
            savedListings={listings.filter((listing) => favorites.includes(listing.id))}
            onToggleSaved={toggleFavorite}
          />
        ) : (
          <Marketplace
            listings={listings}
            loading={loading}
            error={error}
            search={search}
            favorites={favorites}
            onSearchChange={setSearch}
            onOpenListing={setSelectedListing}
            onToggleFavorite={toggleFavorite}
            onRetry={reload}
          />
        )}
      </main>

      {session && (
        <Messages
          key={session.user.id}
          isOpen={showMessages}
          userId={session.user.id}
          initialMemberId={messageRecipientId}
          onClose={() => {
            setShowMessages(false)
            setMessageRecipientId(null)
          }}
        />
      )}

      <footer className="site-footer">
        <div className="page-width">
          <span className="wordmark small">
            <span>REN</span>SELLER
          </span>
          <span>MADE FOR STUDENTS, BY STUDENTS.</span>
          <span>© 2026 RENSELLER</span>
        </div>
      </footer>

      {selectedListing && (
        <ListingDetails
          listing={selectedListing}
          saved={favorites.includes(selectedListing.id)}
          canMessage={!!session}
          onClose={closeListingDetails}
          onToggleFavorite={toggleFavorite}
          onMessage={(sellerId) => {
            if (!session) return
            setSelectedListing(null)
            setMessageRecipientId(sellerId)
            setShowMessages(true)
          }}
        />
      )}

      {session && (
        <SellListingForm
          key={`sell:${session.user.id}`}
          isOpen={showSellForm}
          onClose={() => setShowSellForm(false)}
          onCreated={() =>
            setListingNotice(
              'Your listing was submitted for admin approval. It will appear after approval.',
            )
          }
        />
      )}
    </div>
  )
}

export default App

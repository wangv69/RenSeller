import { useState } from 'react'
import { categories, type Listing } from './listing'
import ListingCard from './ListingCard'

type MarketplaceProps = {
  listings: Listing[]
  loading: boolean
  error: string | null
  search: string
  favorites: number[]
  onSearchChange: (value: string) => void
  onOpenListing: (listing: Listing) => void
  onToggleFavorite: (id: number) => void
  onRetry: () => void
}

export default function Marketplace({
  listings,
  loading,
  error,
  search,
  favorites,
  onSearchChange,
  onOpenListing,
  onToggleFavorite,
  onRetry,
}: MarketplaceProps) {
  const [activeCategory, setActiveCategory] = useState('All listings')
  const [showFilters, setShowFilters] = useState(false)
  const [condition, setCondition] = useState('All conditions')
  const [sort, setSort] = useState('newest')

  const visibleListings = listings
    .filter((listing) => {
      const matchesCategory =
        activeCategory === 'All listings' || listing.category === activeCategory
      const searchText = `${listing.title} ${listing.category}`.toLowerCase()
      return (
        matchesCategory &&
        searchText.includes(search.toLowerCase()) &&
        (condition === 'All conditions' || listing.condition === condition)
      )
    })
    .sort((a, b) =>
      sort === 'price-asc'
        ? Number(a.price.slice(1)) - Number(b.price.slice(1))
        : sort === 'price-desc'
          ? Number(b.price.slice(1)) - Number(a.price.slice(1))
          : 0,
    )

  return (
    <>
      <section className="welcome-band">
        <div className="page-width welcome-content">
          <div>
            <p className="eyebrow">BUILT FOR CAMPUS LIFE</p>
            <h1>
              Find your next <em>good thing.</em>
            </h1>
            <p className="welcome-copy">
              Buy, sell, and trade with people around you. No shipping, no strangers, no hassle.
            </p>
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
          <button
            className="view-all"
            type="button"
            onClick={() => {
              setActiveCategory('All listings')
              onSearchChange('')
              setCondition('All conditions')
              setSort('newest')
            }}
          >
            View all listings <span></span>
          </button>
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
          <button
            className="filter-button"
            type="button"
            aria-expanded={showFilters}
            aria-controls="listing-filters"
            onClick={() => setShowFilters((value) => !value)}
          >
            Filter <span></span>
          </button>
        </div>

        {showFilters && (
          <div className="listing-filters" id="listing-filters">
            <label>
              Item condition
              <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                {['All conditions', 'New', 'Like new', 'Good condition', 'Fair'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Sort listings
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
          </div>
        )}
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <div>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => onRetry()}>
              Retry listings
            </button>
          </div>
        ) : visibleListings.length > 0 ? (
          <div className="listing-grid">
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                saved={favorites.includes(listing.id)}
                onOpen={onOpenListing}
                onToggleFavorite={onToggleFavorite}
              />
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
  )
}

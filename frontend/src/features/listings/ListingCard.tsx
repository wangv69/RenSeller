import type { Listing } from './listing'

type ListingCardProps = {
  listing: Listing
  saved: boolean
  onOpen: (listing: Listing) => void
  onToggleFavorite: (id: number) => void
}

export default function ListingCard({
  listing,
  saved,
  onOpen,
  onToggleFavorite,
}: ListingCardProps) {
  return (
    <article
      className="listing-card"
      onClick={() => onOpen(listing)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen(listing)
      }}
      role="button"
      tabIndex={0}
    >
      <div className="listing-image-wrap">
        <img src={listing.image} alt={listing.title} />
        <button
          className={saved ? 'favorite-button saved' : 'favorite-button'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite(listing.id)
          }}
          type="button"
          aria-label={saved ? 'Remove from favorites' : 'Save listing'}
        >
          {saved ? '♥' : '♡'}
        </button>
        <span className="condition-tag">{listing.condition}</span>
      </div>
      <div className="listing-details">
        <div className="price-line">
          <h3>{listing.title}</h3>
          <strong>{listing.price}</strong>
        </div>
        <p className="listing-meta">
          RPI campus <span>·</span> {listing.category}
        </p>
        <p className="seller-line">
          <span className="avatar">{listing.seller[0]}</span> Listed by {listing.seller}
        </p>
      </div>
    </article>
  )
}

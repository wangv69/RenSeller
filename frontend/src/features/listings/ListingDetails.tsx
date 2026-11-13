import type { Listing } from './listing'

type ListingDetailsProps = {
  listing: Listing
  saved: boolean
  canMessage: boolean
  onClose: () => void
  onToggleFavorite: (id: number) => void
  onMessage: (sellerId: string) => void
}

export default function ListingDetails({
  listing,
  saved,
  canMessage,
  onClose,
  onToggleFavorite,
  onMessage,
}: ListingDetailsProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="listing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close listing details"
        >
          ×
        </button>
        <div className="listing-modal-image">
          <img src={listing.image} alt={listing.title} />
          <span className="condition-tag">{listing.condition}</span>
        </div>
        <div className="listing-modal-content">
          <div className="listing-modal-heading">
            <div>
              <p className="eyebrow">{listing.category}</p>
              <h2 id="listing-title">{listing.title}</h2>
            </div>
            <strong>{listing.price}</strong>
          </div>
          <p className="listing-modal-meta">
            RPI campus <span>·</span> Listed by {listing.seller}
          </p>
          <p className="modal-copy">
            A campus pickup listing in {listing.condition.toLowerCase()}. Message the seller to ask
            a question or arrange a convenient meeting time.
          </p>
          <div className="listing-modal-actions">
            <button
              className="favorite-detail-button"
              type="button"
              onClick={() => onToggleFavorite(listing.id)}
            >
              {saved ? '♥ Saved' : '♡ Save listing'}
            </button>
            <button
              className="sell-button"
              type="button"
              onClick={() => onMessage(listing.sellerId)}
              disabled={!canMessage}
              title={
                canMessage
                  ? 'Open your conversation with this seller'
                  : 'Sign in to contact this seller'
              }
            >
              Message seller <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

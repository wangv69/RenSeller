import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import './Moderation.css'

type ListingStatus = 'pending' | 'approved' | 'rejected' | 'removed'
type ReviewListing = {
  id: number
  name: string
  price: number
  category: string
  condition: string | null
  seller_id: string
  image_path: string | null
  moderation_status: ListingStatus
}
type ModerationProps = { onBack: () => void, onModerated: (id: number) => void }

export default function Moderation({ onBack, onModerated }: ModerationProps) {
  const [status, setStatus] = useState<ListingStatus>('pending')
  const [listings, setListings] = useState<ReviewListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<ReviewListing | null>(null)
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'approve' | 'reject' | 'remove' | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const mutation = useRef<AbortController | null>(null)

  useEffect(() => () => mutation.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setListings([])
      setError(null)
      try {
        if (!supabase) throw new Error('Supabase is not configured.')
        const result = await supabase.from('listings')
          .select('id, name, price, category, condition, seller_id, image_path, moderation_status')
          .eq('moderation_status', status).order('id', { ascending: false })
          .abortSignal(controller.signal)
        if (result.error) throw new Error(result.error.message)
        if (!controller.signal.aborted) setListings(result.data as ReviewListing[])
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load listings.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [status, reload])

  function chooseDecision(value: 'approve' | 'reject' | 'remove') {
    setError(null)
    if (!reason.trim() || reason.trim().length > 500) {
      setError('Enter a moderation reason of 1 to 500 characters.')
      return
    }
    setDecision(value)
  }

  async function confirmDecision() {
    if (!supabase || !selected || !decision || mutation.current) return
    const controller = new AbortController()
    mutation.current = controller
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      const result = await supabase.rpc('moderate_listing', {
        listing_id: selected.id, decision, reason: reason.trim(), expected_status: selected.moderation_status,
      }).abortSignal(controller.signal)
      if (result.error) throw new Error(result.error.message)
      if (controller.signal.aborted) return
      onModerated(selected.id)
      setSelected(null)
      setReason('')
      setDecision(null)
      setNotice('Listing updated. The moderation decision was recorded.')
      setReload((value) => value + 1)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to save the decision. Refresh before retrying.')
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null
        setSaving(false)
      }
    }
  }

  return (
    <section className="moderation-page page-width" aria-labelledby="moderation-title">
      <button className="back-button" type="button" disabled={saving} onClick={onBack}>Back to listings</button>
      <p className="eyebrow">ADMINISTRATION</p>
      <h1 id="moderation-title">Listing moderation</h1>
      <p>Review every listing before it appears in the marketplace.</p>
      <div className="moderation-toolbar">
        <label>Listing status<select value={status} disabled={saving} onChange={(event) => { setSelected(null); setDecision(null); setStatus(event.target.value as ListingStatus) }}>
          <option value="pending">Pending approval</option><option value="approved">Approved</option>
          <option value="rejected">Rejected</option><option value="removed">Removed</option>
        </select></label>
        <button className="filter-button" type="button" disabled={saving} onClick={() => { setSelected(null); setDecision(null); setReload((value) => value + 1) }}>Refresh listings</button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">Loading listings...</p> : listings.length === 0 ? <p>No listings in this queue.</p> : (
        <div className="moderation-list">{listings.map((listing) => (
          <article className="moderation-card" key={listing.id}>
            {listing.image_path && <img src={supabase!.storage.from('listing-images').getPublicUrl(listing.image_path).data.publicUrl} alt={listing.name} />}
            <div><h2>{listing.name}</h2><p>${Number(listing.price).toFixed(2)} · {listing.category} · {listing.condition || 'Condition not provided'}</p>
              <p>Seller ID: {listing.seller_id}</p><p>Status: {listing.moderation_status}</p>
              {listing.moderation_status !== 'removed' && <button className="filter-button" type="button" disabled={saving} onClick={() => { setSelected(listing); setReason(''); setDecision(null); setError(null); setNotice('') }} aria-label={`Review ${listing.name}`}>Review listing</button>}
            </div>
          </article>
        ))}</div>
      )}
      {selected && <section className="moderation-review" aria-label={`Reviewing ${selected.name}`}>
        <h2>Review: {selected.name}</h2>
        <label>Moderation reason<textarea value={reason} disabled={saving || !!decision} onChange={(event) => setReason(event.target.value)} /></label>
        {decision ? <div>
          <p>Confirm {decision} for “{selected.name}”? {decision === 'remove' && 'This hides the listing from the marketplace.'}</p>
          <button className="sell-button" type="button" disabled={saving} onClick={() => void confirmDecision()}>{saving ? 'Saving decision...' : `Confirm ${decision}`}</button>
          <button className="cancel-button" type="button" disabled={saving} onClick={() => setDecision(null)}>Cancel decision</button>
        </div> : <div className="moderation-actions">
          {selected.moderation_status === 'pending' && <><button className="sell-button" type="button" onClick={() => chooseDecision('approve')}>Approve</button><button className="filter-button" type="button" onClick={() => chooseDecision('reject')}>Reject</button></>}
          <button className="filter-button" type="button" onClick={() => chooseDecision('remove')}>Remove</button>
        </div>}
      </section>}
    </section>
  )
}

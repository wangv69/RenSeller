import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Props = {
  listingId: number
  userId: string
  onDeleted: (id: number, notice: string) => void
}

export default function DeleteListingButton({ listingId, userId, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function deleteListing() {
    if (!supabase || request.current) return
    const controller = new AbortController()
    request.current = controller
    setDeleting(true)
    setError(null)
    try {
      const result = await supabase
        .from('listings')
        .delete()
        .eq('id', listingId)
        .eq('seller_id', userId)
        .select('id, image_path')
        .abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (result.error || !result.data?.length) {
        setError(result.error?.message ?? 'This listing is no longer available or is not yours.')
        return
      }

      let notice = 'Listing deleted.'
      const path = result.data[0].image_path
      if (typeof path === 'string' && path.startsWith(`${userId}/`)) {
        try {
          const photo = await supabase.storage.from('listing-images').remove([path])
          if (photo.error) notice = 'Listing deleted, but its photo could not be removed.'
        } catch {
          notice = 'Listing deleted, but its photo could not be removed.'
        }
      }
      if (!controller.signal.aborted) onDeleted(listingId, notice)
    } catch {
      if (!controller.signal.aborted) setError('Unable to delete listing. Please try again.')
    } finally {
      if (!controller.signal.aborted) {
        request.current = null
        setDeleting(false)
      }
    }
  }

  return (
    <div>
      {confirming ? (
        <>
          <p>Delete this listing permanently?</p>
          <button
            type="button"
            className="cancel-button"
            disabled={deleting}
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
          >
            Keep listing
          </button>
          <button
            type="button"
            className="sell-button"
            disabled={deleting}
            onClick={() => void deleteListing()}
          >
            {deleting ? 'Deleting…' : 'Yes, delete it'}
          </button>
        </>
      ) : (
        <button type="button" className="cancel-button" onClick={() => setConfirming(true)}>
          Delete listing
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

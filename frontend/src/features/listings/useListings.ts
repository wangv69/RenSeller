import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toListing, type Listing, type ListingRow } from './listing'

export function useListings() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        if (!supabase) {
          setError('Listings are unavailable. Supabase is not configured.')
          return
        }
        const result = await supabase
          .from('listings')
          .select('id, name, price, category, condition, image_path, seller_id')
          .eq('moderation_status', 'approved')
          .order('id', { ascending: false })
        if (cancelled) return
        if (result.error) {
          setError(result.error.message)
          return
        }

        const rows = (result.data ?? []) as ListingRow[]
        const sellerIds = [...new Set(rows.map((row) => row.seller_id))]
        const members = await supabase
          .from('messaging_members')
          .select('id, full_name')
          .in('id', sellerIds)
        if (cancelled) return
        if (members.error) {
          setError(members.error.message)
          return
        }

        const names = new Map((members.data ?? []).map((member) => [member.id, member.full_name]))
        setListings(rows.map((row) => toListing({ ...row, sellerName: names.get(row.seller_id) })))
      } catch {
        if (!cancelled) setError('Unable to load listings. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    // Ignore late responses from a previous refresh or an unmounted page.
    return () => {
      cancelled = true
    }
  }, [revision])

  return { listings, setListings, loading, error, reload: () => setRevision((value) => value + 1) }
}

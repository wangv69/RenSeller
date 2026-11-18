import { useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'

type Handlers = { onInserted: () => void, onDeleted: (id: number) => void, onUpdated?: () => void }

// Listens for listings posted or deleted by anyone so the home page stays current without a refresh.
export function useListingChanges(handlers: Handlers) {
  const latest = useRef(handlers)
  useEffect(() => { latest.current = handlers })

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel('listing-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listings' }, () => { latest.current.onInserted() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'listings' }, () => { latest.current.onUpdated?.() })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'listings' }, (payload) => {
        const id = (payload as { old?: { id?: unknown } }).old?.id
        if (typeof id === 'number') latest.current.onDeleted(id)
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [])
}

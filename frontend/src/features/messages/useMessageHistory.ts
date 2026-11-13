import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Message } from './types'
import { mergeMessages } from './mergeMessages'

export function useMessageHistory(isOpen: boolean, userId: string) {
  const [threads, setThreads] = useState<Record<string, Message[]>>({})
  const [historyStatus, setHistoryStatus] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting...')

  useEffect(() => {
    const client = supabase
    if (!isOpen || !client) return
    let cancelled = false
    let loading = false
    let refreshAgain = false
    async function refreshHistory() {
      if (cancelled) return
      if (loading) {
        refreshAgain = true
        return
      }
      loading = true
      try {
        const history: Message[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await client!
            .from('direct_messages')
            .select('id, sender_id, recipient_id, body, created_at')
            .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
            .order('created_at')
            .order('id')
            .range(offset, offset + 499)
          if (cancelled) return
          if (error) throw error
          history.push(...(data ?? []))
          if (!data || data.length < 500) break
        }
        setThreads((current) => {
          const next = { ...current }
          const byPartner = new Map<string, Message[]>()
          history.forEach((message) => {
            const partnerId =
              message.sender_id === userId ? message.recipient_id : message.sender_id
            const messages = byPartner.get(partnerId) ?? []
            messages.push(message)
            byPartner.set(partnerId, messages)
          })
          byPartner.forEach((messages, partnerId) => {
            next[partnerId] = mergeMessages(next[partnerId] ?? [], messages)
          })
          return next
        })
        setHistoryStatus('')
      } catch {
        if (!cancelled) setHistoryStatus('Unable to load messages. Retrying automatically...')
      } finally {
        loading = false
        if (refreshAgain && !cancelled) {
          refreshAgain = false
          void refreshHistory()
        }
      }
    }
    queueMicrotask(() => {
      if (!cancelled) {
        setHistoryStatus('Loading messages...')
        setLiveStatus('Connecting...')
      }
    })
    const channel = client
      .channel(`messages:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void refreshHistory()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `sender_id=eq.${userId}`,
        },
        () => {
          void refreshHistory()
        },
      )
      .subscribe((status) => {
        if (cancelled) return
        setLiveStatus(
          status === 'SUBSCRIBED'
            ? 'Live updates connected'
            : 'Reconnecting. Checking for messages every 15 seconds.',
        )
        if (status === 'SUBSCRIBED') void refreshHistory()
      })
    void refreshHistory()
    const timer = window.setInterval(() => {
      void refreshHistory()
    }, 15000)
    function onFocus() {
      void refreshHistory()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      void client.removeChannel(channel)
    }
  }, [isOpen, userId])

  return { threads, setThreads, historyStatus, liveStatus }
}

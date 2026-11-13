import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './Messages.css'

type Member = {
  id: string
  full_name: string
}

type Message = {
  id: string
  body: string
  created_at: string
  sender_id: string
  recipient_id: string
}

type MessagesProps = {
  isOpen: boolean
  userId: string
  onClose: () => void
}

const suggestions = ['Is this still available?', 'Where on campus can we meet?', 'What time works for pickup?']

export default function Messages({ isOpen, userId, onClose }: MessagesProps) {
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const pendingSends = useRef(new Map<string, string>())
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})
  const [historyStatus, setHistoryStatus] = useState('')
  const [liveStatus, setLiveStatus] = useState('Connecting...')
  const [threads, setThreads] = useState<Record<string, Message[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const endOfMessages = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [directoryStatus, setDirectoryStatus] = useState('Loading students...')
  const member = members.find((member) => member.id === selectedMemberId) ?? members[0]
  const messages = member ? threads[member.id] ?? [] : []
  const draft = member ? drafts[member.id] ?? '' : ''
  const memberId = member?.id

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    async function loadMembers() {
      if (!supabase) {
        setDirectoryStatus('Student directory is unavailable. Supabase is not configured.')
        return
      }
      setDirectoryStatus('Loading students...')
      setMembers([])
      try {
        const { data, error } = await supabase.from('messaging_members')
          .select('id, full_name').neq('id', userId).order('full_name')
        if (cancelled) return
        if (error) throw error
        setMembers(data ?? [])
        setDirectoryStatus(data?.length ? '' : 'No other confirmed RPI students have joined yet.')
      } catch {
        if (!cancelled) setDirectoryStatus('Unable to load students. Please try reopening Messages. The Supabase student directory must be configured.')
      }
    }
    void loadMembers()
    return () => { cancelled = true }
  }, [isOpen, userId])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) endOfMessages.current?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, selectedMemberId, threads])

  useEffect(() => {
    const client = supabase
    if (!isOpen || !memberId || !client) return
    let cancelled = false
    let loading = false
    let refreshAgain = false
    async function refreshHistory() {
      if (cancelled) return
      if (loading) { refreshAgain = true; return }
      loading = true
      try {
        const history: Message[] = []
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await client!.from('direct_messages')
            .select('id, sender_id, recipient_id, body, created_at')
            .or(`and(sender_id.eq.${userId},recipient_id.eq.${memberId}),and(sender_id.eq.${memberId},recipient_id.eq.${userId})`)
            .order('created_at').order('id').range(offset, offset + 499)
          if (cancelled) return
          if (error) throw error
          history.push(...(data ?? []))
          if (!data || data.length < 500) break
        }
        setThreads((current) => {
          const merged = new Map((current[memberId!] ?? []).map((message) => [message.id, message]))
          history.forEach((message) => merged.set(message.id, message))
          return { ...current, [memberId!]: [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) }
        })
        setHistoryStatus('')
      } catch {
        if (!cancelled) setHistoryStatus('Unable to load messages. Retrying automatically...')
      } finally {
        loading = false
        if (refreshAgain && !cancelled) { refreshAgain = false; void refreshHistory() }
      }
    }
    queueMicrotask(() => {
      if (!cancelled) {
        setHistoryStatus('Loading messages...')
        setLiveStatus('Connecting...')
      }
    })
    const channel = client.channel(`messages:${userId}:${memberId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${userId}` }, () => { void refreshHistory() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` }, () => { void refreshHistory() })
      .subscribe((status) => {
        if (cancelled) return
        setLiveStatus(status === 'SUBSCRIBED' ? 'Live updates connected' : 'Reconnecting. Checking for messages every 15 seconds.')
        if (status === 'SUBSCRIBED') void refreshHistory()
      })
    void refreshHistory()
    const timer = window.setInterval(() => { void refreshHistory() }, 15000)
    function onFocus() { void refreshHistory() }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      void client.removeChannel(channel)
    }
  }, [isOpen, memberId, userId])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = draft.trim()
    const client = supabase
    if (!member || !client || !body || body.length > 2000 || sendingRef.current) return
    const recipientId = member.id
    const originalDraft = draft
    const key = JSON.stringify([recipientId, body])
    if (!pendingSends.current.has(key)) pendingSends.current.set(key, crypto.randomUUID())
    const id = pendingSends.current.get(key)!
    sendingRef.current = true
    setSending(true)
    setSendErrors((current) => ({ ...current, [recipientId]: '' }))
    try {
      const { data, error } = await client.from('direct_messages')
        .insert({ id, sender_id: userId, recipient_id: recipientId, body })
        .select('id, sender_id, recipient_id, body, created_at').single()
      let message = data as Message | null
      if (error) {
        // A previous attempt may have committed before the connection failed
        const existing = await client.from('direct_messages')
          .select('id, sender_id, recipient_id, body, created_at').eq('id', id).maybeSingle()
        if (!existing.data) throw error
        message = existing.data as Message
      }
      if (!message) throw new Error('Message was not saved')
      const saved = message
      setThreads((current) => ({ ...current, [recipientId]: [...(current[recipientId] ?? []).filter((item) => item.id !== saved.id), saved].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) }))
      setDrafts((current) => ({ ...current, [recipientId]: current[recipientId] === originalDraft ? '' : current[recipientId] }))
      pendingSends.current.delete(key)
      composer.current?.focus()
    } catch {
      setSendErrors((current) => ({ ...current, [recipientId]: 'Message could not be confirmed as sent. Your draft is saved here; press Send to retry.' }))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }


  return (
    <dialog className="messages-dialog" ref={dialog} aria-labelledby="messages-title" onCancel={onClose} onClose={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="messages-panel">
        <header className="messages-heading">
          <div><p className="eyebrow">CAMPUS CONVERSATIONS</p><h2 id="messages-title">Messages</h2></div>
          <button className="messages-close" type="button" onClick={onClose} aria-label="Close messages">×</button>
        </header>
        <p className="messages-preview-note" role="status">{liveStatus}</p>
        {directoryStatus && <p className="chat-empty" role="status">{directoryStatus}</p>}
        {member && <div className="messages-layout">
          <aside className="conversation-list" aria-label="Registered students">
            {members.map((item) => {
              const thread = threads[item.id] ?? []
              return (
                <button key={item.id} className={`conversation-item ${item.id === member.id ? 'selected' : ''}`} type="button" aria-pressed={item.id === member.id} onClick={() => setSelectedMemberId(item.id)}>
                  <span className="chat-avatar" aria-hidden="true">{item.full_name[0]}</span>
                  <span className="conversation-copy"><strong>{item.full_name}</strong><span>RPI student</span><small>{thread.at(-1)?.body ?? 'Start a pickup conversation'}</small></span>
                </button>
              )
            })}
          </aside>
          <section className="chat-thread" aria-label={`Conversation with ${member.full_name}`}>
            <header className="chat-header"><span className="chat-avatar" aria-hidden="true">{member.full_name[0]}</span><div><h3>{member.full_name}</h3><p>Registered student · RPI campus</p></div></header>
            <div className="chat-history" role="log" aria-label="Message history" aria-live="polite" aria-relevant="additions">
              {historyStatus && <p role="status">{historyStatus}</p>}
              {!historyStatus && messages.length === 0 ? <div className="chat-empty"><strong>Plan your campus pickup</strong><p>Ask about availability, suggest a meeting spot, and agree on a pickup time.</p></div> : messages.map((message) => (
                <div className={`chat-message ${message.sender_id === userId ? 'outgoing' : 'incoming'}`} key={message.id}><p>{message.body}</p><span>{message.sender_id === userId ? 'You' : member.full_name} · <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span></div>
              ))}
              <div ref={endOfMessages} />
            </div>
            <div className="chat-suggestions" aria-label="Pickup message suggestions">{suggestions.map((text) => <button key={text} type="button" onClick={() => { setDrafts((current) => ({ ...current, [member.id]: text })); composer.current?.focus() }}>{text}</button>)}</div>
            <form className="chat-composer" onSubmit={sendMessage}>
              {sendErrors[member.id] && <p className="chat-send-error" role="alert">{sendErrors[member.id]}</p>}
              <label className="chat-input-label" htmlFor="chat-draft">Message about pickup</label>
              <div>
                <textarea id="chat-draft" ref={composer} rows={2} maxLength={2000} value={draft} onChange={(event) => setDrafts((current) => ({ ...current, [member.id]: event.target.value }))} onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                    event.preventDefault()
                    if (!event.repeat && !sending && draft.trim()) event.currentTarget.form?.requestSubmit()
                  }
                }} aria-describedby="chat-keyboard-hint" placeholder="Suggest a pickup place and time…" />
                <button className="sell-button chat-send-button" disabled={sending || !draft.trim()} type="submit" aria-label={sending ? 'Sending message' : 'Send message'} title={sending ? 'Sending message' : 'Send message (Enter)'} aria-busy={sending}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                </button>
              </div>
              <p id="chat-keyboard-hint" className="chat-keyboard-hint">Enter to send · Shift+Enter for a new line</p>
            </form>
          </section>
        </div>}
      </div>
    </dialog>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './Messages.css'
import type { Member, Message } from './features/messages/types'
import { useMessageHistory } from './features/messages/useMessageHistory'
import { mergeMessages } from './features/messages/mergeMessages'
import MessageThread from './features/messages/MessageThread'

type MessagesProps = {
  isOpen: boolean
  userId: string
  initialMemberId?: string | null
  onClose: () => void
}

export default function Messages({ isOpen, userId, initialMemberId, onClose }: MessagesProps) {
  const { threads, setThreads, historyStatus, liveStatus } = useMessageHistory(isOpen, userId)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const pendingSends = useRef(new Map<string, string>())
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const endOfMessages = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [directoryStatus, setDirectoryStatus] = useState('Loading students...')
  const member = members.find((member) => member.id === selectedMemberId)
  const searchTerm = studentSearch.trim().toLocaleLowerCase()
  const conversations = members
    .filter((item) => threads[item.id]?.length || item.id === selectedMemberId || drafts[item.id])
    .sort((a, b) =>
      (threads[b.id]?.at(-1)?.created_at ?? '').localeCompare(
        threads[a.id]?.at(-1)?.created_at ?? '',
      ),
    )
  const searchResults = searchTerm
    ? members.filter((item) => item.full_name.toLocaleLowerCase().includes(searchTerm))
    : []
  const messages = member ? (threads[member.id] ?? []) : []
  const draft = member ? (drafts[member.id] ?? '') : ''

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
        const { data, error } = await supabase
          .from('messaging_members')
          .select('id, full_name')
          .neq('id', userId)
          .order('full_name')
        if (cancelled) return
        if (error) throw error
        setMembers(data ?? [])
        if (initialMemberId && data?.some((item) => item.id === initialMemberId)) {
          setSelectedMemberId(initialMemberId)
          setStudentSearch('')
        }
        setDirectoryStatus(data?.length ? '' : 'No other confirmed RPI students have joined yet.')
      } catch {
        if (!cancelled)
          setDirectoryStatus(
            'Unable to load students. Please try reopening Messages. The Supabase student directory must be configured.',
          )
      }
    }
    void loadMembers()
    return () => {
      cancelled = true
    }
  }, [initialMemberId, isOpen, userId])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (isOpen && !element.open) element.showModal()
    if (!isOpen && element.open) element.close()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) endOfMessages.current?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, selectedMemberId, threads])

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
      const { data, error } = await client
        .from('direct_messages')
        .insert({ id, sender_id: userId, recipient_id: recipientId, body })
        .select('id, sender_id, recipient_id, body, created_at')
        .single()
      let message = data as Message | null
      if (error) {
        // A previous attempt may have committed before the connection failed
        const existing = await client
          .from('direct_messages')
          .select('id, sender_id, recipient_id, body, created_at')
          .eq('id', id)
          .maybeSingle()
        if (!existing.data) throw error
        message = existing.data as Message
      }
      if (!message) throw new Error('Message was not saved')
      const saved = message
      setThreads((current) => ({
        ...current,
        [recipientId]: mergeMessages(current[recipientId] ?? [], [saved]),
      }))
      setDrafts((current) => ({
        ...current,
        [recipientId]: current[recipientId] === originalDraft ? '' : current[recipientId],
      }))
      pendingSends.current.delete(key)
      composer.current?.focus()
    } catch {
      setSendErrors((current) => ({
        ...current,
        [recipientId]:
          'Message could not be confirmed as sent. Your draft is saved here; press Send to retry.',
      }))
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <dialog
      className="messages-dialog"
      ref={dialog}
      aria-labelledby="messages-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="messages-panel">
        <header className="messages-heading">
          <div>
            <p className="eyebrow">CAMPUS CONVERSATIONS</p>
            <h2 id="messages-title">Messages</h2>
          </div>
          <button
            className="messages-close"
            type="button"
            onClick={onClose}
            aria-label="Close messages"
          >
            ×
          </button>
        </header>
        <p className="messages-preview-note" role="status">
          {liveStatus}
        </p>
        {directoryStatus && (
          <p className="chat-empty" role="status">
            {directoryStatus}
          </p>
        )}
        <div className="messages-layout">
          <aside className="conversation-list" aria-label="Conversations">
            <div className="student-search">
              <label htmlFor="student-search">New message</label>
              <input
                id="student-search"
                type="search"
                aria-label="Find a student"
                placeholder="Search students by name"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
              {searchTerm && (
                <p role="status">
                  {directoryStatus ||
                    (searchResults.length
                      ? 'Select a student to start a conversation.'
                      : 'No students found.')}
                </p>
              )}
            </div>
            {!searchTerm && !directoryStatus && conversations.length === 0 && (
              <p className="chat-empty">
                No conversations yet. Search for a student to start a message.
              </p>
            )}
            {(searchTerm ? searchResults : conversations).map((item) => {
              const thread = threads[item.id] ?? []
              return (
                <button
                  key={item.id}
                  className={`conversation-item ${item.id === member?.id ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={item.id === member?.id}
                  onClick={() => {
                    setSelectedMemberId(item.id)
                    setStudentSearch('')
                  }}
                >
                  <span className="chat-avatar" aria-hidden="true">
                    {item.full_name[0]}
                  </span>
                  <span className="conversation-copy">
                    <strong>{item.full_name}</strong>
                    <span>RPI student</span>
                    <small>{thread.at(-1)?.body ?? 'Start a pickup conversation'}</small>
                  </span>
                </button>
              )
            })}
          </aside>
          {member ? (
            <MessageThread
              member={member}
              userId={userId}
              messages={messages}
              draft={draft}
              historyStatus={historyStatus}
              sendError={sendErrors[member.id]}
              sending={sending}
              composer={composer}
              endOfMessages={endOfMessages}
              onSend={sendMessage}
              onDraftChange={(value) =>
                setDrafts((current) => ({ ...current, [member.id]: value }))
              }
            />
          ) : (
            <section className="chat-empty">
              <h3>Your messages</h3>
              <p>Select a conversation or search for a student to start a new DM.</p>
              {historyStatus && <p role="status">{historyStatus}</p>}
            </section>
          )}
        </div>
      </div>
    </dialog>
  )
}

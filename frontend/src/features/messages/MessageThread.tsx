import type { FormEvent, RefObject } from 'react'
import type { Member, Message } from './types'

const suggestions = [
  'Is this still available?',
  'Where on campus can we meet?',
  'What time works for pickup?',
]

type MessageThreadProps = {
  member: Member
  userId: string
  messages: Message[]
  draft: string
  historyStatus: string
  sendError?: string
  sending: boolean
  composer: RefObject<HTMLTextAreaElement | null>
  endOfMessages: RefObject<HTMLDivElement | null>
  onDraftChange: (value: string) => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
}

export default function MessageThread({
  member,
  userId,
  messages,
  draft,
  historyStatus,
  sendError,
  sending,
  composer,
  endOfMessages,
  onDraftChange,
  onSend,
}: MessageThreadProps) {
  return (
    <section className="chat-thread" aria-label={`Conversation with ${member.full_name}`}>
      <header className="chat-header">
        <span className="chat-avatar" aria-hidden="true">
          {member.full_name[0]}
        </span>
        <div>
          <h3>{member.full_name}</h3>
          <p>Registered student · RPI campus</p>
        </div>
      </header>
      <div
        className="chat-history"
        role="log"
        aria-label="Message history"
        aria-live="polite"
        aria-relevant="additions"
      >
        {historyStatus && <p role="status">{historyStatus}</p>}
        {!historyStatus && messages.length === 0 ? (
          <div className="chat-empty">
            <strong>Plan your campus pickup</strong>
            <p>Ask about availability, suggest a meeting spot, and agree on a pickup time.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              className={`chat-message ${message.sender_id === userId ? 'outgoing' : 'incoming'}`}
              key={message.id}
            >
              <p>{message.body}</p>
              <span>
                {message.sender_id === userId ? 'You' : member.full_name} ·{' '}
                <time dateTime={message.created_at}>
                  {new Date(message.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
              </span>
            </div>
          ))
        )}
        <div ref={endOfMessages} />
      </div>
      <div className="chat-suggestions" aria-label="Pickup message suggestions">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => {
              onDraftChange(text)
              composer.current?.focus()
            }}
          >
            {text}
          </button>
        ))}
      </div>
      <form className="chat-composer" onSubmit={onSend}>
        {sendError && (
          <p className="chat-send-error" role="alert">
            {sendError}
          </p>
        )}
        <label className="chat-input-label" htmlFor="chat-draft">
          Message about pickup
        </label>
        <div>
          <textarea
            id="chat-draft"
            ref={composer}
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault()
                if (!event.repeat && !sending && draft.trim())
                  event.currentTarget.form?.requestSubmit()
              }
            }}
            aria-describedby="chat-keyboard-hint"
            placeholder="Suggest a pickup place and time…"
          />
          <button
            className="sell-button chat-send-button"
            disabled={sending || !draft.trim()}
            type="submit"
            aria-label={sending ? 'Sending message' : 'Send message'}
            title={sending ? 'Sending message' : 'Send message (Enter)'}
            aria-busy={sending}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
        <p id="chat-keyboard-hint" className="chat-keyboard-hint">
          Enter to send · Shift+Enter for a new line
        </p>
      </form>
    </section>
  )
}

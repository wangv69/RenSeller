import { useEffect, useState } from 'react'
import './Messages.css'

type Conversation = {
  id: number
  seller: string
  listing: string
  price: string
  image: string
  lastMessage: string
  time: string
  unread: boolean
  messages: { sender: 'you' | 'them'; text: string; time: string }[]
}

const initialConversations: Conversation[] = [
  {
    id: 1,
    seller: 'Maya R.',
    listing: 'MacBook Air M2, 13-inch',
    price: '$650',
    image: 'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=300&q=80',
    lastMessage: 'Is this still available?',
    time: 'Today',
    unread: true,
    messages: [{ sender: 'them', text: 'Hi! Is this still available?', time: '10:42 AM' }],
  },
  {
    id: 2,
    seller: 'Evan T.',
    listing: 'Calculus: Early Transcendentals',
    price: '$35',
    image: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=300&q=80',
    lastMessage: 'I can meet by the library this afternoon.',
    time: 'Yesterday',
    unread: false,
    messages: [
      { sender: 'you', text: 'Would you be available for a campus pickup?', time: 'Yesterday' },
      { sender: 'them', text: 'I can meet by the library this afternoon.', time: 'Yesterday' },
    ],
  },
]

type MessagesProps = {
  onBack: () => void
  onUnreadCountChange: (count: number) => void
}

export default function Messages({ onBack, onUnreadCountChange }: MessagesProps) {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [draft, setDraft] = useState('')
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0]

  useEffect(() => {
    onUnreadCountChange(conversations.filter((conversation) => conversation.unread).length)
  }, [conversations, onUnreadCountChange])

  function selectConversation(id: number) {
    setSelectedId(id)
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unread: false } : conversation))
  }

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setConversations((current) => current.map((conversation) => conversation.id === selectedId
      ? {
          ...conversation,
          lastMessage: text,
          time: 'Just now',
          messages: [...conversation.messages, { sender: 'you', text, time: 'Just now' }],
        }
      : conversation))
    setDraft('')
  }

  return (
    <section className="messages-page page-width" aria-labelledby="messages-title">
      <div className="messages-page-header">
        <button className="back-button" type="button" onClick={onBack}>← Back to listings</button>
        <p className="eyebrow">CAMPUS CONVERSATIONS</p>
        <h1 id="messages-title">Messages</h1>
        <p className="profile-subtitle">Connect with buyers and sellers to arrange an on-campus exchange.</p>
      </div>

      <div className="messages-layout">
        <aside className="conversation-list" aria-label="Conversations">
          <div className="conversation-list-heading"><h2>Inbox</h2><span>{conversations.filter((conversation) => conversation.unread).length} unread</span></div>
          {conversations.map((conversation) => <button className={conversation.id === selectedId ? 'conversation-card active' : 'conversation-card'} key={conversation.id} type="button" onClick={() => selectConversation(conversation.id)}>
            <img src={conversation.image} alt="" />
            <span className="conversation-card-content"><strong>{conversation.seller}</strong><span>{conversation.listing}</span><small>{conversation.lastMessage}</small></span>
            <span className="conversation-card-meta"><small>{conversation.time}</small>{conversation.unread && <b aria-label="Unread message" />}</span>
          </button>)}
        </aside>

        {selectedConversation ? <section className="conversation-panel" aria-label={`Conversation with ${selectedConversation.seller}`}>
          <header className="conversation-header"><div><p className="eyebrow">ABOUT THIS LISTING</p><h2>{selectedConversation.listing}</h2><span>{selectedConversation.price} · Listed by {selectedConversation.seller}</span></div><img src={selectedConversation.image} alt="" /></header>
          <div className="exchange-notice">For your safety, arrange exchanges in a public campus location.</div>
          <div className="message-history">{selectedConversation.messages.map((message, index) => <div className={message.sender === 'you' ? 'message-bubble outgoing' : 'message-bubble'} key={`${message.time}-${index}`}><p>{message.text}</p><small>{message.time}</small></div>)}</div>
          <form className="message-composer" onSubmit={sendMessage}><label htmlFor="message-input">Message {selectedConversation.seller}</label><div><textarea id="message-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question or suggest a campus meeting spot..." rows={3} /><button className="sell-button" type="submit" disabled={!draft.trim()}>Send <span>→</span></button></div></form>
        </section> : <div className="messages-empty"><strong>No conversations yet</strong><span>Message a seller from any listing to start a conversation.</span></div>}
      </div>
    </section>
  )
}

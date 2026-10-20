import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './Profile.css'

type ProfileProps = {
  onBack: () => void
  onMessagesOpen: () => void
  savedListings: SavedListing[]
  onToggleSaved: (id: number) => void
}

type SavedListing = {
  id: number
  title: string
  price: string
  category: string
  image: string
  condition: string
  seller: string
}

type Feedback = {
  message: string
  type: 'error' | 'success'
}

const dormOptions = ['North Hall', 'Bray Hall', 'Nason Hall', 'Barton Hall']

const purchases = [
  { title: 'Calculus: Early Transcendentals', seller: 'Evan T.', date: 'September 18, 2026', price: '$35', status: 'Completed' },
  { title: 'Sony noise-canceling headphones', seller: 'Priya S.', date: 'August 29, 2026', price: '$90', status: 'Completed' },
]

const listings = [
  { title: 'MacBook Air M2, 13-inch', date: 'September 24, 2026', price: '$650', status: 'Active' },
  { title: 'Vintage varsity jacket', date: 'September 2, 2026', price: '$48', status: 'Sold' },
]

export default function Profile({ onBack, onMessagesOpen, savedListings, onToggleSaved }: ProfileProps) {
  const [profileImage, setProfileImage] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [dorm, setDorm] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [activeSection, setActiveSection] = useState<'information' | 'history' | 'saved'>('information')
  const [feedback, setFeedback] = useState<Feedback | null>(() => supabase ? null : { message: 'Add your Supabase variables to frontend/.env.local first.', type: 'error' })
  const [saving, setSaving] = useState(false)
  const [sessionReady, setSessionReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        setFeedback({ message: 'Please sign in to view your profile.', type: 'error' })
      } else {
        const metadata = data.user.user_metadata ?? {}
        setProfileImage(metadata.avatar_url ?? '')
        setFullName(metadata.full_name ?? '')
        setEmail(data.user.email ?? '')
        setDorm(metadata.dorm ?? '')
      }
      setSessionReady(true)
    })
  }, [])

  async function saveInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail.endsWith('@rpi.edu')) {
      setFeedback({ message: 'Your email must be an RPI email address.', type: 'error' })
      return
    }
    if (!fullName.trim()) {
      setFeedback({ message: 'Enter your full name.', type: 'error' })
      return
    }
    if (!supabase) return

    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      email: normalizedEmail,
      data: { full_name: fullName.trim(), dorm: dorm || null },
    })
    setSaving(false)
    setFeedback(error
      ? { message: error.message, type: 'error' }
      : { message: normalizedEmail !== email ? 'Check your new email to confirm the change.' : 'Profile information saved.', type: 'success' })
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    if (newPassword.length < 6) {
      setFeedback({ message: 'Your new password must be at least 6 characters.', type: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ message: 'Passwords do not match.', type: 'error' })
      return
    }
    if (!supabase) return

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)
    if (!error) {
      setNewPassword('')
      setConfirmPassword('')
    }
    setFeedback(error ? { message: error.message, type: 'error' } : { message: 'Password updated.', type: 'success' })
  }

  async function uploadProfileImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !supabase) return
    if (!file.type.startsWith('image/')) {
      setFeedback({ message: 'Choose an image file.', type: 'error' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ message: 'Profile pictures must be smaller than 5 MB.', type: 'error' })
      return
    }

    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setSaving(false)
      return
    }
    const filePath = `${userData.user.id}/avatar-${Date.now()}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (uploadError) {
      setSaving(false)
      setFeedback({ message: uploadError.message, type: 'error' })
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const { error: updateError } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } })
    setSaving(false)
    if (!updateError) setProfileImage(data.publicUrl)
    setFeedback(updateError ? { message: updateError.message, type: 'error' } : { message: 'Profile picture updated.', type: 'success' })
  }

  const username = email.split('@')[0] || 'student'
  const initial = (fullName.trim() || username).charAt(0).toUpperCase()

  if (!sessionReady) return <section className="profile-page page-width"><p className="profile-loading">Loading profile...</p></section>

  return (
    <section className="profile-page page-width" aria-labelledby="profile-title">
      <div className="profile-page-header">
        <button className="back-button" type="button" onClick={onBack}>← Back to listings</button>
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1 id="profile-title">Profile</h1>
        <p className="profile-subtitle">Manage your student marketplace account and activity.</p>
      </div>

      <div className="profile-layout">
        <aside className="profile-sidebar" aria-label="Profile sections">
          <button className={activeSection === 'information' ? 'profile-tab active' : 'profile-tab'} type="button" onClick={() => setActiveSection('information')}>Information</button>
          <button className={activeSection === 'history' ? 'profile-tab active' : 'profile-tab'} type="button" onClick={() => setActiveSection('history')}>Purchase & listing history</button>
          <button className={activeSection === 'saved' ? 'profile-tab active' : 'profile-tab'} type="button" onClick={() => setActiveSection('saved')}>Saved listings <span className="profile-tab-count">{savedListings.length}</span></button>
          <button className="profile-tab" type="button" onClick={onMessagesOpen}>Messages</button>
        </aside>

        <div className="profile-content">
          {feedback && <p className={`profile-feedback ${feedback.type}`} role="status">{feedback.message}</p>}
          {activeSection === 'information' ? <>
            <div className="profile-panel profile-identity-panel">
              <div className="profile-picture-wrap"><div className="profile-picture">{profileImage ? <img src={profileImage} alt="Profile" /> : initial}</div><label className="upload-picture">Change picture<input type="file" accept="image/*" onChange={uploadProfileImage} /></label></div>
              <div><p className="eyebrow">ACCOUNT DETAILS</p><h2>{fullName || username}</h2><p className="profile-username">@{username}</p></div>
            </div>

            <form className="profile-panel profile-form" onSubmit={saveInformation}>
              <div className="profile-panel-heading"><div><p className="eyebrow">INFORMATION</p><h2>Personal details</h2></div><button className="sell-button" disabled={saving} type="submit">{saving ? 'Saving...' : 'Save changes'}</button></div>
              <div className="profile-form-grid"><label>Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label><label>RPI email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Current dorm<select value={dorm} onChange={(event) => setDorm(event.target.value)}><option value="">Prefer not to say</option>{dormOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div>
            </form>

            <form className="profile-panel profile-form" onSubmit={savePassword}>
              <div className="profile-panel-heading"><div><p className="eyebrow">SECURITY</p><h2>Change password</h2></div><button className="sell-button" disabled={saving} type="submit">{saving ? 'Saving...' : 'Update password'}</button></div>
              <div className="profile-form-grid"><label>New password<input required minLength={6} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label><label>Confirm new password<input required minLength={6} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label></div>
            </form>
          </> : activeSection === 'history' ? <div className="history-stack">
            <div className="profile-panel"><div className="profile-panel-heading"><div><p className="eyebrow">PURCHASES</p><h2>Purchase history</h2></div><span className="history-count">{purchases.length} items</span></div><div className="history-list">{purchases.map((purchase) => <article className="history-row" key={purchase.title}><div><h3>{purchase.title}</h3><p>Bought from {purchase.seller} · {purchase.date}</p></div><div className="history-price"><strong>{purchase.price}</strong><span>{purchase.status}</span></div></article>)}</div></div>
            <div className="profile-panel"><div className="profile-panel-heading"><div><p className="eyebrow">SELLING</p><h2>Listing history</h2></div><span className="history-count">{listings.length} items</span></div><div className="history-list">{listings.map((listing) => <article className="history-row" key={listing.title}><div><h3>{listing.title}</h3><p>Listed on {listing.date}</p></div><div className="history-price"><strong>{listing.price}</strong><span className={listing.status === 'Sold' ? 'history-status sold' : 'history-status'}>{listing.status}</span></div></article>)}</div></div>
          </div> : <section className="profile-panel saved-listings-panel">
            <div className="profile-panel-heading"><div><p className="eyebrow">YOUR BOOKMARKS</p><h2>Saved listings</h2></div><span className="history-count">{savedListings.length} {savedListings.length === 1 ? 'item' : 'items'}</span></div>
            {savedListings.length > 0 ? <div className="saved-listings-grid">{savedListings.map((listing) => <article className="saved-listing-row" key={listing.id}><img src={listing.image} alt="" /><div className="saved-listing-details"><h3>{listing.title}</h3><p>{listing.category} · {listing.condition} · Listed by {listing.seller}</p><strong>{listing.price}</strong></div><button className="remove-saved-button" type="button" onClick={() => onToggleSaved(listing.id)} aria-label={`Remove ${listing.title} from saved listings`}>Remove</button></article>)}</div> : <div className="saved-listings-empty"><strong>No saved listings yet</strong><span>Use the heart button on a listing to save it here.</span><button className="back-button" type="button" onClick={onBack}>Browse listings →</button></div>}
          </section>}
        </div>
      </div>
    </section>
  )
}

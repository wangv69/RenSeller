import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './Auth.css'

type AuthProps = {
  onProfileOpen: () => void
}

export default function Auth({ onProfileOpen }: AuthProps) {
  const [showAuthForm, setShowAuthForm] = useState(false)
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authFullName, setAuthFullName] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageType, setAuthMessageType] = useState<'error' | 'success'>('error')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  function openAuthForm(mode: 'sign-in' | 'sign-up' = 'sign-in') {
    setAuthMode(mode)
    setAuthMessage('')
    setAuthMessageType('error')
    setShowAuthForm(true)
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthMessage('')
    setAuthMessageType('error')
    if (!supabase) {
      setAuthMessage('Add your Supabase variables to frontend/.env.local first.')
      return
    }

    const normalizedEmail = authEmail.trim().toLowerCase()
    if (authMode === 'sign-up') {
      if (!normalizedEmail.endsWith('@rpi.edu')) {
        setAuthMessage('Please enter an RPI email address.')
        return
      }
      if (!authFullName.trim()) {
        setAuthMessage('Enter your full name.')
        return
      }
      if (authPassword !== authConfirmPassword) {
        setAuthMessage('Passwords do not match.')
        return
      }
    }

    setAuthLoading(true)
    const result = authMode === 'sign-in'
      ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password: authPassword })
      : await supabase.auth.signUp({
          email: normalizedEmail,
          password: authPassword,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              username: normalizedEmail.split('@')[0],
              full_name: authFullName.trim(),
            },
          },
        })
    setAuthLoading(false)

    if (result.error) {
      setAuthMessage(result.error.message)
      return
    }

    if (authMode === 'sign-up') {
      setAuthMessageType('success')
      setAuthMessage('Check your email to confirm your account.')
    }
    if (authMode === 'sign-in') setShowAuthForm(false)
  }

  async function signOut() {
    await supabase?.auth.signOut()
    setSession(null)
  }

  const profileUsername = session?.user.user_metadata?.username ?? session?.user.email?.split('@')[0] ?? 'Profile'
  const profileInitial = profileUsername.charAt(0).toUpperCase()

  return (
    <>
{session ? <div className="profile-menu"><button className="profile-trigger" type="button" aria-haspopup="true"><span className="profile-avatar">{profileInitial}</span><span>{profileUsername}</span><span className="profile-chevron" aria-hidden="true">⌄</span></button><div className="profile-dropdown" role="menu"><button className="profile-menu-item" type="button" onClick={onProfileOpen} role="menuitem">View profile</button><button className="profile-menu-item" type="button" onClick={signOut} role="menuitem">Sign out</button></div></div> : <button className="text-button" type="button" onClick={() => openAuthForm()}>Sign in</button>}
{showAuthForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAuthForm(false) }}><div className="sell-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={() => setShowAuthForm(false)} type="button" aria-label="Close">×</button><p className="eyebrow">RENSELLER ACCOUNT</p><h2 id="auth-title">{authMode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2><p className="modal-copy">{authMode === 'sign-in' ? 'Sign in with your email and password.' : 'Create an account with your RPI email.'}</p><form onSubmit={submitAuth}>{authMode === 'sign-up' && <label>Full name<input required autoComplete="name" value={authFullName} onChange={(event) => setAuthFullName(event.target.value)} placeholder="Your full name" /></label>}<label>RPI email<input required autoComplete="email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="RCSID@rpi.edu" /></label><label>Password<input required autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" /></label>{authMode === 'sign-up' && <label>Confirm password<input required autoComplete="new-password" minLength={6} type="password" value={authConfirmPassword} onChange={(event) => setAuthConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></label>}{authMessage && <p className={`auth-message ${authMessageType}`} role="status">{authMessage}</p>}<div className="modal-actions"><button className="cancel-button" type="button" onClick={() => setAuthMode(authMode === 'sign-in' ? 'sign-up' : 'sign-in')}>{authMode === 'sign-in' ? 'Create account' : 'Sign in instead'}</button><button className="sell-button" disabled={authLoading} type="submit">{authLoading ? 'Working...' : authMode === 'sign-in' ? 'Sign in' : 'Sign up'} <span>→</span></button></div></form></div></div>}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './Auth.css'

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password' | 'reset-complete'

function isRecoveryLink() {
  return new URLSearchParams(window.location.search).get('recovery') === '1' ||
    new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
}

type AuthProps = {
  onSessionChange: (session: Session | null) => void
  onProfileOpen: () => void
}

export default function Auth({ onSessionChange, onProfileOpen }: AuthProps) {
  const recovering = useRef(isRecoveryLink())
  const [showAuthForm, setShowAuthForm] = useState(isRecoveryLink)
  const [authMode, setAuthMode] = useState<AuthMode>(() => isRecoveryLink() ? 'reset-password' : 'sign-in')
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authFullName, setAuthFullName] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authMessageType, setAuthMessageType] = useState<'error' | 'success'>('error')
  const [authLoading, setAuthLoading] = useState(false)
  const [invalidRecoveryLink, setInvalidRecoveryLink] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('error'))

  useEffect(() => {
    if (!supabase) return

    function updateSession(nextSession: Session | null) {
      setSession(nextSession)
      if (nextSession && !recovering.current) {
        setShowAuthForm(false)
        setAuthMessage('')
        setAuthPassword('')
        setAuthConfirmPassword('')
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      updateSession(data.session)
      if (recovering.current && (error || !data.session || new URLSearchParams(window.location.hash.slice(1)).has('error'))) {
        setAuthMessage('This reset link is invalid or expired. Request a new reset email.')
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering.current = true
        setInvalidRecoveryLink(false)
        setAuthMode('reset-password')
        setShowAuthForm(true)
        setAuthMessage('')
        setAuthPassword('')
        setAuthConfirmPassword('')
      }
      updateSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    onSessionChange(authMode === 'reset-password' ? null : session)
  }, [session, authMode, onSessionChange])

  function openAuthForm(mode: AuthMode = 'sign-in') {
    recovering.current = mode === 'reset-password'
    if (!recovering.current) {
      const url = new URL(window.location.href)
      url.searchParams.delete('recovery')
      window.history.replaceState(null, '', url.pathname + url.search)
    }
    setAuthPassword('')
    setAuthConfirmPassword('')
    setAuthMode(mode)
    setAuthMessage('')
    setAuthMessageType('error')
    setShowAuthForm(true)
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (authLoading || authMode === 'reset-complete') return
    setAuthMessage('')
    setAuthMessageType('error')
    if (!supabase) {
      setAuthMessage('Add your Supabase variables to frontend/.env.local first.')
      return
    }

    const normalizedEmail = authEmail.trim().toLowerCase()
    if (authMode === 'sign-up' || authMode === 'forgot-password') {
      const rpiEmailPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@rpi\.edu$/
      const localPart = normalizedEmail.split('@')[0]
      if (!rpiEmailPattern.test(normalizedEmail) || localPart.length > 64) {
        setAuthMessage('Please enter a valid RPI email address ending in @rpi.edu.')
        return
      }
    }
    if (authMode === 'sign-up') {
      if (!authFullName.trim()) {
        setAuthMessage('Enter your full name.')
        return
      }
      if (authPassword !== authConfirmPassword) {
        setAuthMessage('Passwords do not match.')
        return
      }
    }

    if (authMode === 'reset-password') {
      if (!session || invalidRecoveryLink) {
        setAuthMessage('This reset link is invalid or expired. Request a new reset email.')
        return
      }
      if (authPassword.length < 6) {
        setAuthMessage('Use a password with at least 6 characters.')
        return
      }
      if (authPassword !== authConfirmPassword) {
        setAuthMessage('Passwords do not match.')
        return
      }
    }

    setAuthLoading(true)
    try {
      if (authMode === 'forgot-password') {
        const redirectTo = new URL(window.location.origin)
        redirectTo.searchParams.set('recovery', '1')
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: redirectTo.toString() })
        if (error) {
          setAuthMessage(error.message)
        } else {
          setAuthMessageType('success')
          setAuthMessage('If an account exists for this RPI email, you will receive a password reset link. Check your inbox and spam folder.')
        }
        return
      }
      if (authMode === 'reset-password') {
        const { error } = await supabase.auth.updateUser({ password: authPassword })
        if (error) {
          setAuthMessage(error.message)
          return
        }
        openAuthForm('reset-complete')
        setAuthMessageType('success')
        setAuthMessage('Your password has been updated. You are signed in and can continue browsing.')
        return
      }
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

      if (result.error) {
        const duplicateAccount = authMode === 'sign-up' && (
          result.error.code === 'user_already_exists' ||
          result.error.code === 'email_exists' ||
          /user already registered|user already exists/i.test(result.error.message)
        )
        setAuthMessage(duplicateAccount ? 'User already exists. Please sign in instead.' : result.error.message)
        return
      }

      // Supabase can hide an existing confirmed account behind a successful
      // sign-up response with no identities instead of returning an error.
      if (authMode === 'sign-up' && result.data.user?.identities?.length === 0) {
        setAuthMessage('User already exists. Please sign in instead.')
        return
      }

      if (result.data.session) {
        setSession(result.data.session)
        setShowAuthForm(false)
        setAuthPassword('')
        setAuthConfirmPassword('')
        return
      }

      if (authMode === 'sign-up') {
        setAuthMessageType('success')
        setAuthMessage('Check your RPI email to confirm your account. You will be signed in automatically when you return through the confirmation link.')
      }
    } catch {
      setAuthMessageType('error')
      setAuthMessage('Unable to complete the request. Please check your connection and try again.')
    } finally {
      setAuthLoading(false)
    }
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
      {showAuthForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !authLoading) setShowAuthForm(false)
        }}>
          <div className="sell-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close" disabled={authLoading} onClick={() => setShowAuthForm(false)} type="button" aria-label="Close">×</button>
            <p className="eyebrow">RENSELLER ACCOUNT</p>
            <h2 id="auth-title">{authMode === 'sign-in' ? 'Welcome back' : authMode === 'sign-up' ? 'Create your account' : authMode === 'forgot-password' ? 'Forgot password?' : authMode === 'reset-complete' ? 'Password updated' : 'Set a new password'}</h2>
            <p className="modal-copy">{authMode === 'sign-in' ? 'Sign in with your email and password.' : authMode === 'sign-up' ? 'Create an account with your RPI email.' : authMode === 'forgot-password' ? 'Enter your RPI email and we will send you a password reset link.' : authMode === 'reset-complete' ? 'Your password has been updated. You are signed in.' : 'Choose a new password for your account.'}</p>
            {authMode === 'reset-complete' ? (
              <div className="modal-actions"><button className="sell-button" type="button" onClick={() => setShowAuthForm(false)}>Continue browsing</button></div>
            ) : <form onSubmit={submitAuth}>
              {authMode === 'sign-up' && <label>Full name<input required disabled={authLoading} autoComplete="name" value={authFullName} onChange={(event) => setAuthFullName(event.target.value)} placeholder="Your full name" /></label>}
              {authMode !== 'reset-password' && <label>RPI email<input required disabled={authLoading} autoComplete="email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="RCSID@rpi.edu" /></label>}
              {authMode !== 'forgot-password' && <label>{authMode === 'reset-password' ? 'New password' : 'Password'}<input required disabled={authLoading} autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'} minLength={6} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="At least 6 characters" /></label>}
              {(authMode === 'sign-up' || authMode === 'reset-password') && <label>Confirm password<input required disabled={authLoading} autoComplete="new-password" minLength={6} type="password" value={authConfirmPassword} onChange={(event) => setAuthConfirmPassword(event.target.value)} placeholder="Re-enter your password" /></label>}
              {authMode === 'sign-in' && <button className="auth-link" disabled={authLoading} type="button" onClick={() => openAuthForm('forgot-password')}>Forgot password?</button>}
              {authMessage && <p className={`auth-message ${authMessageType}`} role="status">{authMessage}</p>}
              <div className="modal-actions">
                <button className="cancel-button" disabled={authLoading} type="button" onClick={() => openAuthForm(authMode === 'sign-in' ? 'sign-up' : authMode === 'reset-password' ? 'forgot-password' : 'sign-in')}>{authMode === 'sign-in' ? 'Create account' : authMode === 'reset-password' ? 'Request new link' : 'Back to sign in'}</button>
                <button className="sell-button" disabled={authLoading || (authMode === 'reset-password' && (!session || invalidRecoveryLink))} type="submit">{authLoading ? 'Working...' : authMode === 'sign-in' ? 'Sign in' : authMode === 'sign-up' ? 'Sign up' : authMode === 'forgot-password' ? 'Send reset link' : 'Update password'} <span>→</span></button>
              </div>
            </form>}
          </div>
        </div>
      )}
    </>
  )
}

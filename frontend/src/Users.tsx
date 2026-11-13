import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import './Moderation.css'

type Account = {
  user_id: string
  email: string
  account_group: 'user' | 'admin'
  eligible: boolean
}
type Props = { userId: string; onBack: () => void }

export default function Users({ userId, onBack }: Props) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<Account | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const mutation = useRef<AbortController | null>(null)
  useEffect(() => () => mutation.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setLoading(true)
      setAccounts([])
      setHasMore(false)
      setError('')
      try {
        if (!supabase) throw new Error('Supabase is not configured.')
        const result = await supabase
          .rpc('list_account_groups', { query_text: query, page_offset: offset })
          .abortSignal(controller.signal)
        if (result.error) throw new Error(result.error.message)
        if (controller.signal.aborted) return
        const rows = (result.data ?? []) as Account[]
        setAccounts(rows.slice(0, 50))
        setHasMore(rows.length > 50)
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Unable to load accounts.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [query, offset, revision])

  function searchAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelected(null)
    setQuery(search.trim())
    setOffset(0)
    setRevision((value) => value + 1)
  }

  async function confirmChange() {
    if (
      !supabase ||
      !selected ||
      mutation.current ||
      selected.account_group === 'admin' ||
      selected.user_id === userId
    )
      return
    if (!reason.trim() || reason.trim().length > 500) {
      setError('Enter a reason of 1 to 500 characters.')
      return
    }
    const controller = new AbortController()
    mutation.current = controller
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await supabase
        .rpc('set_account_group', {
          target_user_id: selected.user_id,
          new_group: 'admin',
          expected_group: selected.account_group,
          reason: reason.trim(),
        })
        .abortSignal(controller.signal)
      if (result.error) throw new Error(result.error.message)
      if (controller.signal.aborted) return
      setSelected(null)
      setReason('')
      setNotice(
        'Account role updated. The user should sign out and back in to refresh their navigation.',
      )
      setRevision((value) => value + 1)
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to update the account. Refresh before retrying.',
        )
    } finally {
      if (!controller.signal.aborted) {
        mutation.current = null
        setSaving(false)
      }
    }
  }

  return (
    <section className="moderation-page page-width" aria-labelledby="users-title">
      <button className="back-button" type="button" disabled={saving} onClick={onBack}>
        Back to listings
      </button>
      <p className="eyebrow">ADMINISTRATION</p>
      <h1 id="users-title">Manage users</h1>
      <p>
        New accounts are regular users. Collaborators appear here after signing up with their RPI
        email.
      </p>
      <form className="moderation-toolbar" onSubmit={searchAccounts}>
        <label>
          Search accounts by email
          <input
            value={search}
            maxLength={200}
            disabled={saving}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="filter-button" disabled={saving} type="submit">
          Search accounts
        </button>
        <button
          className="filter-button"
          disabled={saving}
          type="button"
          onClick={() => {
            setSelected(null)
            setRevision((value) => value + 1)
          }}
        >
          Refresh accounts
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading accounts...</p>
      ) : accounts.length === 0 ? (
        <p>No accounts found.</p>
      ) : (
        <div className="moderation-list">
          {accounts.map((account) => (
            <article className="moderation-card" key={account.user_id}>
              <div>
                <h2>{account.email}</h2>
                <p>Role: {account.account_group === 'admin' ? 'Admin' : 'Regular user'}</p>
                {account.user_id === userId ? (
                  <p>Your account. Only the Supabase project owner can remove admin access.</p>
                ) : (
                  !account.eligible && <p>Account must be confirmed and active before promotion.</p>
                )}
                <button
                  className="filter-button"
                  type="button"
                  disabled={
                    saving ||
                    account.user_id === userId ||
                    !account.eligible ||
                    account.account_group === 'admin'
                  }
                  aria-label={`${account.account_group === 'admin' ? 'Admin role protected' : 'Make admin'} ${account.email}`}
                  onClick={() => {
                    setSelected(account)
                    setReason('')
                    setError('')
                    setNotice('')
                  }}
                >
                  {account.account_group === 'admin' ? 'Admin role protected' : 'Make admin'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="moderation-toolbar">
        <button
          className="filter-button"
          type="button"
          disabled={loading || saving || offset === 0}
          onClick={() => {
            setSelected(null)
            setOffset((value) => Math.max(0, value - 50))
          }}
        >
          Previous accounts
        </button>
        <button
          className="filter-button"
          type="button"
          disabled={loading || saving || !hasMore}
          onClick={() => {
            setSelected(null)
            setOffset((value) => value + 50)
          }}
        >
          Next accounts
        </button>
      </div>
      {selected && (
        <section className="moderation-review" aria-label="Confirm account role change">
          <h2>Make {selected.email} an admin?</h2>
          <p>
            Admins can moderate listings and promote regular users. Only the Supabase project owner
            can remove admin access. This change is recorded in the audit history.
          </p>
          <label>
            Reason for role change
            <textarea
              disabled={saving}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="moderation-toolbar">
            <button className="sell-button" disabled={saving} type="button" onClick={confirmChange}>
              {saving ? 'Saving role...' : 'Confirm role change'}
            </button>
            <button
              className="filter-button"
              disabled={saving}
              type="button"
              onClick={() => {
                setSelected(null)
                setError('')
              }}
            >
              Cancel role change
            </button>
          </div>
        </section>
      )}
    </section>
  )
}

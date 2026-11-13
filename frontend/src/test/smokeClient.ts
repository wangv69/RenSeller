// Local UI fixture only. Production builds never import this module.
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type Result = { data: Row[]; error: null }
type AuthListener = (event: string, session: Session | null) => void
const listeners = new Set<AuthListener>()
const student: User = {
  id: 'smoke-student',
  email: 'smoke@rpi.edu',
  aud: 'authenticated',
  created_at: '2026-01-01T12:00:00Z',
  app_metadata: { group: 'admin' },
  user_metadata: { username: 'smoke', full_name: 'Demo Student', dorm: 'Bray Hall' },
}
let account: Session | null
let tables: Record<string, Row[]>

function createSession(group = 'admin'): Session {
  return {
    access_token: 'local-smoke-token',
    refresh_token: 'local-smoke-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    user: { ...student, app_metadata: { group }, user_metadata: { ...student.user_metadata } },
  }
}

export function resetSmokeClient(group = 'admin') {
  listeners.clear()
  account = createSession(group)
  tables = {
    listings: [
      {
        id: 2,
        name: 'Demo desk lamp',
        price: 5.5,
        category: 'Electronics',
        condition: 'Good condition',
        seller_id: 'demo-seller',
        image_path: null,
        moderation_status: 'approved',
      },
      {
        id: 1,
        name: 'Demo calculus book',
        price: 12,
        category: 'Textbooks',
        condition: 'New',
        seller_id: 'demo-seller',
        image_path: null,
        moderation_status: 'approved',
      },
    ],
    messaging_members: [
      { id: 'demo-seller', full_name: 'Demo Seller' },
      { id: student.id, full_name: 'Demo Student' },
    ],
    direct_messages: [],
  }
}
resetSmokeClient()

function emit(event: string) {
  listeners.forEach((listener) => listener(event, account))
}

function query(table: string) {
  let filter: (row: Row) => boolean = () => true
  let inserted: Row | null = null
  let start = 0
  let end = Infinity
  function result(): Result {
    const rows = inserted ? [inserted] : (tables[table] ?? []).filter(filter).slice(start, end)
    return { data: rows, error: null }
  }
  const chain = {
    select: () => chain,
    order: () => chain,
    or: () => chain,
    abortSignal: () => chain,
    eq: (field: string, value: unknown) => {
      const previous = filter
      filter = (row) => previous(row) && row[field] === value
      return chain
    },
    neq: (field: string, value: unknown) => {
      const previous = filter
      filter = (row) => previous(row) && row[field] !== value
      return chain
    },
    in: (field: string, values: unknown[]) => {
      const previous = filter
      filter = (row) => previous(row) && values.includes(row[field])
      return chain
    },
    range: (first: number, last: number) => {
      start = first
      end = last + 1
      return chain
    },
    insert: (row: Row) => {
      inserted = {
        id: tables[table].length + 10,
        created_at: '2026-01-01T12:00:00Z',
        moderation_status: 'pending',
        ...row,
      }
      tables[table].push(inserted)
      return chain
    },
    single: async () => ({ data: result().data[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return chain
}

const client = {
  from: query,
  auth: {
    getSession: async () => ({ data: { session: account }, error: null }),
    getUser: async () => ({ data: { user: account?.user ?? null }, error: null }),
    onAuthStateChange: (listener: AuthListener) => {
      listeners.add(listener)
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }
    },
    signOut: async () => {
      account = null
      emit('SIGNED_OUT')
      return { error: null }
    },
    signInWithPassword: async () => {
      account = createSession()
      emit('SIGNED_IN')
      return { data: { session: account }, error: null }
    },
    signUp: async () => ({ data: { user: { identities: [{}] }, session: null }, error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async ({ email, data }: { email?: string; data?: Row }) => {
      if (account) {
        if (email) account.user.email = email
        Object.assign(account.user.user_metadata, data)
      }
      return { data: { user: account?.user }, error: null }
    },
  },
  storage: {
    from: () => ({
      getPublicUrl: () => ({
        data: {
          publicUrl:
            'data:image/svg+xml,' +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="#ece7e0"/></svg>',
            ),
        },
      }),
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
    }),
  },
  rpc: (_name: string, args: { listing_id: number; decision: string }) => {
    const listing = tables.listings.find((row) => row.id === args.listing_id)
    if (listing)
      listing.moderation_status = { approve: 'approved', reject: 'rejected', remove: 'removed' }[
        args.decision
      ]
    const result = {
      abortSignal: () => result,
      then: (resolve: (value: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return result
  },
  channel: () => {
    const channel = {
      on: () => channel,
      subscribe: (listener: (status: string) => void) => {
        queueMicrotask(() => listener('SUBSCRIBED'))
        return channel
      },
    }
    return channel
  },
  removeChannel: async () => 'ok',
}

// This fixture implements only the service calls exercised by UI smoke tests.
export const smokeClient = client as unknown as SupabaseClient
export const supabase = smokeClient

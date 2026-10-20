import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ configured: true })) }))
afterEach(() => vi.resetModules())

it('returns null when configuration is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')
  expect((await import('./supabase')).supabase).toBeNull()
})

it('creates the configured client', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test-key')
  const { createClient } = await import('@supabase/supabase-js')
  expect((await import('./supabase')).supabase).toEqual({ configured: true })
  expect(createClient).toHaveBeenCalledWith('https://example.test', 'public-test-key')
})

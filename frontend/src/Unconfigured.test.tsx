import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
import Auth from './Auth'
import Messages from './Messages'

vi.mock('./lib/supabase', () => ({ supabase: null }))

it('explains unavailable listings and hides selling without configuration', async () => {
  render(<App />)
  expect(await screen.findByText('Listings are unavailable. Supabase is not configured.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Sell an item/ })).not.toBeInTheDocument()
})
it('explains missing authentication configuration', () => {
  render(<Auth onProfileOpen={vi.fn()} onSessionChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
  expect(screen.getByRole('status')).toHaveTextContent('Add your Supabase variables')
})
it('explains unavailable messaging configuration', async () => {
  render(<Messages isOpen userId="test" onClose={vi.fn()} />)
  expect(await screen.findByText('Student directory is unavailable. Supabase is not configured.')).toBeInTheDocument()
})

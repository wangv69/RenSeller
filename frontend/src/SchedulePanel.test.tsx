import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import SchedulePanel from './SchedulePanel'
import { extractSchedule } from './lib/scheduleUpload'

vi.mock('./lib/scheduleUpload', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/scheduleUpload')>()), extractSchedule: vi.fn() }))
const extract = vi.mocked(extractSchedule)
beforeEach(() => { extract.mockReset() })

const toggle = () => screen.getByRole('button', { name: /Upload your schedule|Hide schedule upload/ })
async function saveCourses() {
  extract.mockResolvedValue([{ code: 'MATH-1010', title: 'Calculus I' }, { code: 'CSCI-1100', title: null }])
  fireEvent.click(toggle())
  fireEvent.change(screen.getByLabelText('Schedule file'), { target: { files: [new File(['x'], 's.png', { type: 'image/png' })] } })
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  await screen.findByText('MATH-1010')
  fireEvent.click(screen.getByRole('button', { name: 'Save courses' }))
}

it('starts closed and has no beta label', () => {
  render(<SchedulePanel accessToken="t" />)
  expect(screen.getByText('Textbooks for your classes')).toBeInTheDocument()
  expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByLabelText('Schedule file')).not.toBeInTheDocument()
})
it('opens and closes the upload', () => {
  render(<SchedulePanel accessToken="t" />)
  fireEvent.click(toggle())
  expect(screen.getByRole('button', { name: 'Hide schedule upload' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByLabelText('Schedule file')).toBeInTheDocument()
  fireEvent.click(toggle())
  expect(screen.queryByLabelText('Schedule file')).not.toBeInTheDocument()
})
it('reads the schedule with the sign-in token', async () => {
  render(<SchedulePanel accessToken="token-9" />)
  await saveCourses()
  expect(extract).toHaveBeenCalledWith(expect.any(File), 'token-9', expect.any(AbortSignal))
})
it('shows the confirmed courses, says they are not saved yet, and allows uploading again', async () => {
  render(<SchedulePanel accessToken="t" />)
  await saveCourses()
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('MATH-1010, CSCI-1100')
  expect(status).toHaveTextContent(/not saved/i)
  expect(screen.queryByLabelText('Schedule file')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Upload again' }))
  expect(screen.getByLabelText('Schedule file')).toBeInTheDocument()
})

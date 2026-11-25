import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ScheduleUpload from './ScheduleUpload'
import { ScheduleUploadError, extractSchedule } from './lib/scheduleUpload'

vi.mock('./lib/scheduleUpload', async (importOriginal) => ({ ...(await importOriginal<typeof import('./lib/scheduleUpload')>()), extractSchedule: vi.fn() }))
const extract = vi.mocked(extractSchedule)
const found = [{ code: 'MATH-1010', title: 'Calculus I' }, { code: 'CSCI-1100', title: null }]
const png = () => new File(['x'], 'schedule.png', { type: 'image/png' })
beforeEach(() => { extract.mockReset() })

function choose(file: File) { fireEvent.change(screen.getByLabelText('Schedule file'), { target: { files: [file] } }) }
async function readSchedule(result = found) {
  extract.mockResolvedValue(result)
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  await waitFor(() => expect(extract).toHaveBeenCalled())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Read my schedule' })).toBeEnabled())
}
function setup(props: Partial<React.ComponentProps<typeof ScheduleUpload>> = {}) {
  const onConfirm = vi.fn()
  render(<ScheduleUpload accessToken="token" onConfirm={onConfirm} {...props} />)
  return onConfirm
}

it('accepts only supported file types and says the file is not kept', () => {
  setup()
  expect(screen.getByLabelText('Schedule file')).toHaveAttribute('accept', 'application/pdf,image/png,image/jpeg,image/webp')
  expect(screen.getByText(/don't keep the file/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Read my schedule' })).toBeDisabled()
})
it.each([
  [new File(['x'], 'a.gif', { type: 'image/gif' }), /PDF, PNG, JPEG, or WebP/],
  [Object.defineProperty(new File(['x'], 'big.png', { type: 'image/png' }), 'size', { value: 5 * 1024 * 1024 + 1 }), /5 MB/],
])('rejects a bad file before reading it', (file, message) => {
  setup()
  choose(file)
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('button', { name: 'Read my schedule' })).toBeDisabled()
  expect(extract).not.toHaveBeenCalled()
})
it('treats cancelling the file chooser as no file', () => {
  setup()
  choose(png())
  fireEvent.change(screen.getByLabelText('Schedule file'), { target: { files: [] } })
  expect(screen.getByRole('button', { name: 'Read my schedule' })).toBeDisabled()
})
it('reads the chosen file and lists the courses found', async () => {
  setup()
  choose(png())
  await readSchedule()
  expect(extract).toHaveBeenCalledWith(expect.any(File), 'token', expect.any(AbortSignal))
  expect(screen.getByText('MATH-1010')).toBeInTheDocument()
  expect(screen.getByText('Calculus I')).toBeInTheDocument()
  expect(screen.getByText('CSCI-1100')).toBeInTheDocument()
})
it('shows a loading state and blocks a second request while reading', async () => {
  let finish: (value: typeof found) => void = () => {}
  extract.mockReturnValue(new Promise((resolve) => { finish = resolve }))
  setup()
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  expect(await screen.findByRole('button', { name: 'Reading…' })).toBeDisabled()
  finish(found)
  expect(await screen.findByText('MATH-1010')).toBeInTheDocument()
})
it('lets the student remove a wrongly read course and saves the rest', async () => {
  const onConfirm = setup()
  choose(png())
  await readSchedule()
  fireEvent.click(screen.getByRole('button', { name: 'Remove CSCI-1100' }))
  expect(screen.queryByText('CSCI-1100')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save courses' }))
  expect(onConfirm).toHaveBeenCalledWith([{ code: 'MATH-1010', title: 'Calculus I' }])
})
it('lets the student add a missed course in any common format', async () => {
  const onConfirm = setup()
  choose(png())
  await readSchedule()
  fireEvent.change(screen.getByLabelText('Add a course'), { target: { value: 'phys 1100' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add course' }))
  expect(screen.getByText('PHYS-1100')).toBeInTheDocument()
  expect(screen.getByLabelText('Add a course')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Save courses' }))
  expect(onConfirm).toHaveBeenCalledWith([...found, { code: 'PHYS-1100', title: null }])
})
it.each(['MATH 12', 'hello'])('rejects an invalid course code %j', async (value) => {
  setup()
  choose(png())
  await readSchedule()
  fireEvent.change(screen.getByLabelText('Add a course'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Add course' }))
  expect(screen.getByRole('alert')).toHaveTextContent('like MATH-1010')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})
it('ignores a course that is already listed', async () => {
  setup()
  choose(png())
  await readSchedule()
  fireEvent.change(screen.getByLabelText('Add a course'), { target: { value: 'math1010' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add course' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('invites the student to add courses by hand when none were found, and blocks saving an empty list', async () => {
  setup()
  choose(png())
  await readSchedule([])
  expect(screen.getByText(/couldn't find any courses/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save courses' })).toBeDisabled()
})
it('asks signed-out visitors to sign in without calling the service', () => {
  setup({ accessToken: null })
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Sign in')
  expect(extract).not.toHaveBeenCalled()
})
it('shows the service message on failure and lets the student retry', async () => {
  extract.mockRejectedValueOnce(new ScheduleUploadError('Try again tomorrow, or add your courses by hand.'))
  setup()
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('tomorrow')
  await readSchedule()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('uses a generic message for unexpected errors', async () => {
  extract.mockRejectedValue(new Error('boom: internal detail'))
  setup()
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('unavailable')
  expect(alert).not.toHaveTextContent('internal detail')
})
it('cancels the request when unmounted', async () => {
  let signal: AbortSignal | undefined
  extract.mockImplementation((_file, _token, s) => { signal = s; return new Promise(() => {}) })
  const view = render(<ScheduleUpload accessToken="t" onConfirm={vi.fn()} />)
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  await screen.findByRole('button', { name: 'Reading…' })
  view.unmount()
  expect(signal?.aborted).toBe(true)
})
it('does not report an aborted request as an error', async () => {
  extract.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
  setup()
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  await waitFor(() => expect(extract).toHaveBeenCalled())
  expect(await screen.findByRole('button', { name: 'Read my schedule' })).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('replaces the courses when a new schedule is read', async () => {
  setup()
  choose(png())
  await readSchedule()
  choose(new File(['y'], 'other.png', { type: 'image/png' }))
  await readSchedule([{ code: 'PHYS-1100', title: null }])
  expect(screen.getByText('PHYS-1100')).toBeInTheDocument()
  expect(screen.queryByText('MATH-1010')).not.toBeInTheDocument()
})
it('lets the student add courses by hand without reading a file', () => {
  const onConfirm = setup()
  expect(screen.getByRole('button', { name: 'Save courses' })).toBeDisabled()
  expect(screen.queryByText(/couldn't find any courses/i)).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Add a course'), { target: { value: 'math1010' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add course' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save courses' }))
  expect(onConfirm).toHaveBeenCalledWith([{ code: 'MATH-1010', title: null }])
})
it('keeps adding by hand available when reading fails', async () => {
  extract.mockRejectedValue(new ScheduleUploadError('Reading your schedule is unavailable right now. You can add your courses by hand.'))
  setup()
  choose(png())
  fireEvent.click(screen.getByRole('button', { name: 'Read my schedule' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('add your courses by hand')
  expect(screen.getByLabelText('Add a course')).toBeInTheDocument()
  expect(screen.queryByText(/couldn't find any courses/i)).not.toBeInTheDocument()
})

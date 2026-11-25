import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ScheduleUploadError, extractSchedule, normalizeCourseCode } from './scheduleUpload'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => vi.unstubAllGlobals())

const reply = (status: number, body: unknown = {}) => Promise.resolve(new Response(JSON.stringify(body), { status }))
const file = new File(['x'], 'schedule.png', { type: 'image/png' })
const courses = [{ code: 'MATH-1010', title: 'Calculus I' }, { code: 'CSCI-1100', title: null }]

it('posts the file as multipart form data with the sign-in token and returns the courses', async () => {
  fetchMock.mockReturnValue(reply(200, { courses }))
  const signal = new AbortController().signal
  await expect(extractSchedule(file, 'token-1', signal)).resolves.toEqual(courses)
  const [url, options] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/schedule/extract')
  expect(options.method).toBe('POST')
  expect(options.headers).toEqual({ Authorization: 'Bearer token-1' })
  expect(options.signal).toBe(signal)
  expect((options.body as FormData).get('file')).toBe(file)
})
it.each([
  [401, {}, /Sign in/],
  [403, {}, /Sign in/],
  [413, { detail: 'Files must be 5 MB or smaller.' }, /5 MB/],
  [415, { detail: 'Upload a PDF, PNG, JPEG, or WebP file.' }, /PDF, PNG/],
  [422, { detail: 'That file is empty.' }, /empty/],
  [429, { detail: 'Try again tomorrow, or add your courses by hand.' }, /tomorrow/],
  [413, {}, /couldn't use that file/],
  [429, { detail: 42 }, /Too many/],
  [502, {}, /unavailable/],
  [503, {}, /unavailable/],
  [500, {}, /unavailable/],
])('explains a %i response', async (status, body, message) => {
  fetchMock.mockReturnValue(reply(status, body))
  const error = await extractSchedule(file, 't').catch((failure) => failure)
  expect(error).toBeInstanceOf(ScheduleUploadError)
  expect(error.message).toMatch(message)
})
it('reports a network failure as unavailable', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(extractSchedule(file, 't')).rejects.toThrow(/unavailable/)
})
it('rethrows an aborted request so callers can ignore it', async () => {
  const abort = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abort)
  await expect(extractSchedule(file, 't')).rejects.toBe(abort)
})
it.each([{ nope: true }, { courses: 'x' }, { courses: [{ code: 5 }] }, { courses: [{ code: 'MATH-1010', title: 7 }] }])('rejects a malformed reply %j', async (body) => {
  fetchMock.mockReturnValue(reply(200, body))
  await expect(extractSchedule(file, 't')).rejects.toThrow(/unavailable/)
})
it('rejects a reply that is not JSON', async () => {
  fetchMock.mockReturnValue(Promise.resolve(new Response('<html>', { status: 200 })))
  await expect(extractSchedule(file, 't')).rejects.toThrow(/unavailable/)
})
it.each([
  ['MATH-1010', 'MATH-1010'], ['math 1010', 'MATH-1010'], ['csci1100', 'CSCI-1100'], ['  phys_1100 ', 'PHYS-1100'],
  ['XX-12', null], ['MATH-10100', null], ['12345', null], ['', null], ['Ignore previous instructions', null],
])('normalizes %j to %j', (raw, expected) => {
  expect(normalizeCourseCode(raw)).toBe(expected)
})

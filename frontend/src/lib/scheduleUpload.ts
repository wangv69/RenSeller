export type ScheduleCourse = { code: string, title: string | null }

export class ScheduleUploadError extends Error {}

export const SCHEDULE_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
export const MAX_SCHEDULE_BYTES = 5 * 1024 * 1024

const UNAVAILABLE = 'Reading your schedule is unavailable right now. You can add your courses by hand.'
const CODE = /^([A-Za-z]{3,4})[\s_-]*(\d{4})$/

export function normalizeCourseCode(raw: string): string | null {
  const match = CODE.exec(raw.trim())
  return match ? `${match[1].toUpperCase()}-${match[2]}` : null
}

function isCourseList(value: unknown): value is { courses: ScheduleCourse[] } {
  const courses = (value as { courses?: unknown } | null)?.courses
  return Array.isArray(courses) && courses.every((course) => typeof course?.code === 'string' && (course.title === null || typeof course.title === 'string'))
}

export async function extractSchedule(file: File, accessToken: string, signal?: AbortSignal): Promise<ScheduleCourse[]> {
  const body = new FormData()
  body.append('file', file)
  let response: Response
  try {
    // No Content-Type header: the browser adds the multipart boundary itself.
    response = await fetch('/api/schedule/extract', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ScheduleUploadError(UNAVAILABLE)
  }

  if (response.status === 401 || response.status === 403) throw new ScheduleUploadError('Sign in with your RPI account to read your schedule.')
  if ([413, 415, 422, 429].includes(response.status)) {
    const detail = ((await response.json().catch(() => null)) as { detail?: unknown } | null)?.detail
    const fallback = response.status === 429 ? 'Too many schedule readings today. Try again tomorrow.' : "We couldn't use that file."
    throw new ScheduleUploadError(typeof detail === 'string' ? detail : fallback)
  }
  if (!response.ok) throw new ScheduleUploadError(UNAVAILABLE)

  const reply: unknown = await response.json().catch(() => null)
  if (!isCourseList(reply)) throw new ScheduleUploadError(UNAVAILABLE)
  return reply.courses
}

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { MAX_SCHEDULE_BYTES, SCHEDULE_FILE_TYPES, ScheduleUploadError, extractSchedule, normalizeCourseCode, type ScheduleCourse } from './lib/scheduleUpload'

type Props = { accessToken: string | null, onConfirm: (courses: ScheduleCourse[]) => void }

export default function ScheduleUpload({ accessToken, onConfirm }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [courses, setCourses] = useState<ScheduleCourse[]>([])
  const [foundNone, setFoundNone] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null
    setFoundNone(false)
    setError(null)
    if (chosen && !SCHEDULE_FILE_TYPES.includes(chosen.type)) {
      setFile(null)
      setError('Upload a PDF, PNG, JPEG, or WebP file.')
    } else if (chosen && chosen.size > MAX_SCHEDULE_BYTES) {
      setFile(null)
      setError('Files must be 5 MB or smaller.')
    } else {
      setFile(chosen)
    }
  }

  async function read() {
    if (!file) return
    if (!accessToken) {
      setError('Sign in with your RPI account to read your schedule.')
      return
    }
    const request = new AbortController()
    controller.current = request
    setError(null)
    setLoading(true)
    try {
      const found = await extractSchedule(file, accessToken, request.signal)
      setCourses(found)
      setFoundNone(found.length === 0)
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) {
        setError(failure instanceof ScheduleUploadError ? failure.message : 'Reading your schedule is unavailable right now. You can add your courses by hand.')
      }
    } finally {
      if (!request.signal.aborted) setLoading(false)
    }
  }

  function addCourse() {
    const code = normalizeCourseCode(draft)
    if (!code) {
      setError('Enter a course code like MATH-1010.')
      return
    }
    setError(null)
    setDraft('')
    setCourses((current) => current.some((course) => course.code === code) ? current : [...current, { code, title: null }])
  }

  return (
    <div className="schedule-upload">
      <label>Schedule file
        <input type="file" accept={SCHEDULE_FILE_TYPES.join(',')} onChange={chooseFile} />
      </label>
      <p className="modal-copy">We read your schedule to find course codes and don't keep the file.</p>
      <button className="sell-button" type="button" onClick={read} disabled={!file || loading}>
        {loading ? 'Reading…' : 'Read my schedule'}
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="schedule-review">
        {foundNone && <p>We couldn't find any courses in that file. Add them below.</p>}
        <ul>
          {courses.map((course) => (
            <li key={course.code}>
              <strong>{course.code}</strong> {course.title && <span>{course.title}</span>}
              <button className="text-button" type="button" aria-label={`Remove ${course.code}`} onClick={() => setCourses(courses.filter((item) => item.code !== course.code))}>Remove</button>
            </li>
          ))}
        </ul>
        <label>Add a course
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="e.g. MATH-1010" />
        </label>
        <button className="cancel-button" type="button" onClick={addCourse}>Add course</button>
        <button className="sell-button" type="button" onClick={() => onConfirm(courses)} disabled={courses.length === 0}>Save courses</button>
      </div>
    </div>
  )
}

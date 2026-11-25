import { useState } from 'react'
import ScheduleUpload from './ScheduleUpload'
import type { ScheduleCourse } from './lib/scheduleUpload'

type Props = { accessToken: string | null }

export default function SchedulePanel({ accessToken }: Props) {
  const [open, setOpen] = useState(false)
  const [courses, setCourses] = useState<ScheduleCourse[] | null>(null)

  function confirm(confirmed: ScheduleCourse[]) {
    setCourses(confirmed)
    setOpen(false)
  }

  return (
    <section className="schedule-panel page-width" aria-label="Schedule upload">
      <p className="eyebrow">Textbooks for your classes</p>
      <button className="text-button" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {open ? 'Hide schedule upload' : 'Upload your schedule'}
      </button>
      {open && <ScheduleUpload accessToken={accessToken} onConfirm={confirm} />}
      {courses && !open && (
        <div role="status">
          <span>Your courses this visit: {courses.map((course) => course.code).join(', ')}. They're not saved yet.</span>
          <button className="text-button" type="button" onClick={() => setOpen(true)}>Upload again</button>
        </div>
      )}
    </section>
  )
}

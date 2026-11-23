/**
 * Trackit Date Utilities
 *
 * All dates from the backend API are plain YYYY-MM-DD strings.
 * We NEVER use new Date("YYYY-MM-DD") because JavaScript parses ISO date-only strings as UTC,
 * causing off-by-one errors in Western timezones.
 *
 * These helpers parse date components directly and construct local dates or format them safely.
 */

export interface ParsedYmd {
  year: number
  month: number
  day: number
}

/**
 * Split a YYYY-MM-DD string into numeric components without timezone shifts.
 */
export function parseYmd(ymd: string): ParsedYmd | null {
  if (!ymd || typeof ymd !== 'string') return null
  const parts = ymd.split('-')
  if (parts.length !== 3) return null
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  return { year, month, day }
}

/**
 * Convert a YYYY-MM-DD string into a local Date object.
 */
export function ymdToLocalDate(ymd: string): Date | null {
  const parsed = parseYmd(ymd)
  if (!parsed) return null
  return new Date(parsed.year, parsed.month - 1, parsed.day)
}

/**
 * Format a YYYY-MM-DD string for display (e.g. "Jun 16, 2026").
 */
export function formatYmd(
  ymd: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!ymd) return ''
  const date = ymdToLocalDate(ymd)
  if (!date) return ymd
  return date.toLocaleDateString('en-US', options)
}

/**
 * Add or subtract days from a YYYY-MM-DD string, returning a new YYYY-MM-DD string.
 */
export function addDaysToYmd(ymd: string, days: number): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  const next = new Date(parsed.year, parsed.month - 1, parsed.day + days)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Calculate track end date from start date and duration days.
 * Since duration includes the start day, end date is start_date + (duration_days - 1).
 */
export function calculateEndDate(startYmd: string, durationDays: number): string {
  if (!startYmd || durationDays <= 0) return startYmd
  return addDaysToYmd(startYmd, Math.max(0, durationDays - 1))
}

/**
 * Get current date (YYYY-MM-DD) in a specific IANA timezone (or UTC).
 */
export function getTodayInTimezone(timezone?: string): string {
  const tz = timezone || 'UTC'
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    // Fallback if timezone string is invalid
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

/**
 * Get tomorrow's date (YYYY-MM-DD) in a specific IANA timezone.
 */
export function getTomorrowInTimezone(timezone?: string): string {
  const today = getTodayInTimezone(timezone)
  return addDaysToYmd(today, 1)
}

/**
 * Format track status in a readable label:
 * - upcoming: "Starts <date>"
 * - active: "Active"
 * - expired: "Expired"
 */
export function formatTrackStatus(
  status: 'upcoming' | 'active' | 'expired' | string,
  startDate?: string | null
): string {
  if (status === 'upcoming') {
    return startDate ? `Starts ${formatYmd(startDate)}` : 'Upcoming'
  }
  if (status === 'active') {
    return 'Active'
  }
  if (status === 'expired') {
    return 'Expired'
  }
  return status
}

/**
 * Check whether a date is within the loggable window:
 * from track start_date to min(today, end_date),
 * where today is in the user's timezone.
 */
export function checkDateLoggable(
  date: string,
  startDate: string,
  endDate: string,
  userTimezone?: string
): { loggable: boolean; reason?: string } {
  const today = getTodayInTimezone(userTimezone)
  if (date < startDate) {
    return { loggable: false, reason: 'This date is before the track started.' }
  }
  if (date > today) {
    return { loggable: false, reason: 'Future dates cannot be logged in advance.' }
  }
  if (date > endDate) {
    return { loggable: false, reason: 'This date is after the track ended.' }
  }
  return { loggable: true }
}

/**
 * Format day status into readable labels and colors:
 * completed, partial, missed, upcoming, pending, no_activities
 */
export function formatDayStatus(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case 'completed':
      return {
        label: 'Completed',
        color: 'var(--status-completed)',
        bg: 'color-mix(in srgb, var(--status-completed) 15%, transparent)',
      }
    case 'partial':
      return {
        label: 'Partial',
        color: 'var(--status-partial)',
        bg: 'color-mix(in srgb, var(--status-partial) 15%, transparent)',
      }
    case 'missed':
      return {
        label: 'Missed',
        color: 'var(--status-missed)',
        bg: 'color-mix(in srgb, var(--status-missed) 15%, transparent)',
      }
    case 'pending':
      return {
        label: 'Pending',
        color: 'var(--status-pending)',
        bg: 'color-mix(in srgb, var(--status-pending) 15%, transparent)',
      }
    case 'upcoming':
      return {
        label: 'Upcoming',
        color: 'var(--status-upcoming)',
        bg: 'color-mix(in srgb, var(--status-upcoming) 15%, transparent)',
      }
    case 'no_activities':
      return {
        label: 'No activities',
        color: 'var(--status-upcoming)',
        bg: 'color-mix(in srgb, var(--status-upcoming) 15%, transparent)',
      }
    default:
      return {
        label: status || 'Unknown',
        color: 'var(--status-upcoming)',
        bg: 'color-mix(in srgb, var(--status-upcoming) 15%, transparent)',
      }
  }
}

export interface TrackMonthInfo {
  year: number
  month: number
  key: string // e.g. "2026-06"
  label: string // e.g. "June 2026"
}

/**
 * Returns all month intervals spanned by a track (from start_date to end_date).
 * Used for Month Grid Calendar navigation.
 */
export function getTrackMonths(startDate: string, endDate: string): TrackMonthInfo[] {
  const start = parseYmd(startDate)
  const end = parseYmd(endDate)
  if (!start || !end) return []

  const months: TrackMonthInfo[] = []
  let y = start.year
  let m = start.month

  while (y < end.year || (y === end.year && m <= end.month)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    const labelDate = new Date(y, m - 1, 1)
    const label = labelDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    months.push({ year: y, month: m, key, label })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

/**
 * Returns the number of days in a given year and month (1-12).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Returns the day of the week for the 1st of a given month (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay()
}

/**
 * Formats a year and month into "Month Year" (e.g. "June 2026").
 */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Pure calculation of day-of-week for a YYYY-MM-DD string without calling Date().
 * Returns 0 = Sunday, 1 = Monday, ..., 6 = Saturday (matching Date.prototype.getDay).
 */
export function getDayOfWeekFromYmd(ymd: string): number {
  const parsed = parseYmd(ymd)
  if (!parsed) return 0
  const { year, month, day } = parsed
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const y = month < 3 ? year - 1 : year
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7
}

/**
 * Return a time-of-day greeting (Good morning, Good afternoon, Good evening)
 * based on the user's timezone.
 */
export function getGreeting(timezone?: string): string {
  try {
    const tz = timezone || 'UTC'
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(new Date())
    const hour = parseInt(hourStr, 10)
    if (hour >= 5 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 18) return 'Good afternoon'
    return 'Good evening'
  } catch {
    const localHour = new Date().getHours()
    if (localHour >= 5 && localHour < 12) return 'Good morning'
    if (localHour >= 12 && localHour < 18) return 'Good afternoon'
    return 'Good evening'
  }
}



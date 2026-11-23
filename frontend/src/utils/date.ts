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
      return { label: 'Completed', color: '#4ADE80', bg: 'rgba(74, 222, 128, 0.12)' }
    case 'partial':
      return { label: 'Partial', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.12)' }
    case 'missed':
      return { label: 'Missed', color: '#F87171', bg: 'rgba(248, 113, 113, 0.12)' }
    case 'pending':
      return { label: 'Pending', color: '#FCD34D', bg: 'rgba(252, 211, 77, 0.12)' }
    case 'upcoming':
      return { label: 'Upcoming', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' }
    case 'no_activities':
      return { label: 'No activities', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' }
    default:
      return { label: status || 'Unknown', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' }
  }
}

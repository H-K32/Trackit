import { client } from './client.ts'
import type { TrackingType } from './activities.ts'

export interface DailyLogOverviewEntry {
  activity_id: number
  name: string
  description: string | null
  tracking_type: TrackingType
  daily_target: number
  unit: string | null
  is_required: boolean
  log_id: number | null
  log_date: string | null
  actual_value: number | null
  is_completed: boolean | null
  target_met: boolean
  progress_percentage: number
}

export interface DailyLogItem {
  id: number
  activity_id: number
  log_date: string
  daily_target: number
  unit: string | null
  notes: string | null
  actual_value: number | null
  is_completed: boolean | null
  target_met: boolean
  progress_percentage: number
  created_at: string
  updated_at: string
}

export interface UpsertLogPayload {
  value?: number
  is_completed?: boolean
  notes?: string | null
}

export interface CalendarDayActivity {
  activity_id: number
  name: string
  tracking_type: TrackingType
  unit: string | null
  target: number
  percentage: number
  value?: number
  is_completed?: boolean
}

export interface CalendarDayItem {
  day_number: number
  date: string
  day_status: 'completed' | 'partial' | 'missed' | 'upcoming' | 'pending' | 'no_activities' | string
  completion_percentage: number
  activities: CalendarDayActivity[]
}

export interface TrackCalendarResponse {
  track: {
    id: number
    name: string
    start_date: string
    end_date: string
    status: string
    total_days: number
    today: string | null
  }
  days: CalendarDayItem[]
}

/**
 * GET /api/tracks/{track}/daily-logs?date=YYYY-MM-DD
 * Returns overview entries for all activities on the given date.
 */
export async function getDailyLogsOverview(
  trackId: number | string,
  date: string
): Promise<DailyLogOverviewEntry[]> {
  return client.get<DailyLogOverviewEntry[]>(`/tracks/${trackId}/daily-logs`, {
    params: { date },
  })
}

/**
 * GET /api/tracks/{track}/activities/{activity}/logs/{date}
 * Returns single log for activity on date.
 */
export async function getDailyLog(
  trackId: number | string,
  activityId: number | string,
  date: string
): Promise<DailyLogItem> {
  return client.get<DailyLogItem>(
    `/tracks/${trackId}/activities/${activityId}/logs/${date}`
  )
}

/**
 * PUT /api/tracks/{track}/activities/{activity}/logs/{date}
 * Upserts a daily log for the given activity and date.
 */
export async function upsertDailyLog(
  trackId: number | string,
  activityId: number | string,
  date: string,
  payload: UpsertLogPayload
): Promise<DailyLogItem> {
  return client.put<DailyLogItem>(
    `/tracks/${trackId}/activities/${activityId}/logs/${date}`,
    payload
  )
}

/**
 * DELETE /api/tracks/{track}/activities/{activity}/logs/{date}
 * Deletes the log for that activity and date (expect 204 No Content).
 */
export async function deleteDailyLog(
  trackId: number | string,
  activityId: number | string,
  date: string
): Promise<void> {
  return client.delete<void>(
    `/tracks/${trackId}/activities/${activityId}/logs/${date}`
  )
}

/**
 * GET /api/tracks/{track}/calendar
 * Returns track calendar days with statuses and completion percentages.
 */
export async function getTrackCalendar(
  trackId: number | string
): Promise<TrackCalendarResponse> {
  return client.get<TrackCalendarResponse>(`/tracks/${trackId}/calendar`)
}

/**
 * GET /api/tracks/{track}/activities/{activity}/logs?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns activity log history for date range.
 */
export async function getActivityLogsHistory(
  trackId: number | string,
  activityId: number | string,
  from: string,
  to: string
): Promise<DailyLogItem[]> {
  return client.get<DailyLogItem[]>(
    `/tracks/${trackId}/activities/${activityId}/logs`,
    { params: { from, to } }
  )
}

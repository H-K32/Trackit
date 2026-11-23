import { client } from './client.ts'

export type TrackingType = 'count' | 'duration' | 'checkbox'

export interface ActivityTemplate {
  key: string
  name: string
  description: string
  tracking_type: TrackingType
  daily_target: number
  unit: string | null
}

export interface ActivityItem {
  id: number
  track_id: number
  name: string
  description: string | null
  tracking_type: TrackingType
  daily_target: number
  unit: string | null
  is_required: boolean
  created_at: string
  updated_at: string
}

export interface CreateActivityPayload {
  name: string
  description?: string | null
  tracking_type: TrackingType
  daily_target: number
  unit?: string | null
  is_required: boolean
}

export interface UpdateActivityPayload {
  name?: string
  description?: string | null
  tracking_type?: TrackingType
  daily_target?: number
  unit?: string | null
  is_required?: boolean
}

/**
 * Format activity target into readable text:
 * - count: "<daily_target> <unit>/day" (e.g. "5 puzzles/day")
 * - duration: "<daily_target> min/day" (always minutes)
 * - checkbox: "Once a day"
 */
export function formatActivityTarget(activity: {
  tracking_type: TrackingType | string
  daily_target: number
  unit?: string | null
}): string {
  if (activity.tracking_type === 'checkbox') {
    return 'Once a day'
  }
  if (activity.tracking_type === 'duration') {
    return `${activity.daily_target} min/day`
  }
  return `${activity.daily_target} ${activity.unit || 'units'}/day`
}

/**
 * GET /api/activity-templates
 * Fetches built-in activity templates.
 */
export async function getActivityTemplates(): Promise<ActivityTemplate[]> {
  return client.get<ActivityTemplate[]>('/activity-templates')
}

/**
 * GET /api/tracks/{track}/activities
 * Lists all activities for a track.
 */
export async function getActivities(trackId: number | string): Promise<ActivityItem[]> {
  return client.get<ActivityItem[]>(`/tracks/${trackId}/activities`)
}

/**
 * GET /api/tracks/{track}/activities/{activity}
 * Fetches single activity details.
 */
export async function getActivity(
  trackId: number | string,
  activityId: number | string
): Promise<ActivityItem> {
  return client.get<ActivityItem>(`/tracks/${trackId}/activities/${activityId}`)
}

/**
 * POST /api/tracks/{track}/activities
 * Creates a new activity on an upcoming track.
 */
export async function createActivity(
  trackId: number | string,
  payload: CreateActivityPayload
): Promise<ActivityItem> {
  return client.post<ActivityItem>(`/tracks/${trackId}/activities`, payload)
}

/**
 * PATCH /api/tracks/{track}/activities/{activity}
 * Updates activity details.
 */
export async function updateActivity(
  trackId: number | string,
  activityId: number | string,
  payload: UpdateActivityPayload
): Promise<ActivityItem> {
  return client.patch<ActivityItem>(`/tracks/${trackId}/activities/${activityId}`, payload)
}

/**
 * DELETE /api/tracks/{track}/activities/{activity}
 * Deletes an activity from an upcoming track.
 */
export async function deleteActivity(
  trackId: number | string,
  activityId: number | string
): Promise<void> {
  return client.delete<void>(`/tracks/${trackId}/activities/${activityId}`)
}

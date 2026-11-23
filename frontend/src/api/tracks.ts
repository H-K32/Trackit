import { client } from './client.ts'

export type TrackStatus = 'upcoming' | 'active' | 'expired'

export interface TrackProgressToday {
  date: string
  day_status: 'none' | 'partial' | 'completed' | string
  completion_percentage: number
}

export interface TrackProgressSummary {
  overall_percentage: number
  challenge_progress: number
  completed_days: number
  elapsed_days: number
  total_days: number
  days_remaining: number
  today: TrackProgressToday | null
}

export interface TrackMilestone {
  threshold: number
  reached: boolean
  reached_on: string | null
}

export interface TrackProgressDetail extends TrackProgressSummary {
  track_id: number
  status: TrackStatus
  milestones: TrackMilestone[]
  schedule_percentage?: number
  today: (TrackProgressToday & { activities?: unknown[] }) | null
  activities_summary?: unknown[]
}

export interface TrackItem {
  id: number
  user_id: number
  name: string
  description: string | null
  start_date: string
  end_date: string
  duration_days: number
  status: TrackStatus
  created_at: string
  updated_at: string
  progress?: TrackProgressSummary
}

export interface CreateTrackPayload {
  name: string
  description?: string | null
  start_date: string
  duration_days: number
}

export interface UpdateTrackPayload {
  name?: string
  description?: string | null
  start_date?: string
  duration_days?: number
}

/**
 * GET /api/tracks
 * Optional include=progress parameter attaches compact progress summary.
 */
export async function getTracks(includeProgress = true): Promise<TrackItem[]> {
  return client.get<TrackItem[]>('/tracks', {
    params: includeProgress ? { include: 'progress' } : undefined,
  })
}

/**
 * POST /api/tracks
 * Creates a new track with start_date tomorrow or later.
 */
export async function createTrack(payload: CreateTrackPayload): Promise<TrackItem> {
  return client.post<TrackItem>('/tracks', payload)
}

/**
 * GET /api/tracks/{track}
 * Fetches single track details.
 */
export async function getTrack(trackId: number | string): Promise<TrackItem> {
  return client.get<TrackItem>(`/tracks/${trackId}`)
}

/**
 * GET /api/tracks/{track}/progress
 * Fetches full track progress and milestones.
 */
export async function getTrackProgress(trackId: number | string): Promise<TrackProgressDetail> {
  return client.get<TrackProgressDetail>(`/tracks/${trackId}/progress`)
}

/**
 * PATCH /api/tracks/{track}
 * Updates track fields. Only send fields that changed.
 */
export async function updateTrack(
  trackId: number | string,
  payload: UpdateTrackPayload
): Promise<TrackItem> {
  return client.patch<TrackItem>(`/tracks/${trackId}`, payload)
}

/**
 * DELETE /api/tracks/{track}
 * Deletes a track, its activities, and daily logs. Returns 204 No Content.
 */
export async function deleteTrack(trackId: number | string): Promise<void> {
  return client.delete<void>(`/tracks/${trackId}`)
}

import { client } from './client.ts'
import type { TrackingType } from './activities.ts'

export interface WeeklyBreakdownItem {
  week: number
  percentage: number
}

export interface ActivityPerformanceItem {
  activity_id: number
  name: string
  tracking_type: TrackingType
  unit: string | null
  daily_target: number
  is_required: boolean
  days_completed: number
  total_logged: number
  average_daily_percentage: number
}

export type AnalyticsTrend = 'insufficient_data' | 'improving' | 'declining' | 'stable'

export interface TrackAnalytics {
  track_id: number
  status: 'upcoming' | 'active' | 'expired'
  overall_completion: number
  weekly_breakdown: WeeklyBreakdownItem[]
  activities_performance: ActivityPerformanceItem[]
  trend: AnalyticsTrend
}

/**
 * GET /api/tracks/{track}/analytics
 * Fetches analytics including weekly breakdown, activity performance, and trend.
 */
export async function getTrackAnalytics(trackId: number | string): Promise<TrackAnalytics> {
  return client.get<TrackAnalytics>(`/tracks/${trackId}/analytics`)
}

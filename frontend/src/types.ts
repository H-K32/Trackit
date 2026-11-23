export type TrackingType = 'numeric' | 'checkbox'

export type ActivityTemplate =
  | 'Chess Games' | 'Chess Puzzles' | 'Opening Study'
  | 'Endgame Study' | 'Game Analysis' | 'Chess Reading' | 'Chess Lessons' | 'Custom'

export interface DailyRecord {
  date: string
  value: number
  completed: boolean
  wins?: number
  losses?: number
  draws?: number
  notes?: string
  duration?: number
  opening?: string
  gamesReviewed?: number
  mistakes?: number
}

export interface Activity {
  id: string
  trackId: string
  name: string
  description: string
  template: ActivityTemplate
  trackingType: TrackingType
  unit: string
  dailyTarget: number
  required: boolean
  notes?: string
  records: DailyRecord[]
}

export interface Track {
  id: string
  name: string
  description: string
  category: 'Chess'
  startDate: string
  durationDays: number
  status: 'In Progress' | 'Completed' | 'Not Started'
  activities: Activity[]
}

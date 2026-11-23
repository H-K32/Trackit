import { formatYmd, addDaysToYmd } from './utils/date.ts'

export * from './utils/date.ts'

export const formatDate = (date: string) => formatYmd(date)
export const addDays = (date: string, days: number) => formatYmd(addDaysToYmd(date, days))

export const activityProgress = (activity: {
  dailyTarget: number
  records: { date: string; value: number; completed: boolean }[]
}) => {
  const latest = activity.records.at(-1)
  if (!latest) return 0
  return Math.min(100, Math.round((latest.value / activity.dailyTarget) * 100))
}

export const trackProgress = (activities: { dailyTarget: number; records: { value: number }[] }[]) => {
  if (!activities.length) return 0
  const total = activities.reduce((s, a) => s + activityProgress(a as never), 0)
  return Math.round(total / activities.length)
}

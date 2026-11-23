import { useState, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  RotateCcw,
} from 'lucide-react'
import {
  getDailyLogsOverview,
  upsertDailyLog,
  deleteDailyLog,
} from '../../api/dailyLogs.ts'
import type { DailyLogOverviewEntry, CalendarDayItem } from '../../api/dailyLogs.ts'
import type { TrackItem } from '../../api/tracks.ts'
import type { ApiError } from '../../api/client.ts'
import {
  formatYmd,
  addDaysToYmd,
  getTodayInTimezone,
  checkDateLoggable,
  formatDayStatus,
} from '../../utils/date.ts'

interface DailyLogsSectionProps {
  track: TrackItem
  userTimezone?: string
  calendarDays: CalendarDayItem[]
  onStatsUpdated: () => void
  onScrollToActivities?: () => void
  selectedDate?: string
  onSelectDate?: (date: string) => void
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error'

interface RowState {
  status: RowStatus
  errorMessage?: string
}

export function DailyLogsSection({
  track,
  userTimezone,
  calendarDays,
  onStatsUpdated,
  onScrollToActivities,
  selectedDate: externalSelectedDate,
  onSelectDate,
}: DailyLogsSectionProps) {
  const today = getTodayInTimezone(userTimezone)

  // Compute initial selected date
  const computeInitialDate = () => {
    if (today >= track.start_date && today <= track.end_date) {
      return today
    }
    if (today < track.start_date) {
      return track.start_date
    }
    return track.end_date
  }

  const [internalSelectedDate, setInternalSelectedDate] = useState<string>(computeInitialDate)
  const selectedDate = externalSelectedDate !== undefined ? externalSelectedDate : internalSelectedDate

  const updateSelectedDate = (newDate: string) => {
    if (onSelectDate) {
      onSelectDate(newDate)
    } else {
      setInternalSelectedDate(newDate)
    }
  }

  const [overview, setOverview] = useState<DailyLogOverviewEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Local input values keyed by activity_id
  const [localValues, setLocalValues] = useState<Record<number, string>>({})
  // Row statuses and errors keyed by activity_id
  const [rowStates, setRowStates] = useState<Record<number, RowState>>({})

  // Track latest request timestamp per activity to avoid race conditions
  const saveSeqRef = useRef<Record<string, number>>({})

  // Day loggable check
  const loggableCheck = checkDateLoggable(
    selectedDate,
    track.start_date,
    track.end_date,
    userTimezone
  )

  // Find day summary from calendarDays
  const daySummary = calendarDays.find((d) => d.date === selectedDate)
  const dayStatusKey = daySummary?.day_status || (loggableCheck.loggable ? 'pending' : 'upcoming')
  const completionPct = daySummary?.completion_percentage ?? 0
  const statusInfo = formatDayStatus(dayStatusKey)

  // Refetch helper after saving or on retry
  const loadOverview = (dateToLoad: string) => {
    setLoading(true)
    setFetchError(null)

    getDailyLogsOverview(track.id, dateToLoad)
      .then((data) => {
        setOverview(data)
        const initialMap: Record<number, string> = {}
        data.forEach((entry) => {
          if (entry.tracking_type === 'checkbox') {
            initialMap[entry.activity_id] = entry.is_completed ? 'true' : 'false'
          } else {
            initialMap[entry.activity_id] =
              entry.actual_value !== null ? String(entry.actual_value) : ''
          }
        })
        setLocalValues(initialMap)
        setRowStates({})
        setLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        setFetchError(apiErr.message || 'Failed to load day logs.')
        setLoading(false)
      })
  }

  useEffect(() => {
    let ignore = false
    getDailyLogsOverview(track.id, selectedDate)
      .then((data) => {
        if (!ignore) {
          setOverview(data)
          const initialMap: Record<number, string> = {}
          data.forEach((entry) => {
            if (entry.tracking_type === 'checkbox') {
              initialMap[entry.activity_id] = entry.is_completed ? 'true' : 'false'
            } else {
              initialMap[entry.activity_id] =
                entry.actual_value !== null ? String(entry.actual_value) : ''
            }
          })
          setLocalValues(initialMap)
          setRowStates({})
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          setFetchError(apiErr.message || 'Failed to load day logs.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [track.id, selectedDate])

  // Navigation handlers
  const handlePrevDay = () => {
    const prev = addDaysToYmd(selectedDate, -1)
    if (prev >= track.start_date) {
      updateSelectedDate(prev)
    }
  }

  const handleNextDay = () => {
    const next = addDaysToYmd(selectedDate, 1)
    if (next <= track.end_date) {
      updateSelectedDate(next)
    }
  }

  const handleGoToday = () => {
    if (today >= track.start_date && today <= track.end_date) {
      updateSelectedDate(today)
    }
  }

  // Handle local text changes
  const handleValueChange = (activityId: number, val: string) => {
    setLocalValues((prev) => ({ ...prev, [activityId]: val }))
    // Clear any previous error on input edit
    setRowStates((prev) => ({
      ...prev,
      [activityId]: { status: 'idle', errorMessage: undefined },
    }))
  }

  // Save or delete a log entry on blur / Enter
  const saveEntry = async (entry: DailyLogOverviewEntry, customValue?: string) => {
    if (!loggableCheck.loggable) return

    const targetDate = selectedDate // Capture target date in closure
    const actId = entry.activity_id
    const valueStr = customValue !== undefined ? customValue : (localValues[actId] ?? '')

    const reqKey = `${actId}_${targetDate}`
    const currentSeq = (saveSeqRef.current[reqKey] || 0) + 1
    saveSeqRef.current[reqKey] = currentSeq

    // 1. Checkbox metric
    if (entry.tracking_type === 'checkbox') {
      const isChecked = valueStr === 'true'

      // If user unchecked and a log existed, delete it
      if (!isChecked) {
        if (entry.log_id) {
          setRowStates((prev) => ({ ...prev, [actId]: { status: 'saving' } }))
          try {
            await deleteDailyLog(track.id, actId, targetDate)
            if (saveSeqRef.current[reqKey] === currentSeq) {
              setRowStates((prev) => ({ ...prev, [actId]: { status: 'saved' } }))
              onStatsUpdated()
              loadOverview(targetDate)
            }
          } catch (err: unknown) {
            const apiErr = err as ApiError
            if (saveSeqRef.current[reqKey] === currentSeq) {
              setRowStates((prev) => ({
                ...prev,
                [actId]: { status: 'error', errorMessage: apiErr.message || 'Failed to remove log' },
              }))
            }
          }
        }
        return
      }

      // If checked, upsert
      setRowStates((prev) => ({ ...prev, [actId]: { status: 'saving' } }))
      try {
        await upsertDailyLog(track.id, actId, targetDate, { is_completed: true })
        if (saveSeqRef.current[reqKey] === currentSeq) {
          setRowStates((prev) => ({ ...prev, [actId]: { status: 'saved' } }))
          onStatsUpdated()
          loadOverview(targetDate)
        }
      } catch (err: unknown) {
        const apiErr = err as ApiError
        if (saveSeqRef.current[reqKey] === currentSeq) {
          setRowStates((prev) => ({
            ...prev,
            [actId]: {
              status: 'error',
              errorMessage: apiErr.errors?.is_completed?.[0] || apiErr.message || 'Failed to save',
            },
          }))
        }
      }
      return
    }

    // 2. Count & Duration metrics
    const trimmed = valueStr.trim()

    // If input is empty: delete existing log if one exists
    if (trimmed === '') {
      if (entry.log_id) {
        setRowStates((prev) => ({ ...prev, [actId]: { status: 'saving' } }))
        try {
          await deleteDailyLog(track.id, actId, targetDate)
          if (saveSeqRef.current[reqKey] === currentSeq) {
            setRowStates((prev) => ({ ...prev, [actId]: { status: 'saved' } }))
            onStatsUpdated()
            loadOverview(targetDate)
          }
        } catch (err: unknown) {
          const apiErr = err as ApiError
          if (saveSeqRef.current[reqKey] === currentSeq) {
            setRowStates((prev) => ({
              ...prev,
              [actId]: { status: 'error', errorMessage: apiErr.message || 'Failed to remove log' },
            }))
          }
        }
      }
      return
    }

    const numericVal = parseInt(trimmed, 10)
    if (isNaN(numericVal) || numericVal < 0) {
      setRowStates((prev) => ({
        ...prev,
        [actId]: { status: 'error', errorMessage: 'Enter a valid non-negative number.' },
      }))
      return
    }

    // If value hasn't changed from existing saved log, skip
    if (entry.log_id && entry.actual_value === numericVal) {
      return
    }

    setRowStates((prev) => ({ ...prev, [actId]: { status: 'saving' } }))
    try {
      await upsertDailyLog(track.id, actId, targetDate, { value: numericVal })
      if (saveSeqRef.current[reqKey] === currentSeq) {
        setRowStates((prev) => ({ ...prev, [actId]: { status: 'saved' } }))
        onStatsUpdated()
        loadOverview(targetDate)
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError
      if (saveSeqRef.current[reqKey] === currentSeq) {
        setRowStates((prev) => ({
          ...prev,
          [actId]: {
            status: 'error',
            errorMessage: apiErr.errors?.value?.[0] || apiErr.message || 'Failed to save',
          },
        }))
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    }
  }

  const isToday = selectedDate === today

  return (
    <section className="panel" style={{ padding: '24px', marginTop: '24px' }}>
      {/* Date Navigation & Summary Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="icon-button"
            onClick={handlePrevDay}
            disabled={selectedDate <= track.start_date}
            title="Previous day"
          >
            <ChevronLeft size={18} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarDays size={18} style={{ color: '#60A5FA' }} />
            <strong style={{ fontSize: '16px', color: 'var(--text)' }}>
              {formatYmd(selectedDate, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </strong>
            {isToday && (
              <span
                style={{
                  background: 'rgba(96, 165, 250, 0.15)',
                  color: '#93C5FD',
                  border: '1px solid rgba(96, 165, 250, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                Today
              </span>
            )}
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={handleNextDay}
            disabled={selectedDate >= track.end_date}
            title="Next day"
          >
            <ChevronRight size={18} />
          </button>

          <button
            type="button"
            className="button secondary"
            onClick={handleGoToday}
            disabled={isToday || today < track.start_date || today > track.end_date}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            Today
          </button>
        </div>

        {/* Day Status and Completion */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              background: statusInfo.bg,
              color: statusInfo.color,
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {statusInfo.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Score:</span>
            <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
              {Math.round(completionPct)}%
            </strong>
          </div>
        </div>
      </div>

      {/* Read-Only Notice if outside loggable window */}
      {!loggableCheck.loggable && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#FCD34D',
            padding: '10px 14px',
            borderRadius: '10px',
            margin: '16px 0',
            fontSize: '13px',
          }}
        >
          <Lock size={16} />
          <span>{loggableCheck.reason} Logs for this day are read-only.</span>
        </div>
      )}

      {/* Logs Content */}
      <div style={{ marginTop: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                border: '3px solid rgba(100, 139, 255, 0.2)',
                borderTopColor: '#60A5FA',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 10px',
              }}
            />
            <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
              Loading day logs...
            </p>
          </div>
        ) : fetchError ? (
          <div style={{ textAlign: 'center', padding: '24px 20px' }}>
            <p style={{ color: '#F87171', marginBottom: '12px', fontSize: '14px' }}>
              {fetchError}
            </p>
            <button className="button secondary" onClick={() => loadOverview(selectedDate)}>
              <RotateCcw size={15} /> Retry
            </button>
          </div>
        ) : overview.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 20px' }}>
            <AlertTriangle size={24} style={{ color: '#F59E0B', margin: '0 auto 8px' }} />
            <p className="muted" style={{ margin: '0 0 14px', fontSize: '14px' }}>
              This track has no activities configured to log.
            </p>
            {onScrollToActivities && (
              <button
                type="button"
                className="button primary"
                onClick={onScrollToActivities}
              >
                Go to Activities Section
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {overview.map((entry) => {
              const row = rowStates[entry.activity_id] || { status: 'idle' }
              const localVal = localValues[entry.activity_id] ?? ''
              const isChecked = localVal === 'true'

              return (
                <div
                  key={entry.activity_id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    {/* Activity Title & Metadata */}
                    <div style={{ minWidth: '180px', flex: '1 1 200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
                          {entry.name}
                        </strong>
                        <span className="required-badge" style={{ fontSize: '10px', padding: '2px 6px' }}>
                          {entry.is_required ? 'Required' : 'Optional'}
                        </span>
                      </div>
                      {entry.description && (
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                          {entry.description}
                        </p>
                      )}
                    </div>

                    {/* Target & Current Progress Display */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '13px',
                        color: 'var(--muted)',
                      }}
                    >
                      <span>Target:</span>
                      <strong style={{ color: '#DDE7FF' }}>
                        {entry.tracking_type === 'checkbox'
                          ? entry.is_completed
                            ? '1 / 1 done'
                            : '0 / 1 done'
                          : `${entry.actual_value ?? 0} / ${entry.daily_target} ${
                              entry.tracking_type === 'duration' ? 'min' : entry.unit || ''
                            }`}
                      </strong>
                    </div>

                    {/* Interactive Input matching Type */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {entry.tracking_type === 'checkbox' ? (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: loggableCheck.loggable ? 'pointer' : 'not-allowed',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!loggableCheck.loggable || row.status === 'saving'}
                            onChange={(e) => {
                              const nextVal = e.target.checked ? 'true' : 'false'
                              setLocalValues((prev) => ({
                                ...prev,
                                [entry.activity_id]: nextVal,
                              }))
                              saveEntry(entry, nextVal)
                            }}
                            style={{
                              width: '20px',
                              height: '20px',
                              cursor: loggableCheck.loggable ? 'pointer' : 'not-allowed',
                            }}
                          />
                          <span style={{ fontSize: '13px', color: isChecked ? '#4ADE80' : 'var(--muted)' }}>
                            {isChecked ? 'Completed' : 'Mark done'}
                          </span>
                        </label>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={localVal}
                            disabled={!loggableCheck.loggable || row.status === 'saving'}
                            onChange={(e) => handleValueChange(entry.activity_id, e.target.value)}
                            onBlur={() => saveEntry(entry)}
                            onKeyDown={handleKeyDown}
                            style={{
                              width: '75px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              textAlign: 'center',
                              fontSize: '14px',
                              background: 'rgba(11, 16, 32, 0.72)',
                              border: '1px solid var(--border)',
                              color: 'var(--text)',
                            }}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                            {entry.tracking_type === 'duration' ? 'min' : entry.unit || ''}
                          </span>
                        </div>
                      )}

                      {/* Row Save Status Indicator */}
                      <div style={{ width: '70px', textAlign: 'right' }}>
                        {row.status === 'saving' && (
                          <span style={{ fontSize: '11px', color: '#60A5FA' }}>Saving...</span>
                        )}
                        {row.status === 'saved' && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#4ADE80',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                            }}
                          >
                            <Check size={12} /> Saved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error display on this row */}
                  {row.errorMessage && (
                    <div
                      style={{
                        marginTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: '#F87171',
                      }}
                    >
                      <span>{row.errorMessage}</span>
                      <button
                        type="button"
                        onClick={() => saveEntry(entry)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60A5FA',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: 0,
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

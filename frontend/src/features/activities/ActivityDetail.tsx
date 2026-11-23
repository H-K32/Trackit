import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Clock3,
  Lock,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from 'lucide-react'
import { getTrack } from '../../api/tracks.ts'
import type { TrackItem } from '../../api/tracks.ts'
import { getActivity, formatActivityTarget } from '../../api/activities.ts'
import type { ActivityItem } from '../../api/activities.ts'
import {
  getDailyLog,
  upsertDailyLog,
  deleteDailyLog,
  getActivityLogsHistory,
} from '../../api/dailyLogs.ts'
import type { DailyLogItem } from '../../api/dailyLogs.ts'
import { EditActivityModal, DeleteActivityModal } from './ActivityModals.tsx'
import { useAuth } from '../../context/AuthContext.tsx'
import type { ApiError } from '../../api/client.ts'
import {
  formatYmd,
  getTodayInTimezone,
  addDaysToYmd,
  checkDateLoggable,
} from '../../utils/date.ts'

export function ActivityDetail() {
  const { trackId, activityId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [activity, setActivity] = useState<ActivityItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Modals state
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Real log state for today
  const today = getTodayInTimezone(user?.timezone)
  const [todayLog, setTodayLog] = useState<DailyLogItem | null>(null)
  const [logValue, setLogValue] = useState<number>(0)
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const [notes, setNotes] = useState<string>('')
  const [logStatus, setLogStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [logErrorMessage, setLogErrorMessage] = useState<string>('')

  // History logs for last 7 days
  const [historyLogs, setHistoryLogs] = useState<DailyLogItem[]>([])

  const loadAll = () => {
    if (!trackId || !activityId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setLoading(true)
    setGeneralError(null)

    const fromDate = addDaysToYmd(today, -6)

    Promise.all([
      getTrack(trackId),
      getActivity(trackId, activityId),
      getDailyLog(trackId, activityId, today).catch(() => null),
      getActivityLogsHistory(trackId, activityId, fromDate, today).catch(() => []),
    ])
      .then(([trackData, activityData, logData, historyData]) => {
        setTrack(trackData)
        setActivity(activityData)
        setTodayLog(logData)
        if (logData) {
          setLogValue(logData.actual_value ?? 0)
          setIsCompleted(Boolean(logData.is_completed))
          setNotes(logData.notes ?? '')
        } else {
          setLogValue(0)
          setIsCompleted(false)
          setNotes('')
        }
        setHistoryLogs(historyData)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        if (apiErr.status === 403 || apiErr.status === 404) {
          setNotFound(true)
        } else {
          setGeneralError(apiErr.message || 'Failed to load activity.')
        }
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!trackId || !activityId) return

    let ignore = false
    const fromDate = addDaysToYmd(today, -6)

    Promise.all([
      getTrack(trackId),
      getActivity(trackId, activityId),
      getDailyLog(trackId, activityId, today).catch(() => null),
      getActivityLogsHistory(trackId, activityId, fromDate, today).catch(() => []),
    ])
      .then(([trackData, activityData, logData, historyData]) => {
        if (!ignore) {
          setTrack(trackData)
          setActivity(activityData)
          setTodayLog(logData)
          if (logData) {
            setLogValue(logData.actual_value ?? 0)
            setIsCompleted(Boolean(logData.is_completed))
            setNotes(logData.notes ?? '')
          } else {
            setLogValue(0)
            setIsCompleted(false)
            setNotes('')
          }
          setHistoryLogs(historyData)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          if (apiErr.status === 403 || apiErr.status === 404) {
            setNotFound(true)
          } else {
            setGeneralError(apiErr.message || 'Failed to load activity.')
          }
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [trackId, activityId, today])

  if (notFound) {
    return (
      <div className="page">
        <button className="back-button" onClick={() => navigate(trackId ? `/tracks/${trackId}` : '/')}>
          <ArrowLeft size={16} /> Back to Track
        </button>
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px' }}>
          <h2 style={{ marginBottom: '8px' }}>Activity not found</h2>
          <p className="muted" style={{ marginBottom: '24px' }}>
            This activity does not exist or does not belong to the selected track.
          </p>
          <button className="button primary" onClick={() => navigate(trackId ? `/tracks/${trackId}` : '/')}>
            Return to Track
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page detail-page">
        <button className="back-button" onClick={() => navigate(`/tracks/${trackId}`)}>
          <ArrowLeft size={16} /> Back to Track
        </button>
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(100, 139, 255, 0.2)',
              borderTopColor: '#648BFF',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p className="muted" style={{ margin: 0 }}>
            Loading activity details...
          </p>
        </div>
      </div>
    )
  }

  if (generalError || !track || !activity) {
    return (
      <div className="page detail-page">
        <button className="back-button" onClick={() => navigate(`/tracks/${trackId}`)}>
          <ArrowLeft size={16} /> Back to Track
        </button>
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px', marginTop: '20px' }}>
          <p style={{ color: '#F87171', marginBottom: '16px' }}>{generalError || 'Unable to load activity.'}</p>
          <button className="button secondary" onClick={loadAll}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    )
  }

  const isUpcoming = track.status === 'upcoming'
  const loggableCheck = checkDateLoggable(today, track.start_date, track.end_date, user?.timezone)

  const handleUpdateSuccess = (updated: ActivityItem) => {
    setActivity(updated)
  }

  const handleDeleteSuccess = () => {
    navigate(`/tracks/${track.id}`, { replace: true })
  }

  // Save log value or notes
  const handleSaveLog = async (newVal: number, newNotes?: string) => {
    if (!trackId || !activityId || !loggableCheck.loggable) return

    setLogStatus('saving')
    setLogErrorMessage('')

    try {
      if (activity.tracking_type === 'checkbox') {
        // Handled separately
        return
      }

      // If value is 0 and log already exists, delete
      if (newVal === 0 && !newNotes && todayLog) {
        await deleteDailyLog(trackId, activityId, today)
        setTodayLog(null)
        setLogValue(0)
        setLogStatus('saved')
        return
      }

      const saved = await upsertDailyLog(trackId, activityId, today, {
        value: newVal,
        notes: newNotes !== undefined ? (newNotes.trim() || null) : notes.trim() || null,
      })
      setTodayLog(saved)
      setLogValue(saved.actual_value ?? newVal)
      setLogStatus('saved')
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setLogStatus('error')
      setLogErrorMessage(apiErr.message || 'Failed to save daily log.')
    }
  }

  // Toggle checkbox metric
  const handleToggleCheckbox = async () => {
    if (!trackId || !activityId || !loggableCheck.loggable) return

    const nextCompleted = !isCompleted
    setIsCompleted(nextCompleted)
    setLogStatus('saving')
    setLogErrorMessage('')

    try {
      if (!nextCompleted) {
        // Delete if unchecking
        if (todayLog) {
          await deleteDailyLog(trackId, activityId, today)
          setTodayLog(null)
        }
        setLogStatus('saved')
      } else {
        const saved = await upsertDailyLog(trackId, activityId, today, {
          is_completed: true,
          notes: notes.trim() || null,
        })
        setTodayLog(saved)
        setLogStatus('saved')
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setIsCompleted(!nextCompleted) // Revert on failure
      setLogStatus('error')
      setLogErrorMessage(apiErr.message || 'Failed to update log.')
    }
  }

  const progressPct =
    todayLog?.progress_percentage ??
    (activity.tracking_type === 'checkbox'
      ? isCompleted
        ? 100
        : 0
      : Math.min(100, Math.round((logValue / activity.daily_target) * 100)))

  return (
    <div className="page detail-page">
      <button className="back-button" onClick={() => navigate(`/tracks/${track.id}`)}>
        <ArrowLeft size={16} /> Back to {track.name}
      </button>

      <header className="detail-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="category" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {activity.tracking_type === 'duration' ? <Clock3 size={15} /> : activity.tracking_type === 'checkbox' ? <Check size={15} /> : <Target size={15} />}
              {activity.tracking_type.toUpperCase()}
            </span>
            <span className="required-badge">
              {activity.is_required ? 'Required' : 'Optional'}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: '4px' }}>
              Target: <strong>{formatActivityTarget(activity)}</strong>
            </span>
          </div>

          <h1>{activity.name}</h1>
          {activity.description && <p className="muted">{activity.description}</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="button secondary" onClick={() => setEditOpen(true)}>
            <Pencil size={16} />
            Edit Activity
          </button>
          {isUpcoming ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setDeleteOpen(true)}
              style={{ color: '#F87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
            >
              <Trash2 size={16} />
              Delete
            </button>
          ) : (
            <span
              style={{
                fontSize: '12px',
                color: '#E0A050',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                padding: '6px 10px',
                borderRadius: '8px',
              }}
            >
              <Lock size={14} /> Locked
            </span>
          )}
        </div>
      </header>

      {/* Daily Logs Section */}
      <div className="detail-grid">
        <section className="panel log-panel">
          {isUpcoming ? (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '12px',
                  background: 'rgba(96, 165, 250, 0.12)',
                  borderRadius: '50%',
                  marginBottom: '12px',
                }}
              >
                <Clock3 size={24} style={{ color: '#60A5FA' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', color: '#DDE7FF' }}>Logging is not open yet</h3>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                This track is upcoming and starts on <strong>{formatYmd(track.start_date)}</strong>. Daily logs can only be recorded once the track is active.
              </p>
            </div>
          ) : (
            <>
              <div className="log-top">
                <div>
                  <p className="eyebrow">TODAY&apos;S PROGRESS ({formatYmd(today)})</p>
                  <h2>
                    {activity.tracking_type === 'checkbox'
                      ? isCompleted
                        ? '1 / 1 completed'
                        : '0 / 1 completed'
                      : `${logValue} / ${activity.daily_target} ${
                          activity.tracking_type === 'duration' ? 'minutes' : activity.unit || ''
                        }`}
                  </h2>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {logStatus === 'saving' && <small style={{ color: '#60A5FA' }}>Saving...</small>}
                  {logStatus === 'saved' && (
                    <small style={{ color: '#4ADE80', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Check size={13} /> Saved
                    </small>
                  )}
                  {logStatus === 'error' && <small style={{ color: '#F87171' }}>{logErrorMessage}</small>}
                </div>
              </div>

              {activity.tracking_type === 'checkbox' ? (
                <button
                  type="button"
                  className={`button ${isCompleted ? 'complete-button' : 'primary'} log-button`}
                  onClick={handleToggleCheckbox}
                  disabled={!loggableCheck.loggable || logStatus === 'saving'}
                  style={{ width: '100%', margin: '16px 0', padding: '12px' }}
                >
                  {isCompleted ? <Check size={18} /> : null}
                  {isCompleted ? 'Completed for today' : 'Mark as complete'}
                </button>
              ) : (
                <div className="counter" style={{ margin: '16px 0' }}>
                  <button
                    type="button"
                    disabled={!loggableCheck.loggable || logValue <= 0 || logStatus === 'saving'}
                    onClick={() => {
                      const next = Math.max(0, logValue - 1)
                      setLogValue(next)
                      handleSaveLog(next)
                    }}
                  >
                    <Minus />
                  </button>
                  <strong>{logValue}</strong>
                  <button
                    type="button"
                    disabled={!loggableCheck.loggable || logStatus === 'saving'}
                    onClick={() => {
                      const next = logValue + 1
                      setLogValue(next)
                      handleSaveLog(next)
                    }}
                  >
                    <Plus />
                  </button>
                </div>
              )}

              <label className="notes" style={{ marginTop: '16px' }}>
                Journal notes
                <textarea
                  value={notes}
                  disabled={!loggableCheck.loggable}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => handleSaveLog(logValue, notes)}
                  placeholder="Add observations, reflections, or details about today's practice..."
                  rows={3}
                />
              </label>
            </>
          )}
        </section>

        {/* History Panel with Real Logs */}
        <section className="panel history-panel">
          <h2>Recent progress</h2>
          <p className="muted" style={{ fontSize: '13px', margin: '4px 0 16px' }}>
            Activity completion for the last 7 days
          </p>

          <div className="history-bars" style={{ minHeight: '120px' }}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDaysToYmd(today, i - 6)
              const logOnDate = historyLogs.find((l) => l.log_date === d)
              const val = logOnDate?.actual_value ?? (logOnDate?.is_completed ? 1 : 0)
              const pct = logOnDate?.progress_percentage ?? 0
              const dayLabel = formatYmd(d, { weekday: 'narrow' })

              return (
                <div key={d} title={`${formatYmd(d)}: ${val} logged (${pct}%)`}>
                  <span>{dayLabel}</span>
                  <div>
                    <i style={{ height: `${Math.max(6, Math.min(100, pct))}%` }} />
                  </div>
                  <strong>{val}</strong>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
            <span>Score today: <strong>{progressPct}%</strong></span>
            <span>Target: <strong>{formatActivityTarget(activity)}</strong></span>
          </div>
        </section>
      </div>

      {editOpen && (
        <EditActivityModal
          open={editOpen}
          trackId={track.id}
          isUpcoming={isUpcoming}
          activity={activity}
          onClose={() => setEditOpen(false)}
          onSuccess={handleUpdateSuccess}
          onTrackLocked={loadAll}
        />
      )}

      {deleteOpen && (
        <DeleteActivityModal
          open={deleteOpen}
          trackId={track.id}
          activity={activity}
          onClose={() => setDeleteOpen(false)}
          onSuccess={handleDeleteSuccess}
          onTrackLocked={loadAll}
        />
      )}
    </div>
  )
}

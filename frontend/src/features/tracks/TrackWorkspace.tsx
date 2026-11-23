import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  Lock,
  Pencil,
  RotateCcw,
  Target,
  Trash2,
} from 'lucide-react'
import { getTrack, getTrackProgress, updateTrack, deleteTrack } from '../../api/tracks.ts'
import type { TrackItem, TrackProgressDetail, UpdateTrackPayload } from '../../api/tracks.ts'
import { getActivities, formatActivityTarget } from '../../api/activities.ts'
import type { ActivityItem } from '../../api/activities.ts'
import {
  AddActivityModal,
  EditActivityModal,
  DeleteActivityModal,
} from '../activities/ActivityModals.tsx'
import { useAuth } from '../../context/AuthContext.tsx'
import type { ApiError } from '../../api/client.ts'
import {
  formatYmd,
  calculateEndDate,
  getTomorrowInTimezone,
  formatTrackStatus,
} from '../../utils/date.ts'

interface EditTrackModalProps {
  track: TrackItem
  onClose: () => void
  onSuccess: (updated: TrackItem) => void
  userTimezone?: string
}

function EditTrackModal({ track, onClose, onSuccess, userTimezone }: EditTrackModalProps) {
  const minStartDate = getTomorrowInTimezone(userTimezone)
  const isUpcoming = track.status === 'upcoming'

  const [name, setName] = useState(track.name)
  const [description, setDescription] = useState(track.description || '')
  const [startDate, setStartDate] = useState(track.start_date)
  const [duration, setDuration] = useState(track.duration_days)
  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const calculatedEndDate = calculateEndDate(startDate, duration)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGeneralError('')
    setFieldErrors({})

    const payload: UpdateTrackPayload = {}
    if (name.trim() !== track.name) {
      payload.name = name.trim()
    }
    if ((description.trim() || null) !== (track.description || null)) {
      payload.description = description.trim() || null
    }
    if (isUpcoming) {
      if (startDate !== track.start_date) {
        payload.start_date = startDate
      }
      if (duration !== track.duration_days) {
        payload.duration_days = duration
      }
    }

    if (Object.keys(payload).length === 0) {
      onClose()
      return
    }

    setSubmitting(true)
    try {
      const updated = await updateTrack(track.id, payload)
      onSuccess(updated)
      onClose()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setGeneralError(apiErr.message || 'Failed to update track.')
      if (apiErr.errors) {
        setFieldErrors(apiErr.errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">TRACK SETTINGS</span>
            <h2>Edit Track</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {generalError && (
          <div className="auth-alert" role="alert" style={{ margin: '16px 20px 0' }}>
            <strong>{generalError}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ padding: '20px' }}>
          <label>
            Track name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          {fieldErrors.name && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.name[0]}
            </small>
          )}

          <label>
            Description (optional)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          {fieldErrors.description && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.description[0]}
            </small>
          )}

          <div className="form-grid">
            <label>
              Start date
              <input
                type="date"
                min={minStartDate}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={!isUpcoming}
                style={!isUpcoming ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                required
              />
            </label>
            <label>
              Duration (days)
              <input
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!isUpcoming}
                style={!isUpcoming ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
                required
              />
            </label>
          </div>

          {!isUpcoming && (
            <small
              className="helper-text"
              style={{ color: '#E0A050', display: 'block', margin: '-4px 0 12px', fontSize: '12px' }}
            >
              The track schedule cannot be changed after it has started.
            </small>
          )}

          {fieldErrors.start_date && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.start_date[0]}
            </small>
          )}
          {fieldErrors.duration_days && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.duration_days[0]}
            </small>
          )}

          {isUpcoming && (
            <div className="end-date" style={{ marginBottom: '20px' }}>
              <CalendarDays size={16} />
              <span>Calculated end date:</span>
              <strong>{formatYmd(calculatedEndDate)}</strong>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface DeleteTrackModalProps {
  trackName: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

function DeleteTrackModal({ trackName, onClose, onConfirm }: DeleteTrackModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setError('')
    setSubmitting(true)
    try {
      await onConfirm()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setError(apiErr.message || 'Failed to delete track. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} color="#F87171" />
            <h2 style={{ color: '#F87171', margin: 0 }}>Delete Track</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          {error && (
            <div className="auth-alert" role="alert" style={{ marginBottom: '16px' }}>
              <strong>{error}</strong>
            </div>
          )}

          <p style={{ color: 'var(--text)', margin: '0 0 12px', fontSize: '14px', lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{trackName}</strong>?
          </p>
          <p style={{ color: 'var(--muted)', margin: '0 0 20px', fontSize: '13px', lineHeight: 1.5 }}>
            This will permanently delete the track, along with all of its activities and daily logs. This action cannot be undone.
          </p>

          <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={handleDelete}
              disabled={submitting}
              style={{
                background: '#DC2626',
                color: '#FFFFFF',
                border: 'none',
              }}
            >
              {submitting ? 'Deleting...' : 'Delete Track'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TrackWorkspace() {
  const { trackId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [progress, setProgress] = useState<TrackProgressDetail | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  // Modals state
  const [editTrackOpen, setEditTrackOpen] = useState(false)
  const [deleteTrackOpen, setDeleteTrackOpen] = useState(false)
  const [addActivityOpen, setAddActivityOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null)
  const [deletingActivity, setDeletingActivity] = useState<ActivityItem | null>(null)

  const reloadAll = () => {
    if (!trackId) return
    setLoading(true)
    setGeneralError(null)

    Promise.all([
      getTrack(trackId),
      getTrackProgress(trackId).catch(() => null),
      getActivities(trackId).catch(() => []),
    ])
      .then(([trackData, progressData, activitiesData]) => {
        setTrack(trackData)
        setProgress(progressData)
        setActivities(activitiesData)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        if (apiErr.status === 403 || apiErr.status === 404) {
          setNotFound(true)
        } else {
          setGeneralError(apiErr.message || 'Failed to load track.')
        }
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!trackId) {
      return
    }

    let ignore = false
    Promise.all([
      getTrack(trackId),
      getTrackProgress(trackId).catch(() => null),
      getActivities(trackId).catch(() => []),
    ])
      .then(([trackData, progressData, activitiesData]) => {
        if (!ignore) {
          setTrack(trackData)
          setProgress(progressData)
          setActivities(activitiesData)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          if (apiErr.status === 403 || apiErr.status === 404) {
            setNotFound(true)
          } else {
            setGeneralError(apiErr.message || 'Failed to load track.')
          }
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [trackId])

  const handleTrackUpdateSuccess = (updated: TrackItem) => {
    setTrack(updated)
    if (trackId) {
      getTrackProgress(trackId).then(setProgress).catch(() => {})
    }
  }

  const handleTrackDeleteConfirm = async () => {
    if (!trackId) return
    await deleteTrack(trackId)
    navigate('/', { replace: true })
  }

  const handleActivityCreated = (newActivity: ActivityItem) => {
    setActivities((prev) => [...prev, newActivity])
  }

  const handleActivityUpdated = (updated: ActivityItem) => {
    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  const handleActivityDeleted = () => {
    if (!deletingActivity) return
    setActivities((prev) => prev.filter((a) => a.id !== deletingActivity.id))
  }

  if (notFound) {
    return (
      <div className="page">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px', marginTop: '20px' }}>
          <h2 style={{ marginBottom: '8px' }}>Track not found</h2>
          <p className="muted" style={{ marginBottom: '24px' }}>
            This track does not exist or you do not have permission to view it.
          </p>
          <button className="button primary" onClick={() => navigate('/')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page workspace">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Dashboard
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
            Loading track details...
          </p>
        </div>
      </div>
    )
  }

  if (generalError || !track) {
    return (
      <div className="page workspace">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px', marginTop: '20px' }}>
          <p style={{ color: '#F87171', marginBottom: '16px' }}>{generalError || 'Unable to load track.'}</p>
          <button className="button secondary" onClick={reloadAll}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    )
  }

  const isUpcoming = track.status === 'upcoming'
  const overallPct = progress ? Math.round(progress.overall_percentage) : 0
  const challengePct = progress ? Math.round(progress.challenge_progress) : 0
  const completedDays = progress ? progress.completed_days : 0
  const totalDays = progress ? progress.total_days : track.duration_days
  const daysRemaining = progress ? progress.days_remaining : track.duration_days
  const elapsedDays = progress ? progress.elapsed_days : 0

  const statusColor =
    track.status === 'active'
      ? '#4ADE80'
      : track.status === 'upcoming'
      ? '#60A5FA'
      : '#94A3B8'

  return (
    <div className="page workspace">
      <button className="back-button" onClick={() => navigate('/')}>
        <ArrowLeft size={16} /> Dashboard
      </button>

      <header className="workspace-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span className="category">
              <Target size={14} /> Track
            </span>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: statusColor,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: statusColor,
                  display: 'inline-block',
                }}
              />
              {formatTrackStatus(track.status, track.start_date)}
            </span>
          </div>
          <h1>{track.name}</h1>
          {track.description && <p className="muted">{track.description}</p>}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginTop: '8px',
              fontSize: '13px',
              color: 'var(--muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CalendarDays size={15} />
              {formatYmd(track.start_date)} – {formatYmd(track.end_date)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Clock3 size={15} />
              {track.duration_days} days
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="button secondary" onClick={() => setEditTrackOpen(true)}>
            <Pencil size={16} />
            Edit Track
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => setDeleteTrackOpen(true)}
            style={{ color: '#F87171', borderColor: 'rgba(248, 113, 113, 0.3)' }}
          >
            <Trash2 size={16} />
            Delete
          </button>
          {isUpcoming && (
            <button
              type="button"
              className="button primary"
              onClick={() => setAddActivityOpen(true)}
            >
              <CirclePlus size={18} />
              Add Activity
            </button>
          )}
        </div>
      </header>

      {/* Stats Grid */}
      <section className="stats-grid">
        <div className="stat-card">
          <span>Overall progress</span>
          <strong>{overallPct}%</strong>
          <div className="progress-track">
            <span style={{ width: `${Math.min(100, Math.max(0, overallPct))}%` }} />
          </div>
          <small>Average daily completion</small>
        </div>

        <div className="stat-card">
          <span>Challenge progress</span>
          <strong>{challengePct}%</strong>
          <div className="progress-track">
            <span style={{ width: `${Math.min(100, Math.max(0, challengePct))}%` }} />
          </div>
          <small>Cumulative duration score</small>
        </div>

        <div className="stat-card">
          <span>Days completed</span>
          <strong>{completedDays}</strong>
          <small>of {totalDays} total days</small>
        </div>

        <div className="stat-card">
          <span>Days remaining</span>
          <strong>{daysRemaining}</strong>
          <small>Elapsed: {elapsedDays} days</small>
        </div>
      </section>

      {/* Milestones */}
      {progress?.milestones && progress.milestones.length > 0 && (
        <section className="panel" style={{ padding: '16px 20px', marginTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Milestones</h3>
            <span className="muted" style={{ fontSize: '13px' }}>
              {progress.milestones.filter((m) => m.reached).length} of {progress.milestones.length} reached
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            {progress.milestones.map((m) => (
              <div
                key={m.threshold}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: m.reached ? 'rgba(74, 222, 128, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${m.reached ? 'rgba(74, 222, 128, 0.25)' : 'var(--border)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ color: m.reached ? '#4ADE80' : 'var(--text)', fontSize: '15px' }}>
                    {m.threshold}%
                  </strong>
                  {m.reached ? (
                    <Check size={16} color="#4ADE80" />
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Pending</span>
                  )}
                </div>
                <small style={{ color: 'var(--muted)', fontSize: '11px' }}>
                  {m.reached && m.reached_on ? `Reached ${formatYmd(m.reached_on)}` : 'Incomplete'}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activities Section */}
      <section style={{ marginTop: '24px' }}>
        <div className="section-heading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>Activities</h2>
            <p>
              {activities.length} {activities.length === 1 ? 'activity' : 'activities'} on this track (max 20)
            </p>
          </div>
          {!isUpcoming ? (
            <span
              style={{
                fontSize: '12px',
                color: '#E0A050',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(245, 158, 11, 0.25)',
              }}
            >
              <Lock size={14} /> Activities are locked once a track starts
            </span>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={() => setAddActivityOpen(true)}
            >
              <CirclePlus size={16} /> Add Activity
            </button>
          )}
        </div>

        {activities.length === 0 ? (
          isUpcoming ? (
            <div
              className="panel"
              style={{
                padding: '32px 24px',
                textAlign: 'center',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                background: 'rgba(245, 158, 11, 0.08)',
                borderRadius: '16px',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  padding: '12px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  borderRadius: '50%',
                  marginBottom: '12px',
                }}
              >
                <AlertTriangle size={24} color="#F59E0B" />
              </div>
              <h3 style={{ margin: '0 0 8px', color: '#FCD34D' }}>No activities configured yet</h3>
              <p style={{ margin: '0 0 20px', color: '#FDE68A', fontSize: '14px' }}>
                Add at least one activity before the track starts, because they can&apos;t be added later.
              </p>
              <button
                type="button"
                className="button primary"
                onClick={() => setAddActivityOpen(true)}
              >
                <CirclePlus size={18} /> Add Your First Activity
              </button>
            </div>
          ) : (
            <div className="panel" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                No activities were added to this track.
              </p>
              <small style={{ color: '#E0A050' }}>Activities are locked once a track starts.</small>
            </div>
          )
        ) : (
          <div className="activity-grid">
            {activities.map((activity) => (
              <article
                className="activity-card"
                key={activity.id}
                onClick={() => navigate(`/tracks/${track.id}/activities/${activity.id}`)}
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              >
                <div
                  className="activity-card-head"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <span className="activity-icon">
                    {activity.tracking_type === 'duration' ? (
                      <Clock3 size={18} />
                    ) : activity.tracking_type === 'checkbox' ? (
                      <Check size={18} />
                    ) : (
                      <Target size={18} />
                    )}
                  </span>
                  <span className="required-badge">
                    {activity.is_required ? 'Required' : 'Optional'}
                  </span>
                </div>

                <h3>{activity.name}</h3>
                {activity.description && (
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--muted)',
                      margin: '4px 0 12px',
                      minHeight: '36px',
                    }}
                  >
                    {activity.description}
                  </p>
                )}

                <div
                  className="progress-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'auto',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Daily target</span>
                  <strong style={{ fontSize: '13px', color: '#DDE7FF' }}>
                    {formatActivityTarget(activity)}
                  </strong>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '12px',
                    paddingTop: '8px',
                  }}
                >
                  <span
                    className="card-link"
                    style={{ fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    Open activity <ChevronRight size={14} />
                  </span>

                  <div
                    style={{ display: 'flex', gap: '6px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit activity"
                      onClick={() => setEditingActivity(activity)}
                    >
                      <Pencil size={14} />
                    </button>
                    {isUpcoming && (
                      <button
                        type="button"
                        className="icon-button"
                        title="Delete activity"
                        style={{ color: '#F87171' }}
                        onClick={() => setDeletingActivity(activity)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Placeholder sections for slices 4-5 */}
      <section className="bottom-grid" style={{ marginTop: '24px' }}>
        <div className="panel">
          <h2>Track calendar</h2>
          <div className="calendar-strip">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className={i === 9 ? 'today' : ''}>
                <small>{i + 1}</small>
                <i className={i < 10 ? 'filled' : ''} />
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2>Recent logs</h2>
          <p className="muted">Daily logs will appear here once activities are tracked.</p>
        </div>
      </section>

      {/* Track Modals */}
      {editTrackOpen && (
        <EditTrackModal
          track={track}
          onClose={() => setEditTrackOpen(false)}
          onSuccess={handleTrackUpdateSuccess}
          userTimezone={user?.timezone}
        />
      )}

      {deleteTrackOpen && (
        <DeleteTrackModal
          trackName={track.name}
          onClose={() => setDeleteTrackOpen(false)}
          onConfirm={handleTrackDeleteConfirm}
        />
      )}

      {/* Activity Modals */}
      {addActivityOpen && (
        <AddActivityModal
          open={addActivityOpen}
          trackId={track.id}
          onClose={() => setAddActivityOpen(false)}
          onSuccess={handleActivityCreated}
          onTrackLocked={reloadAll}
        />
      )}

      {editingActivity && (
        <EditActivityModal
          open={Boolean(editingActivity)}
          trackId={track.id}
          isUpcoming={isUpcoming}
          activity={editingActivity}
          onClose={() => setEditingActivity(null)}
          onSuccess={handleActivityUpdated}
          onTrackLocked={reloadAll}
        />
      )}

      {deletingActivity && (
        <DeleteActivityModal
          open={Boolean(deletingActivity)}
          trackId={track.id}
          activity={deletingActivity}
          onClose={() => setDeletingActivity(null)}
          onSuccess={handleActivityDeleted}
          onTrackLocked={reloadAll}
        />
      )}
    </div>
  )
}

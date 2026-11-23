import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, Clock3, Plus, RotateCcw, Target } from 'lucide-react'
import { getTracks, createTrack } from '../../api/tracks.ts'
import type { TrackItem } from '../../api/tracks.ts'
import { useAuth } from '../../context/AuthContext.tsx'
import type { ApiError } from '../../api/client.ts'
import {
  formatYmd,
  calculateEndDate,
  getTomorrowInTimezone,
  formatTrackStatus,
} from '../../utils/date.ts'

interface CreateTrackModalProps {
  onClose: () => void
  onSuccess: (newTrack: TrackItem) => void
  userTimezone?: string
}

export function CreateTrackModal({ onClose, onSuccess, userTimezone }: CreateTrackModalProps) {
  const minStartDate = getTomorrowInTimezone(userTimezone)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(minStartDate)
  const [duration, setDuration] = useState(30)
  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const calculatedEndDate = calculateEndDate(startDate, duration)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGeneralError('')
    setFieldErrors({})

    if (!name.trim()) {
      setFieldErrors({ name: ['Track name is required.'] })
      return
    }

    if (!startDate || startDate < minStartDate) {
      setFieldErrors({ start_date: [`Start date must be tomorrow (${formatYmd(minStartDate)}) or later.`] })
      return
    }

    if (!duration || duration < 1) {
      setFieldErrors({ duration_days: ['Duration must be at least 1 day.'] })
      return
    }

    setSubmitting(true)
    try {
      const created = await createTrack({
        name: name.trim(),
        description: description.trim() || null,
        start_date: startDate,
        duration_days: duration,
      })
      onSuccess(created)
      onClose()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setGeneralError(apiErr.message || 'Failed to create track. Please check your inputs.')
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
            <span className="eyebrow">NEW TRACK</span>
            <h2>Create a Track</h2>
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
              placeholder="e.g. Daily Coding Habit"
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
              placeholder="What consistency or practice are you building?"
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
                required
              />
            </label>
          </div>

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

          <small
            className="helper-text"
            style={{ color: 'var(--muted)', display: 'block', margin: '4px 0 16px', fontSize: '12px' }}
          >
            A track starts the day after it is created, so its activities can be set up first.
          </small>

          <div className="end-date" style={{ marginBottom: '20px' }}>
            <CalendarDays size={16} />
            <span>Calculated end date:</span>
            <strong>{formatYmd(calculatedEndDate)}</strong>
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Track'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchTracks = () => {
    setLoading(true)
    setError(null)
    getTracks(true)
      .then((data) => {
        setTracks(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        setError(apiErr.message || 'Failed to load tracks. Please try again.')
        setLoading(false)
      })
  }

  useEffect(() => {
    let ignore = false
    getTracks(true)
      .then((data) => {
        if (!ignore) {
          setTracks(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          setError(apiErr.message || 'Failed to load tracks. Please try again.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  const handleCreateSuccess = () => {
    fetchTracks()
  }

  const userDisplayName = user?.name || 'there'
  const activeCount = tracks.filter((t) => t.status === 'active').length

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Good morning, {userDisplayName}</h1>
          <p className="muted">Turn ambitious goals into a clear daily practice.</p>
        </div>
        <button className="button primary" onClick={() => setModalOpen(true)}>
          <Plus size={18} />
          Create Track
        </button>
      </header>

      <section>
        <div className="section-heading">
          <div>
            <h2>My Tracks</h2>
            <p>
              {activeCount} active track{activeCount === 1 ? '' : 's'} (of {tracks.length} total)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="panel" style={{ textAlign: 'center', padding: '48px 20px' }}>
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
            <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
              Loading tracks...
            </p>
          </div>
        ) : error ? (
          <div className="panel" style={{ textAlign: 'center', padding: '36px 20px' }}>
            <p style={{ color: '#F87171', marginBottom: '16px', fontSize: '14px' }}>{error}</p>
            <button className="button secondary" onClick={fetchTracks}>
              <RotateCcw size={16} /> Retry
            </button>
          </div>
        ) : tracks.length === 0 ? (
          <button className="empty-track" onClick={() => setModalOpen(true)}>
            <span>
              <Plus size={24} />
            </span>
            <strong>No tracks yet</strong>
            <small>Click to create your first track</small>
          </button>
        ) : (
          <div className="track-grid">
            {tracks.map((track) => {
              const statusColor =
                track.status === 'active'
                  ? '#4ADE80'
                  : track.status === 'upcoming'
                  ? '#60A5FA'
                  : '#94A3B8'

              const overallPct = track.progress ? Math.round(track.progress.overall_percentage) : 0
              const completedDays = track.progress ? track.progress.completed_days : 0
              const totalDays = track.progress ? track.progress.total_days : track.duration_days
              const today = track.progress?.today

              return (
                <article
                  className="track-card"
                  key={track.id}
                  onClick={() => navigate(`/tracks/${track.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="track-card-top">
                    <span className="category">
                      <Target size={15} /> Track
                    </span>
                    <span className="status">
                      <i
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          display: 'inline-block',
                          background: statusColor,
                        }}
                      />
                      {formatTrackStatus(track.status, track.start_date)}
                    </span>
                  </div>

                  <h3>{track.name}</h3>
                  {track.description && <p className="track-desc">{track.description}</p>}

                  <div className="track-meta">
                    <span>
                      <CalendarDays size={15} />
                      {formatYmd(track.start_date)} – {formatYmd(track.end_date)}
                    </span>
                    <span>
                      <Clock3 size={15} />
                      {track.duration_days} days
                    </span>
                  </div>

                  <div className="progress-row">
                    <span>Progress</span>
                    <strong>{overallPct}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${Math.min(100, Math.max(0, overallPct))}%` }} />
                  </div>

                  <div
                    style={{
                      marginTop: '12px',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}
                  >
                    <span>
                      {completedDays} of {totalDays} days completed
                    </span>
                    {today ? (
                      <span>
                        Today: <strong style={{ color: 'var(--text)' }}>{today.day_status}</strong> (
                        {Math.round(today.completion_percentage)}%)
                      </span>
                    ) : track.status === 'upcoming' ? (
                      <span>Starts {formatYmd(track.start_date)}</span>
                    ) : (
                      <span>Ended</span>
                    )}
                  </div>

                  <div className="track-footer" style={{ marginTop: '14px' }}>
                    <span>Open workspace</span>
                    <ChevronRight size={18} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Placeholder sections for slices 3-5 */}
      <section className="bottom-grid">
        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Recent activity</h2>
              <p>Your latest updates</p>
            </div>
          </div>
          <p className="muted">No recent activity recorded yet.</p>
        </div>
        <div className="panel summary-panel">
          <h2>This week</h2>
          <div className="week-days">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className={i < 4 ? 'done' : ''}>
                <span>{d}</span>
                <i>{i < 4 ? '✓' : ''}</i>
              </div>
            ))}
          </div>
        </div>
      </section>

      {modalOpen && (
        <CreateTrackModal
          onClose={() => setModalOpen(false)}
          onSuccess={handleCreateSuccess}
          userTimezone={user?.timezone}
        />
      )}
    </div>
  )
}

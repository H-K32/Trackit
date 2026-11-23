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
import { EditActivityModal, DeleteActivityModal } from './ActivityModals.tsx'
import type { ApiError } from '../../api/client.ts'
import { formatYmd } from '../../utils/date.ts'

export function ActivityDetail() {
  const { trackId, activityId } = useParams()
  const navigate = useNavigate()

  const [track, setTrack] = useState<TrackItem | null>(null)
  const [activity, setActivity] = useState<ActivityItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Placeholder state for daily log counter (slice 4 will connect this to backend)
  const [placeholderValue, setPlaceholderValue] = useState(0)
  const [placeholderCompleted, setPlaceholderCompleted] = useState(false)
  const [placeholderNotes, setPlaceholderNotes] = useState('')

  const loadData = () => {
    if (!trackId || !activityId) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setLoading(true)
    setGeneralError(null)

    Promise.all([
      getTrack(trackId),
      getActivity(trackId, activityId),
    ])
      .then(([trackData, activityData]) => {
        setTrack(trackData)
        setActivity(activityData)
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
    Promise.all([
      getTrack(trackId),
      getActivity(trackId, activityId),
    ])
      .then(([trackData, activityData]) => {
        if (!ignore) {
          setTrack(trackData)
          setActivity(activityData)
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
  }, [trackId, activityId])

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
          <button className="button secondary" onClick={loadData}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    )
  }

  const isUpcoming = track.status === 'upcoming'

  const handleUpdateSuccess = (updated: ActivityItem) => {
    setActivity(updated)
  }

  const handleDeleteSuccess = () => {
    navigate(`/tracks/${track.id}`, { replace: true })
  }

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

      {/* Placeholder sections for slice 4 (daily logs) */}
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
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '12px',
                  color: '#94A3B8',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              >
                Full daily logs integration coming in Slice 4
              </span>
            </div>
          ) : (
            <>
              <div className="log-top">
                <div>
                  <p className="eyebrow">TODAY&apos;S LOG (SLICE 4 PREVIEW)</p>
                  <h2>
                    {placeholderValue}{' '}
                    <span>
                      / {activity.daily_target} {activity.unit || 'target'}
                    </span>
                  </h2>
                </div>
              </div>

              <div className="counter">
                <button
                  type="button"
                  onClick={() => setPlaceholderValue((v) => Math.max(0, v - 1))}
                >
                  <Minus />
                </button>
                <strong>{placeholderValue}</strong>
                <button
                  type="button"
                  onClick={() => setPlaceholderValue((v) => v + 1)}
                >
                  <Plus />
                </button>
              </div>

              <button
                type="button"
                className={`button ${placeholderCompleted ? 'complete-button' : 'primary'} log-button`}
                onClick={() => {
                  setPlaceholderCompleted((c) => !c)
                  if (!placeholderCompleted) {
                    setPlaceholderValue(activity.daily_target)
                  }
                }}
              >
                {placeholderCompleted ? <Check size={18} /> : null}
                {placeholderCompleted ? 'Completed for today' : 'Mark as complete'}
              </button>

              <label className="notes" style={{ marginTop: '16px' }}>
                Notes
                <textarea
                  value={placeholderNotes}
                  onChange={(e) => setPlaceholderNotes(e.target.value)}
                  placeholder="Add observations, mistakes, or next steps..."
                />
              </label>
            </>
          )}
        </section>

        <section className="panel history-panel">
          <h2>Recent progress</h2>
          <p className="muted" style={{ fontSize: '13px', margin: '8px 0 16px' }}>
            Log history will populate here in Slice 4.
          </p>
          <div className="calendar-mini">
            <h3>Activity History</h3>
            <div>
              {Array.from({ length: 30 }, (_, i) => (
                <span key={i} className={i < 5 ? 'logged' : ''}>
                  {i + 1}
                </span>
              ))}
            </div>
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
          onTrackLocked={loadData}
        />
      )}

      {deleteOpen && (
        <DeleteActivityModal
          open={deleteOpen}
          trackId={track.id}
          activity={activity}
          onClose={() => setDeleteOpen(false)}
          onSuccess={handleDeleteSuccess}
          onTrackLocked={loadData}
        />
      )}
    </div>
  )
}

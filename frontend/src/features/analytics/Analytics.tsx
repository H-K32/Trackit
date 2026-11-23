import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BarChart3, Plus, RotateCcw } from 'lucide-react'
import { getTracks, getTrackProgress } from '../../api/tracks.ts'
import type { TrackItem, TrackProgressDetail } from '../../api/tracks.ts'
import { getTrackAnalytics } from '../../api/analytics.ts'
import type { TrackAnalytics } from '../../api/analytics.ts'
import { TrackAnalyticsView } from './TrackAnalyticsView.tsx'
import type { ApiError } from '../../api/client.ts'

export function Analytics() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTrackId = searchParams.get('track')

  const [tracks, setTracks] = useState<TrackItem[]>([])
  const [tracksLoading, setTracksLoading] = useState(true)
  const [tracksError, setTracksError] = useState<string | null>(null)

  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(() => {
    return urlTrackId ? Number(urlTrackId) : null
  })

  const [analytics, setAnalytics] = useState<TrackAnalytics | null>(null)
  const [progress, setProgress] = useState<TrackProgressDetail | null>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  // 1. Load user tracks on mount
  useEffect(() => {
    let ignore = false
    getTracks(false)
      .then((data) => {
        if (!ignore) {
          setTracks(data)
          if (data.length > 0) {
            setSelectedTrackId((prev) => {
              if (prev && data.some((t) => t.id === prev)) return prev
              const firstActive = data.find((t) => t.status === 'active')
              return firstActive ? firstActive.id : data[0].id
            })
          }
          setTracksLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          setTracksError(apiErr.message || 'Failed to load tracks.')
          setTracksLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  // 2. Load analytics and progress for selected track
  useEffect(() => {
    if (!selectedTrackId) return
    let ignore = false

    Promise.all([
      getTrackAnalytics(selectedTrackId),
      getTrackProgress(selectedTrackId).catch(() => null),
    ])
      .then(([analyticsData, progressData]) => {
        if (!ignore) {
          setAnalytics(analyticsData)
          setProgress(progressData)
          setDataLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError
          setDataError(apiErr.message || 'Failed to load analytics data.')
          setDataLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [selectedTrackId])

  const handleTrackChange = (trackId: number) => {
    setSelectedTrackId(trackId)
    setDataLoading(true)
    setSearchParams({ track: String(trackId) }, { replace: true })
  }

  const loadTracks = () => {
    setTracksLoading(true)
    setTracksError(null)
    getTracks(false)
      .then((data) => {
        setTracks(data)
        if (data.length > 0) {
          const matched = data.find((t) => t.id === selectedTrackId)
          if (!matched) {
            const firstActive = data.find((t) => t.status === 'active')
            setSelectedTrackId(firstActive ? firstActive.id : data[0].id)
          }
        }
        setTracksLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        setTracksError(apiErr.message || 'Failed to load tracks.')
        setTracksLoading(false)
      })
  }

  const loadAnalyticsData = (trackId: number) => {
    setDataLoading(true)
    setDataError(null)
    Promise.all([
      getTrackAnalytics(trackId),
      getTrackProgress(trackId).catch(() => null),
    ])
      .then(([analyticsData, progressData]) => {
        setAnalytics(analyticsData)
        setProgress(progressData)
        setDataLoading(false)
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError
        setDataError(apiErr.message || 'Failed to load analytics data.')
        setDataLoading(false)
      })
  }

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || null

  if (tracksLoading) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">INSIGHTS</p>
            <h1>Analytics</h1>
            <p className="muted">Track your consistency and performance.</p>
          </div>
        </header>
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Loading your tracks...
          </p>
        </div>
      </div>
    )
  }

  if (tracksError) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">INSIGHTS</p>
            <h1>Analytics</h1>
            <p className="muted">Track your consistency and performance.</p>
          </div>
        </header>
        <div className="panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--status-missed)', marginBottom: '16px' }}>{tracksError}</p>
          <button type="button" className="button secondary" onClick={loadTracks}>
            <RotateCcw size={16} /> Retry
          </button>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">INSIGHTS</p>
            <h1>Analytics</h1>
            <p className="muted">Track your consistency and performance.</p>
          </div>
        </header>
        <div className="panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '16px',
              borderRadius: '50%',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              marginBottom: '16px',
            }}
          >
            <BarChart3 size={32} color="var(--accent)" />
          </div>
          <h2 style={{ marginBottom: '8px', fontSize: '20px' }}>No tracks found</h2>
          <p className="muted" style={{ maxWidth: '420px', margin: '0 auto 24px', fontSize: '14px' }}>
            Create your first challenge track from the dashboard to track your daily progress and consistency.
          </p>
          <button type="button" className="button primary" onClick={() => navigate('/')}>
            <Plus size={16} /> Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header
        className="page-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div>
          <p className="eyebrow">INSIGHTS</p>
          <h1>Analytics</h1>
          <p className="muted">Track your consistency and performance.</p>
        </div>

        {/* Track Selector Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label htmlFor="analytics-track-select" style={{ fontSize: '13px', color: 'var(--muted)' }}>
            Select track:
          </label>
          <select
            id="analytics-track-select"
            value={selectedTrackId || ''}
            onChange={(e) => handleTrackChange(Number(e.target.value))}
            style={{
              height: '42px',
              padding: '0 12px',
              borderRadius: '10px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '14px',
              cursor: 'pointer',
              minWidth: '180px',
              maxWidth: '100%',
            }}
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.status})
              </option>
            ))}
          </select>
        </div>
      </header>

      {selectedTrack && (
        <TrackAnalyticsView
          track={selectedTrack}
          analytics={analytics}
          progress={progress}
          loading={dataLoading}
          error={dataError}
          onRetry={() => loadAnalyticsData(selectedTrack.id)}
        />
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  getActivityTemplates,
  createActivity,
  updateActivity,
  deleteActivity,
} from '../../api/activities.ts'
import type {
  ActivityItem,
  ActivityTemplate,
  CreateActivityPayload,
  TrackingType,
  UpdateActivityPayload,
} from '../../api/activities.ts'
import type { ApiError } from '../../api/client.ts'

interface AddActivityModalProps {
  open: boolean
  trackId: number | string
  onClose: () => void
  onSuccess: (newActivity: ActivityItem) => void
  onTrackLocked?: () => void
}

export function AddActivityModal({
  open,
  trackId,
  onClose,
  onSuccess,
  onTrackLocked,
}: AddActivityModalProps) {
  const [templates, setTemplates] = useState<ActivityTemplate[]>([])
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('custom')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trackingType, setTrackingType] = useState<TrackingType>('count')
  const [dailyTarget, setDailyTarget] = useState<number>(1)
  const [unit, setUnit] = useState('')
  const [isRequired, setIsRequired] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Fetch templates when modal mounts
  useEffect(() => {
    let ignore = false
    getActivityTemplates()
      .then((data) => {
        if (!ignore) setTemplates(data)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  if (!open) return null

  const handleTemplateChange = (key: string) => {
    setSelectedTemplateKey(key)
    setGeneralError('')
    setFieldErrors({})

    if (key === 'custom') {
      setName('')
      setDescription('')
      setTrackingType('count')
      setDailyTarget(1)
      setUnit('')
      setIsRequired(true)
      return
    }

    const tpl = templates.find((t) => t.key === key)
    if (tpl) {
      setName(tpl.name)
      setDescription(tpl.description || '')
      setTrackingType(tpl.tracking_type)
      setDailyTarget(tpl.daily_target)
      setUnit(tpl.unit || '')
      setIsRequired(true)
    }
  }

  const handleTrackingTypeChange = (type: TrackingType) => {
    setTrackingType(type)
    if (type === 'duration') {
      setUnit('minutes')
      if (dailyTarget < 1) setDailyTarget(15)
    } else if (type === 'checkbox') {
      setUnit('')
      setDailyTarget(1)
    } else if (type === 'count') {
      if (unit === 'minutes') setUnit('')
      if (dailyTarget < 1) setDailyTarget(1)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGeneralError('')
    setFieldErrors({})

    const errors: Record<string, string[]> = {}
    if (!name.trim()) {
      errors.name = ['Activity name is required.']
    }
    if (trackingType === 'count') {
      if (!unit.trim()) {
        errors.unit = ['Unit is required for count metrics (e.g. reps, puzzles).']
      } else if (unit.trim().length > 30) {
        errors.unit = ['Unit must not exceed 30 characters.']
      }
      if (dailyTarget < 1) {
        errors.daily_target = ['Daily target must be at least 1.']
      }
    } else if (trackingType === 'duration') {
      if (dailyTarget < 1) {
        errors.daily_target = ['Daily target minutes must be at least 1.']
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    const payload: CreateActivityPayload = {
      name: name.trim(),
      description: description.trim() || null,
      tracking_type: trackingType,
      daily_target: trackingType === 'checkbox' ? 1 : Math.round(dailyTarget),
      unit: trackingType === 'count' ? unit.trim() : trackingType === 'duration' ? 'minutes' : null,
      is_required: isRequired,
    }

    setSubmitting(true)
    try {
      const created = await createActivity(trackId, payload)
      onSuccess(created)
      onClose()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      if (apiErr.code === 'activities_locked' || apiErr.status === 409) {
        setGeneralError(apiErr.message || 'Activities are locked once a track starts.')
        if (onTrackLocked) onTrackLocked()
      } else {
        setGeneralError(apiErr.message || 'Failed to create activity.')
        if (apiErr.errors) {
          setFieldErrors(apiErr.errors)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">NEW ACTIVITY</span>
            <h2>Add Activity</h2>
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
          {templates.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="activity-template-select">
                Choose template (or Custom)
                <select
                  id="activity-template-select"
                  value={selectedTemplateKey}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  style={{ width: '100%', marginTop: '6px' }}
                >
                  <option value="custom">Custom (Start from scratch)</option>
                  {templates.map((tpl) => (
                    <option key={tpl.key} value={tpl.key}>
                      {tpl.name} ({tpl.tracking_type === 'duration' ? `${tpl.daily_target} min` : tpl.tracking_type === 'checkbox' ? 'Once/day' : `${tpl.daily_target} ${tpl.unit}`})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label>
            Activity name
            <input
              type="text"
              placeholder="e.g. Chess Puzzles"
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
              placeholder="What practice or routine does this activity involve?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>
          {fieldErrors.description && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.description[0]}
            </small>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="activity-tracking-type-select">
              Tracking type
              <select
                id="activity-tracking-type-select"
                value={trackingType}
                onChange={(e) => handleTrackingTypeChange(e.target.value as TrackingType)}
                style={{ width: '100%', marginTop: '6px' }}
              >
                <option value="count">Count (number of reps, games, puzzles)</option>
                <option value="duration">Duration (minutes practiced)</option>
                <option value="checkbox">Checkbox (complete once a day)</option>
              </select>
            </label>
            {fieldErrors.tracking_type && (
              <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '4px' }}>
                {fieldErrors.tracking_type[0]}
              </small>
            )}
          </div>

          {trackingType === 'count' && (
            <div className="form-grid">
              <label>
                Daily target
                <input
                  type="number"
                  min="1"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                />
              </label>
              <label>
                Unit (e.g. puzzles, reps)
                <input
                  type="text"
                  maxLength={30}
                  placeholder="e.g. puzzles"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                />
              </label>
            </div>
          )}

          {trackingType === 'duration' && (
            <div style={{ marginBottom: '16px' }}>
              <label>
                Daily target (minutes)
                <input
                  type="number"
                  min="1"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  required
                />
              </label>
              <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
                Unit is automatically recorded in minutes.
              </small>
            </div>
          )}

          {trackingType === 'checkbox' && (
            <div
              style={{
                background: 'rgba(100, 139, 255, 0.08)',
                border: '1px solid rgba(100, 139, 255, 0.2)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#C4D7FF',
              }}
            >
              Checkbox metric: complete once a day (target is 1, no unit).
            </div>
          )}

          {fieldErrors.daily_target && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.daily_target[0]}
            </small>
          )}
          {fieldErrors.unit && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.unit[0]}
            </small>
          )}

          <label
            className="toggle-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '16px 0 20px',
              cursor: 'pointer',
            }}
          >
            <span>
              <strong>Required activity</strong>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>
                Must be completed to earn 100% daily score
              </small>
            </span>
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditActivityModalProps {
  open: boolean
  trackId: number | string
  isUpcoming: boolean
  activity: ActivityItem
  onClose: () => void
  onSuccess: (updated: ActivityItem) => void
  onTrackLocked?: () => void
}

export function EditActivityModal({
  open,
  trackId,
  isUpcoming,
  activity,
  onClose,
  onSuccess,
  onTrackLocked,
}: EditActivityModalProps) {
  const [name, setName] = useState(activity.name)
  const [description, setDescription] = useState(activity.description || '')
  const [trackingType, setTrackingType] = useState<TrackingType>(activity.tracking_type)
  const [dailyTarget, setDailyTarget] = useState<number>(activity.daily_target)
  const [unit, setUnit] = useState(activity.unit || '')
  const [isRequired, setIsRequired] = useState(activity.is_required)

  const [submitting, setSubmitting] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  if (!open) return null

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGeneralError('')
    setFieldErrors({})

    const payload: UpdateActivityPayload = {}
    if (name.trim() !== activity.name) {
      payload.name = name.trim()
    }
    if ((description.trim() || null) !== (activity.description || null)) {
      payload.description = description.trim() || null
    }

    if (isUpcoming) {
      if (trackingType !== activity.tracking_type) {
        payload.tracking_type = trackingType
      }
      if (dailyTarget !== activity.daily_target) {
        payload.daily_target = Math.round(dailyTarget)
      }
      const targetUnit =
        trackingType === 'count' ? unit.trim() : trackingType === 'duration' ? 'minutes' : null
      if (targetUnit !== (activity.unit || null)) {
        payload.unit = targetUnit
      }
      if (isRequired !== activity.is_required) {
        payload.is_required = isRequired
      }
    }

    if (Object.keys(payload).length === 0) {
      onClose()
      return
    }

    setSubmitting(true)
    try {
      const updated = await updateActivity(trackId, activity.id, payload)
      onSuccess(updated)
      onClose()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      if (apiErr.code === 'activities_locked' || apiErr.status === 409) {
        setGeneralError(apiErr.message || 'Activities are locked once a track starts.')
        if (onTrackLocked) onTrackLocked()
      } else {
        setGeneralError(apiErr.message || 'Failed to update activity.')
        if (apiErr.errors) {
          setFieldErrors(apiErr.errors)
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">EDIT ACTIVITY</span>
            <h2>Edit Activity</h2>
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
            Activity name
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
              rows={2}
            />
          </label>
          {fieldErrors.description && (
            <small className="field-error" style={{ color: '#F87171', display: 'block', marginTop: '-8px', marginBottom: '12px' }}>
              {fieldErrors.description[0]}
            </small>
          )}

          {!isUpcoming && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#FCD34D',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>Activities are locked once a track starts (only name and description can be changed).</span>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="edit-activity-tracking-type-select">
              Tracking type
              <select
                id="edit-activity-tracking-type-select"
                value={trackingType}
                onChange={(e) => setTrackingType(e.target.value as TrackingType)}
                disabled={!isUpcoming}
                style={{ width: '100%', marginTop: '6px', opacity: isUpcoming ? 1 : 0.6 }}
              >
                <option value="count">Count (number of reps, games, puzzles)</option>
                <option value="duration">Duration (minutes)</option>
                <option value="checkbox">Checkbox (complete once a day)</option>
              </select>
            </label>
          </div>

          {trackingType === 'count' && (
            <div className="form-grid">
              <label>
                Daily target
                <input
                  type="number"
                  min="1"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  disabled={!isUpcoming}
                  style={{ opacity: isUpcoming ? 1 : 0.6 }}
                  required
                />
              </label>
              <label>
                Unit
                <input
                  type="text"
                  maxLength={30}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={!isUpcoming}
                  style={{ opacity: isUpcoming ? 1 : 0.6 }}
                  required
                />
              </label>
            </div>
          )}

          {trackingType === 'duration' && (
            <div style={{ marginBottom: '16px' }}>
              <label>
                Daily target (minutes)
                <input
                  type="number"
                  min="1"
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  disabled={!isUpcoming}
                  style={{ opacity: isUpcoming ? 1 : 0.6 }}
                  required
                />
              </label>
            </div>
          )}

          {trackingType === 'checkbox' && (
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 16px' }}>
              Checkbox metric: target is 1 per day.
            </p>
          )}

          <label
            className="toggle-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '16px 0 20px',
              opacity: isUpcoming ? 1 : 0.6,
              cursor: isUpcoming ? 'pointer' : 'not-allowed',
            }}
          >
            <span>
              <strong>Required activity</strong>
              <small style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>
                Must be completed to earn 100% daily score
              </small>
            </span>
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              disabled={!isUpcoming}
              style={{ width: '18px', height: '18px', cursor: isUpcoming ? 'pointer' : 'not-allowed' }}
            />
          </label>

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

interface DeleteActivityModalProps {
  open: boolean
  trackId: number | string
  activity: ActivityItem
  onClose: () => void
  onSuccess: () => void
  onTrackLocked?: () => void
}

export function DeleteActivityModal({
  open,
  trackId,
  activity,
  onClose,
  onSuccess,
  onTrackLocked,
}: DeleteActivityModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleDelete = async () => {
    setError('')
    setSubmitting(true)
    try {
      await deleteActivity(trackId, activity.id)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const apiErr = err as ApiError
      if (apiErr.code === 'activities_locked' || apiErr.status === 409) {
        setError(apiErr.message || 'Activities are locked once a track starts.')
        if (onTrackLocked) onTrackLocked()
      } else {
        setError(apiErr.message || 'Failed to delete activity. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} color="#F87171" />
            <h2 style={{ color: '#F87171', margin: 0 }}>Delete Activity</h2>
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
            Are you sure you want to delete <strong>{activity.name}</strong>?
          </p>
          <p style={{ color: 'var(--muted)', margin: '0 0 20px', fontSize: '13px', lineHeight: 1.5 }}>
            This will permanently remove the activity from this track. This action cannot be undone.
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
              {submitting ? 'Deleting...' : 'Delete Activity'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

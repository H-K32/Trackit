import { useState, useEffect, useMemo, useRef } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Globe,
  Lock,
  Mail,
  Palette,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.tsx'
import { useTheme } from '../../context/ThemeContext.tsx'
import { updateProfile, me as apiMe } from '../../api/auth.ts'
import type { UpdateProfilePayload } from '../../api/auth.ts'
import type { ApiError } from '../../api/client.ts'

interface ProfileSettingsProps {
  mode?: 'profile' | 'settings' | 'appearance'
}

export function ProfileSettings({ mode = 'profile' }: ProfileSettingsProps) {
  const { user, updateUser } = useAuth()
  const { theme, setTheme, themes, currentThemeInfo } = useTheme()
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'settings'>(
    mode === 'settings' ? 'appearance' : mode === 'appearance' ? 'appearance' : 'profile'
  )

  // Form states
  const [name, setName] = useState(user?.name || '')
  const [selectedTimezone, setSelectedTimezone] = useState(user?.timezone || 'UTC')
  const [timezoneSearch, setTimezoneSearch] = useState('')
  const [timezoneDropdownOpen, setTimezoneDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Status & Error states
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [isTimezoneLocked, setIsTimezoneLocked] = useState(false)

  const [prevUserKey, setPrevUserKey] = useState<string>(() => `${user?.id}_${user?.name}_${user?.timezone}`)
  const currentUserKey = `${user?.id}_${user?.name}_${user?.timezone}`

  if (currentUserKey !== prevUserKey && user) {
    setPrevUserKey(currentUserKey)
    setName(user.name)
    setSelectedTimezone(user.timezone || 'UTC')
  }

  // Click outside to close timezone dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTimezoneDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Fresh user reload from /api/me
  const refreshUser = () => {
    setRefreshing(true)
    apiMe()
      .then((fresh) => {
        updateUser(fresh)
        setName(fresh.name)
        setSelectedTimezone(fresh.timezone || 'UTC')
        setRefreshing(false)
      })
      .catch(() => {
        setRefreshing(false)
      })
  }

  // Get list of valid IANA timezones
  const timezoneList = useMemo(() => {
    let list: string[] = []
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      try {
        list = Intl.supportedValuesOf('timeZone')
      } catch {
        list = []
      }
    }
    if (list.length === 0) {
      list = [
        'UTC',
        'Africa/Cairo',
        'Africa/Johannesburg',
        'Africa/Lagos',
        'Africa/Nairobi',
        'America/Anchorage',
        'America/Argentina/Buenos_Aires',
        'America/Bogota',
        'America/Chicago',
        'America/Denver',
        'America/Halifax',
        'America/Los_Angeles',
        'America/Mexico_City',
        'America/New_York',
        'America/Phoenix',
        'America/Santiago',
        'America/Sao_Paulo',
        'America/Toronto',
        'America/Vancouver',
        'Asia/Bangkok',
        'Asia/Dubai',
        'Asia/Hong_Kong',
        'Asia/Jakarta',
        'Asia/Kolkata',
        'Asia/Manila',
        'Asia/Seoul',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Tokyo',
        'Australia/Sydney',
        'Australia/Melbourne',
        'Australia/Brisbane',
        'Australia/Perth',
        'Europe/Amsterdam',
        'Europe/Berlin',
        'Europe/Dublin',
        'Europe/Istanbul',
        'Europe/Lisbon',
        'Europe/London',
        'Europe/Madrid',
        'Europe/Paris',
        'Europe/Rome',
        'Pacific/Auckland',
        'Pacific/Honolulu',
      ]
    }
    const tz = user?.timezone
    if (tz && !list.includes(tz)) {
      list.unshift(tz)
    }
    return list
  }, [user?.timezone])

  // Filtered timezone list based on user search
  const filteredTimezones = useMemo(() => {
    const q = timezoneSearch.trim().toLowerCase()
    if (!q) return timezoneList.slice(0, 80)
    return timezoneList.filter((tz) => tz.toLowerCase().includes(q)).slice(0, 80)
  }, [timezoneList, timezoneSearch])

  // Browser detected timezone
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return 'UTC'
    }
  }, [])

  // Check if form has unsaved modifications
  const hasChanges = Boolean(
    (name.trim() && name.trim() !== (user?.name || '')) ||
    (selectedTimezone && selectedTimezone !== (user?.timezone || 'UTC'))
  )

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setGeneralError(null)
    setFieldErrors({})
    setSuccessMessage(null)

    const payload: UpdateProfilePayload = {}
    if (name.trim() !== (user?.name || '')) {
      payload.name = name.trim()
    }
    if (selectedTimezone !== (user?.timezone || 'UTC')) {
      payload.timezone = selectedTimezone
    }

    if (Object.keys(payload).length === 0) {
      setSuccessMessage('No changes to save.')
      return
    }

    setSaving(true)

    try {
      const updatedUser = await updateProfile(payload)
      updateUser(updatedUser)
      setSuccessMessage('Profile and settings updated successfully.')
      setIsTimezoneLocked(false)
      setSaving(false)
    } catch (err: unknown) {
      const apiErr = err as ApiError
      setSaving(false)

      if (apiErr.status === 409 || apiErr.code === 'timezone_locked') {
        setIsTimezoneLocked(true)
        setGeneralError(apiErr.message || 'Timezone cannot be changed while you have an active track.')
      } else if (apiErr.status === 422) {
        if (apiErr.errors) {
          setFieldErrors(apiErr.errors)
        }
        setGeneralError(apiErr.message || 'Please correct the validation errors below.')
      } else {
        setGeneralError(apiErr.message || 'Failed to update profile settings.')
      }
    }
  }

  const handleSelectTimezone = (tz: string) => {
    if (isTimezoneLocked) return
    setSelectedTimezone(tz)
    setTimezoneDropdownOpen(false)
    setTimezoneSearch('')
    setSuccessMessage(null)
  }

  return (
    <div className="page" style={{ maxWidth: '800px' }}>
      <header className="page-header">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p className="eyebrow">ACCOUNT</p>
            <h1>Account Settings</h1>
            <p className="muted">Manage your profile information and application preferences.</p>
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={refreshUser}
            disabled={refreshing}
            style={{ height: '38px', fontSize: '13px' }}
          >
            <RotateCcw size={15} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </header>

      {/* Segmented Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`button ${activeTab === 'profile' ? 'primary' : 'secondary'}`}
          style={{ height: '38px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <UserIcon size={15} /> Profile & Timezone
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`button ${activeTab === 'appearance' ? 'primary' : 'secondary'}`}
          style={{ height: '38px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Palette size={15} /> Appearance & Themes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`button ${activeTab === 'settings' ? 'primary' : 'secondary'}`}
          style={{ height: '38px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Globe size={15} /> Workspace Info
        </button>
      </div>

      {/* Feedback Alerts */}
      {successMessage && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'color-mix(in srgb, var(--status-completed) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-completed) 30%, transparent)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: 'var(--status-completed)',
            fontSize: '14px',
          }}
        >
          <CheckCircle2 size={18} />
          <strong>{successMessage}</strong>
        </div>
      )}

      {generalError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'color-mix(in srgb, var(--status-missed) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--status-missed) 30%, transparent)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: 'var(--status-missed)',
            fontSize: '14px',
          }}
        >
          <AlertTriangle size={18} />
          <strong>{generalError}</strong>
        </div>
      )}

      {/* Main Settings Form */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSubmit} className="panel profile-form-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Display Name Field */}
            <div>
              <label
                htmlFor="user-name"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '8px',
                }}
              >
                Display name
              </label>
              <input
                id="user-name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setSuccessMessage(null)
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: [] }))
                }}
                placeholder="Your full name"
                required
                style={{
                  width: '100%',
                  height: '44px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  background: 'var(--surface)',
                  border: fieldErrors.name?.length ? '1px solid var(--status-missed)' : '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
              {fieldErrors.name?.map((err, i) => (
                <p key={i} style={{ color: 'var(--status-missed)', fontSize: '12px', margin: '6px 0 0' }}>
                  {err}
                </p>
              ))}
            </div>

            {/* Email Field (Read-only as required) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label
                  htmlFor="user-email"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  Email address
                </label>
                <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={12} /> Read-only
                </span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="user-email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  disabled
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px 0 38px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontSize: '14px',
                    cursor: 'not-allowed',
                  }}
                />
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--muted)',
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: '12px', margin: '6px 0 0' }}>
                Your account email is fixed and verified with your provider.
              </p>
            </div>

            {/* Timezone Field (Searchable IANA List) */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label
                  htmlFor="timezone-picker"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  Timezone
                </label>
                {isTimezoneLocked ? (
                  <span
                    style={{
                      fontSize: '12px',
                      color: 'var(--status-pending)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'color-mix(in srgb, var(--status-pending) 12%, transparent)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    <Lock size={12} /> Locked by active track
                  </span>
                ) : (
                  browserTimezone &&
                  selectedTimezone !== browserTimezone && (
                    <button
                      type="button"
                      onClick={() => handleSelectTimezone(browserTimezone)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      Use browser timezone ({browserTimezone})
                    </button>
                  )
                )}
              </div>

              {/* Timezone Input Trigger */}
              <div style={{ position: 'relative' }}>
                <button
                  id="timezone-picker"
                  type="button"
                  disabled={isTimezoneLocked}
                  onClick={() => setTimezoneDropdownOpen((prev) => !prev)}
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 14px 0 38px',
                    borderRadius: '10px',
                    background: isTimezoneLocked ? 'rgba(255, 255, 255, 0.03)' : 'var(--surface)',
                    border: fieldErrors.timezone?.length
                      ? '1px solid var(--status-missed)'
                      : isTimezoneLocked
                      ? '1px solid color-mix(in srgb, var(--status-pending) 30%, transparent)'
                      : '1px solid var(--border)',
                    color: isTimezoneLocked ? 'var(--muted)' : 'var(--text)',
                    fontSize: '14px',
                    textAlign: 'left',
                    cursor: isTimezoneLocked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{selectedTimezone}</span>
                  <Clock size={16} style={{ color: 'var(--muted)' }} />
                </button>
                <Globe
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: isTimezoneLocked ? 'var(--status-pending)' : 'var(--muted)',
                  }}
                />
              </div>

              {/* Locked Timezone Explanation */}
              {isTimezoneLocked && (
                <p style={{ color: 'var(--status-pending)', fontSize: '12px', margin: '6px 0 0', lineHeight: 1.4 }}>
                  Timezone cannot be changed while a track is running to preserve schedule consistency. Once your active challenge concludes, you can change your timezone.
                </p>
              )}

              {fieldErrors.timezone?.map((err, i) => (
                <p key={i} style={{ color: 'var(--status-missed)', fontSize: '12px', margin: '6px 0 0' }}>
                  {err}
                </p>
              ))}

              {/* Searchable Dropdown Popover */}
              {timezoneDropdownOpen && !isTimezoneLocked && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
                    padding: '12px',
                    maxHeight: '320px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {/* Search filter input */}
                  <div style={{ position: 'relative' }}>
                    <Search
                      size={15}
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--muted)',
                      }}
                    />
                    <input
                      type="text"
                      value={timezoneSearch}
                      onChange={(e) => setTimezoneSearch(e.target.value)}
                      placeholder="Type to filter timezones (e.g. London, New_York, Tokyo)..."
                      autoFocus
                      style={{
                        width: '100%',
                        height: '36px',
                        padding: '0 12px 0 32px',
                        borderRadius: '8px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        fontSize: '13px',
                      }}
                    />
                  </div>

                  {/* Filtered list */}
                  <div style={{ overflowY: 'auto', maxHeight: '220px', display: 'flex', flexDirection: 'column' }}>
                    {filteredTimezones.length > 0 ? (
                      filteredTimezones.map((tz) => {
                        const isCurrent = tz === selectedTimezone
                        return (
                          <button
                            key={tz}
                            type="button"
                            onClick={() => handleSelectTimezone(tz)}
                            style={{
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: isCurrent ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                              border: 'none',
                              color: isCurrent ? 'var(--accent)' : 'var(--text)',
                              fontSize: '13px',
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{tz}</span>
                            {isCurrent && <Check size={14} color="var(--accent)" />}
                          </button>
                        )
                      })
                    ) : (
                      <p className="muted" style={{ padding: '12px', fontSize: '13px', textAlign: 'center', margin: 0 }}>
                        No matching IANA timezones found.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '16px',
                borderTop: '1px solid var(--border)',
                marginTop: '8px',
              }}
            >
              <span className="muted" style={{ fontSize: '13px' }}>
                {hasChanges ? 'Unsaved changes ready to apply' : 'All settings up to date'}
              </span>
              <button
                type="submit"
                disabled={saving || !hasChanges}
                className="button primary"
                style={{ minWidth: '140px' }}
              >
                {saving ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <div className="loading-dot" /> Saving...
                  </span>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Theme & Appearance Tab / Section */}
      {(activeTab === 'appearance' || activeTab === 'settings') && (
        <section className="panel" style={{ padding: '28px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Palette size={20} style={{ color: 'var(--accent)' }} />
              <h2 style={{ margin: 0, fontSize: '18px' }}>Color Themes</h2>
            </div>
            <span className="muted" style={{ fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              Active: <strong style={{ color: 'var(--text)' }}>{currentThemeInfo.name}</strong>
            </span>
          </div>
          <p className="muted" style={{ margin: '0 0 20px', fontSize: '13px' }}>
            Choose a color palette for your workspace. Themes change colors instantly and persist across sessions.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
            }}
          >
            {themes.map((t) => {
              const isActive = t.id === theme
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  style={{
                    background: t.swatches.card,
                    border: isActive ? '2px solid var(--accent)' : `1px solid ${t.swatches.border}`,
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    position: 'relative',
                    boxShadow: isActive ? '0 0 0 1px var(--accent), 0 8px 24px rgba(0, 0, 0, 0.35)' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: t.swatches.text }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: '11px', color: t.swatches.muted, marginTop: '2px' }}>
                        {t.tagline}
                      </div>
                    </div>
                    {isActive ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'var(--accent)',
                          color: 'var(--accent-text)',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '12px',
                        }}
                      >
                        <Check size={12} /> Active
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          color: t.swatches.muted,
                          border: `1px solid ${t.swatches.border}`,
                          padding: '2px 6px',
                          borderRadius: '8px',
                          textTransform: 'capitalize',
                        }}
                      >
                        {t.colorScheme}
                      </span>
                    )}
                  </div>

                  {/* Swatches strip */}
                  <div
                    style={{
                      display: 'flex',
                      height: '24px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: `1px solid ${t.swatches.border}`,
                      background: t.swatches.midnight,
                    }}
                  >
                    <div title="Background" style={{ flex: 1, background: t.swatches.midnight }} />
                    <div title="Surface" style={{ flex: 1, background: t.swatches.surface }} />
                    <div title="Card" style={{ flex: 1, background: t.swatches.card }} />
                    <div title="Accent" style={{ flex: 1.5, background: t.swatches.accent }} />
                    <div title="Accent 2" style={{ flex: 1, background: t.swatches.accent2 }} />
                    <div title="Completed" style={{ flex: 1, background: t.swatches.statusCompleted }} />
                  </div>

                  <p
                    style={{
                      fontSize: '12px',
                      lineHeight: 1.4,
                      color: t.swatches.muted,
                      margin: 0,
                    }}
                  >
                    {t.description}
                  </p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Workspace Information Tab */}
      {activeTab === 'settings' && (
        <section className="panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Shield size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Account & Security Details</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span className="muted">User ID</span>
              <strong style={{ color: 'var(--text)' }}>#{user?.id}</strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span className="muted">Primary Timezone</span>
              <strong style={{ color: 'var(--text)' }}>{user?.timezone || 'UTC'}</strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span className="muted">Account Status</span>
              <span
                style={{
                  color: 'var(--status-completed)',
                  background: 'color-mix(in srgb, var(--status-completed) 12%, transparent)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                Active
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 0',
              }}
            >
              <span className="muted">Timezone policy</span>
              <span className="muted" style={{ textAlign: 'right', maxWidth: '380px', fontSize: '13px' }}>
                Your timezone determines challenge &quot;Today&quot; dates, daily log windows, and midnight resets. It cannot be altered during active tracks.
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

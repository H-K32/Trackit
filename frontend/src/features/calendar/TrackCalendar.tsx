import { useState, useMemo } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Lock,
  Minus,
  RotateCcw,
  X,
} from 'lucide-react'
import type { TrackItem } from '../../api/tracks.ts'
import type { CalendarDayItem } from '../../api/dailyLogs.ts'
import {
  formatYmd,
  getTodayInTimezone,
  getTrackMonths,
  getDaysInMonth,
  getFirstDayOfWeek,
  formatDayStatus,
  checkDateLoggable,
} from '../../utils/date.ts'

interface TrackCalendarProps {
  track: TrackItem
  calendarDays: CalendarDayItem[]
  userTimezone?: string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  selectedDate?: string
  onSelectDate: (date: string) => void
}

export function TrackCalendar({
  track,
  calendarDays,
  userTimezone,
  loading = false,
  error = null,
  onRetry,
  selectedDate,
  onSelectDate,
}: TrackCalendarProps) {
  const today = getTodayInTimezone(userTimezone)
  const todayMonthKey = today.slice(0, 7)

  // Compute all months covered by this track
  const months = useMemo(() => {
    return getTrackMonths(track.start_date, track.end_date)
  }, [track.start_date, track.end_date])

  // Determine initial month index: prefer today's month if within track, otherwise first or last
  const initialMonthIndex = useMemo(() => {
    if (months.length === 0) return 0
    const todayIdx = months.findIndex((m) => m.key === todayMonthKey)
    if (todayIdx !== -1) return todayIdx
    if (today < track.start_date) return 0
    return months.length - 1
  }, [months, todayMonthKey, today, track.start_date])

  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(initialMonthIndex)

  // Keep active month index bounded when track months change
  const boundedMonthIdx = Math.min(Math.max(0, activeMonthIdx), Math.max(0, months.length - 1))
  const currentMonth = months[boundedMonthIdx]

  // Hovered day tooltip state
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)

  if (loading) {
    return (
      <section className="panel" style={{ padding: '36px 20px', textAlign: 'center', marginTop: '24px' }}>
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
          Loading calendar schedule...
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel" style={{ padding: '36px 20px', textAlign: 'center', marginTop: '24px' }}>
        <p style={{ color: '#F87171', marginBottom: '14px', fontSize: '14px' }}>{error}</p>
        {onRetry && (
          <button type="button" className="button secondary" onClick={onRetry}>
            <RotateCcw size={15} /> Retry
          </button>
        )}
      </section>
    )
  }

  if (months.length === 0 || !currentMonth) {
    return (
      <section className="panel" style={{ padding: '36px 20px', textAlign: 'center', marginTop: '24px' }}>
        <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
          No calendar data available for this track.
        </p>
      </section>
    )
  }

  // Calculate grid layout for current month
  const daysInMonth = getDaysInMonth(currentMonth.year, currentMonth.month)
  const firstDayOfWeek = getFirstDayOfWeek(currentMonth.year, currentMonth.month)

  const dayCells = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0')
    const monthStr = String(currentMonth.month).padStart(2, '0')
    const dateStr = `${currentMonth.year}-${monthStr}-${dayStr}`
    const inTrack = dateStr >= track.start_date && dateStr <= track.end_date
    const dayData = inTrack ? calendarDays.find((cd) => cd.date === dateStr) : undefined
    dayCells.push({ dayNumber: d, dateStr, inTrack, dayData })
  }

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check size={13} color="#4ADE80" />
      case 'partial':
        return <CircleDot size={13} color="#60A5FA" />
      case 'missed':
        return <X size={13} color="#F87171" />
      case 'pending':
        return <Clock3 size={13} color="#FCD34D" />
      case 'no_activities':
        return <Minus size={13} color="#94A3B8" />
      case 'upcoming':
      default:
        return <Lock size={13} color="#94A3B8" />
    }
  }

  const getStatusShortLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Done'
      case 'partial':
        return 'Partial'
      case 'missed':
        return 'Missed'
      case 'pending':
        return 'Pending'
      case 'no_activities':
        return 'No acts'
      case 'upcoming':
      default:
        return 'Upcoming'
    }
  }

  return (
    <section className="panel" style={{ padding: '24px', marginTop: '24px' }}>
      {/* Calendar Header with Month Navigation */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarDays size={20} style={{ color: '#60A5FA' }} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>Track Calendar</h2>
            <span
              style={{
                fontSize: '11px',
                background: 'rgba(96, 165, 250, 0.12)',
                color: '#93C5FD',
                padding: '2px 8px',
                borderRadius: '8px',
                border: '1px solid rgba(96, 165, 250, 0.25)',
              }}
            >
              {track.duration_days} days total
            </span>
          </div>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            {formatYmd(track.start_date)} to {formatYmd(track.end_date)} · Click any day to view or log activities
          </p>
        </div>

        {/* Month Navigator Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="icon-button"
            onClick={() => setActiveMonthIdx((prev) => Math.max(0, prev - 1))}
            disabled={boundedMonthIdx === 0}
            title="Previous month"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>

          <span
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text)',
              minWidth: '140px',
              textAlign: 'center',
            }}
          >
            {currentMonth.label}
          </span>

          <button
            type="button"
            className="icon-button"
            onClick={() => setActiveMonthIdx((prev) => Math.min(months.length - 1, prev + 1))}
            disabled={boundedMonthIdx === months.length - 1}
            title="Next month"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>

          {/* Jump to Today's month if within track and not currently viewing */}
          {months.some((m) => m.key === todayMonthKey) && currentMonth.key !== todayMonthKey && (
            <button
              type="button"
              className="button secondary"
              style={{ height: '34px', fontSize: '12px', padding: '0 10px', marginLeft: '6px' }}
              onClick={() => {
                const idx = months.findIndex((m) => m.key === todayMonthKey)
                if (idx !== -1) setActiveMonthIdx(idx)
              }}
            >
              Today&apos;s Month
            </button>
          )}
        </div>
      </div>

      {/* Month Grid */}
      <div style={{ marginTop: '20px' }}>
        {/* Day of Week Column Headers */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '8px',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--muted)',
                padding: '4px 0',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Cells Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '8px',
          }}
        >
          {/* Empty spacer cells before day 1 */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div
              key={`blank-${i}`}
              style={{
                minHeight: '84px',
                borderRadius: '12px',
                background: 'transparent',
                border: '1px dashed rgba(255, 255, 255, 0.03)',
              }}
            />
          ))}

          {/* Day Cells */}
          {dayCells.map(({ dayNumber, dateStr, inTrack, dayData }) => {
            if (!inTrack) {
              // Day of month outside the track
              return (
                <div
                  key={dateStr}
                  style={{
                    minHeight: '84px',
                    padding: '8px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    opacity: 0.35,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    cursor: 'default',
                  }}
                  title={`${dateStr} (Outside track schedule)`}
                >
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{dayNumber}</span>
                </div>
              )
            }

            const status = dayData?.day_status || 'upcoming'
            const completionPct = dayData?.completion_percentage ?? 0
            const statusInfo = formatDayStatus(status)
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDate
            const loggable = checkDateLoggable(dateStr, track.start_date, track.end_date, userTimezone).loggable

            return (
              <div
                key={dateStr}
                onClick={() => onSelectDate(dateStr)}
                onMouseEnter={() => setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                style={{
                  minHeight: '84px',
                  padding: '8px',
                  borderRadius: '12px',
                  background: statusInfo.bg,
                  border: isSelected
                    ? '2px solid #648BFF'
                    : isToday
                    ? '2px solid rgba(96, 165, 250, 0.8)'
                    : `1px solid ${statusInfo.color}33`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isSelected
                    ? '0 0 14px rgba(100, 139, 255, 0.35)'
                    : isToday
                    ? '0 0 10px rgba(96, 165, 250, 0.2)'
                    : 'none',
                }}
              >
                {/* Top Row: Day Number and Today / Selection Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: isToday ? 700 : 500,
                      color: isToday ? '#93C5FD' : 'var(--text)',
                    }}
                  >
                    {dayNumber}
                  </span>

                  {isToday ? (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        background: '#3B82F6',
                        color: '#FFFFFF',
                        padding: '1px 5px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Today
                    </span>
                  ) : dayData?.day_number ? (
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                      D{dayData.day_number}
                    </span>
                  ) : null}
                </div>

                {/* Middle Row: Status Icon and Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '4px 0' }}>
                  {renderStatusIcon(status)}
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: statusInfo.color,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getStatusShortLabel(status)}
                  </span>
                </div>

                {/* Bottom Row: Completion Percentage & Loggable State */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: completionPct > 0 ? '#DDE7FF' : 'var(--muted)',
                    }}
                  >
                    {Math.round(completionPct)}%
                  </span>
                  {!loggable && (
                    <span style={{ fontSize: '9px', color: 'var(--muted)' }} title="Read-only date">
                      Read-only
                    </span>
                  )}
                </div>

                {/* Hover / Tap Tooltip */}
                {hoveredDate === dateStr && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid var(--border)',
                      backdropFilter: 'blur(8px)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                      zIndex: 20,
                      minWidth: '150px',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5FC' }}>
                      {formatYmd(dateStr)}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: statusInfo.color,
                        marginTop: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {renderStatusIcon(status)}
                      <span>
                        {statusInfo.label} ({Math.round(completionPct)}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                      {loggable ? 'Click to log activities' : 'Click to view (read-only)'}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Status Legend */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'block',
            marginBottom: '10px',
          }}
        >
          Status Legend
        </span>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(74, 222, 128, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={13} color="#4ADE80" />
            </span>
            <span>
              <strong style={{ color: '#4ADE80' }}>Completed:</strong> 100% target met
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(96, 165, 250, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircleDot size={13} color="#60A5FA" />
            </span>
            <span>
              <strong style={{ color: '#60A5FA' }}>Partial:</strong> Some progress logged
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(248, 113, 113, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={13} color="#F87171" />
            </span>
            <span>
              <strong style={{ color: '#F87171' }}>Missed:</strong> 0% logged on past day
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(252, 211, 77, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock3 size={13} color="#FCD34D" />
            </span>
            <span>
              <strong style={{ color: '#FCD34D' }}>Pending:</strong> Awaiting today&apos;s logs
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(148, 163, 184, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Lock size={13} color="#94A3B8" />
            </span>
            <span>
              <strong style={{ color: '#94A3B8' }}>Upcoming:</strong> Scheduled future day
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '6px',
                background: 'rgba(148, 163, 184, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Minus size={13} color="#94A3B8" />
            </span>
            <span>
              <strong style={{ color: '#94A3B8' }}>No activities:</strong> None configured
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

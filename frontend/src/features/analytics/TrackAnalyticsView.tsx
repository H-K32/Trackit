import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  RotateCcw,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { TrackItem, TrackProgressDetail } from '../../api/tracks.ts'
import type { TrackAnalytics } from '../../api/analytics.ts'
import { formatYmd } from '../../utils/date.ts'

interface TrackAnalyticsViewProps {
  track: TrackItem
  analytics: TrackAnalytics | null
  progress: TrackProgressDetail | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function TrackAnalyticsView({
  track,
  analytics,
  progress,
  loading = false,
  error = null,
  onRetry,
}: TrackAnalyticsViewProps) {
  if (loading) {
    return (
      <section className="panel" style={{ padding: '40px 20px', textAlign: 'center', marginTop: '24px' }}>
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
          Loading track analytics...
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel" style={{ padding: '40px 20px', textAlign: 'center', marginTop: '24px' }}>
        <p style={{ color: 'var(--status-missed)', marginBottom: '14px', fontSize: '14px' }}>{error}</p>
        {onRetry && (
          <button type="button" className="button secondary" onClick={onRetry}>
            <RotateCcw size={15} /> Retry
          </button>
        )}
      </section>
    )
  }

  // 1. Empty state for upcoming tracks
  if (track.status === 'upcoming') {
    return (
      <section
        className="panel"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          marginTop: '24px',
          background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '14px',
            borderRadius: '50%',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            marginBottom: '16px',
          }}
        >
          <Calendar size={28} color="var(--accent)" />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--accent)' }}>
          Track has not started yet
        </h3>
        <p style={{ margin: '0 auto', maxWidth: '440px', color: 'var(--muted)', fontSize: '14px' }}>
          This track starts on {formatYmd(track.start_date)}. Analytics will become available once the track begins and daily activities are logged.
        </p>
      </section>
    )
  }

  // Check if any activity has logs recorded or if weekly breakdown exists
  const hasLoggedData =
    analytics &&
    (analytics.weekly_breakdown.length > 0 ||
      analytics.activities_performance.some((a) => a.total_logged > 0 || a.days_completed > 0))

  // 2. Empty state for active/expired track with no logs recorded yet
  if (!hasLoggedData) {
    return (
      <section
        className="panel"
        style={{
          padding: '48px 24px',
          textAlign: 'center',
          marginTop: '24px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '14px',
            borderRadius: '50%',
            background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
            marginBottom: '16px',
          }}
        >
          <BarChart3 size={28} color="var(--accent)" />
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px', color: 'var(--text)' }}>
          Log your first day to see analytics
        </h3>
        <p style={{ margin: '0 auto 20px', maxWidth: '420px', color: 'var(--muted)', fontSize: '14px' }}>
          Record daily logs for your activities to begin tracking your weekly consistency, completion trends, and milestone progress.
        </p>
      </section>
    )
  }

  const overallCompletion = analytics?.overall_completion ?? 0
  const challengeProgress = progress ? Math.round(progress.challenge_progress) : 0
  const trend = analytics?.trend ?? 'insufficient_data'

  const renderTrendBadge = () => {
    switch (trend) {
      case 'improving':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--status-completed)',
              background: 'color-mix(in srgb, var(--status-completed) 12%, transparent)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <TrendingUp size={15} /> Improving (+5% vs prior week)
          </span>
        )
      case 'declining':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--status-missed)',
              background: 'color-mix(in srgb, var(--status-missed) 12%, transparent)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <TrendingDown size={15} /> Declining (-5% vs prior week)
          </span>
        )
      case 'stable':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--status-partial)',
              background: 'color-mix(in srgb, var(--status-partial) 12%, transparent)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Activity size={15} /> Stable (consistent within ±5%)
          </span>
        )
      case 'insufficient_data':
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--muted)',
              background: 'rgba(148, 163, 184, 0.1)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <Clock3 size={15} /> Building data (needs 14+ days)
          </span>
        )
    }
  }

  // Format chart data for weekly breakdown
  const chartData = (analytics?.weekly_breakdown || []).map((w) => ({
    weekLabel: `W${w.week}`,
    weekNumber: w.week,
    percentage: w.percentage,
  }))

  const milestones = progress?.milestones || []

  return (
    <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Key Metrics Overview Summary */}
      <section className="stats-grid">
        <div className="stat-card">
          <span>Overall completion</span>
          <strong style={{ fontSize: '28px', color: 'var(--text)' }}>
            {overallCompletion}%
          </strong>
          <div className="progress-track" style={{ margin: '8px 0 6px' }}>
            <span style={{ width: `${Math.min(100, Math.max(0, overallCompletion))}%` }} />
          </div>
          <small>Average across all elapsed challenge days</small>
        </div>

        <div className="stat-card">
          <span>Challenge score</span>
          <strong style={{ fontSize: '28px', color: 'var(--accent)' }}>
            {challengeProgress}%
          </strong>
          <div className="progress-track" style={{ margin: '8px 0 6px' }}>
            <span style={{ width: `${Math.min(100, Math.max(0, challengeProgress))}%` }} />
          </div>
          <small>Cumulative completion over {track.duration_days} total days</small>
        </div>

        <div className="stat-card">
          <span>Current performance trend</span>
          <div style={{ margin: '10px 0' }}>{renderTrendBadge()}</div>
          <small>Comparing the last 7 days against previous 7 days</small>
        </div>

        <div className="stat-card">
          <span>Tracked activities</span>
          <strong style={{ fontSize: '28px', color: 'var(--text)' }}>
            {analytics?.activities_performance.length || 0}
          </strong>
          <small>
            {analytics?.activities_performance.filter((a) => a.is_required).length || 0} required for completion
          </small>
        </div>
      </section>

      {/* 2. Challenge Milestones */}
      <section className="panel" style={{ padding: '20px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px' }}>Challenge Milestones</h3>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '13px' }}>
              Progress benchmarks unlocked as overall challenge score increases
            </p>
          </div>
          <span className="muted" style={{ fontSize: '13px' }}>
            {milestones.filter((m) => m.reached).length} of {milestones.length} unlocked
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
          }}
        >
          {milestones.map((m) => (
            <div
              key={m.threshold}
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: m.reached ? 'color-mix(in srgb, var(--status-completed) 10%, transparent)' : 'rgba(255, 255, 255, 0.02)',
                border: `1px solid ${m.reached ? 'color-mix(in srgb, var(--status-completed) 35%, transparent)' : 'var(--border)'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                boxShadow: m.reached ? '0 0 16px color-mix(in srgb, var(--status-completed) 15%, transparent)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '18px', fontWeight: 700, color: m.reached ? 'var(--status-completed)' : 'var(--text)' }}>
                  {m.threshold}%
                </span>
                {m.reached ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: 'var(--status-completed)',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    <CheckCircle2 size={16} /> Reached
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Pending</span>
                )}
              </div>
              <small style={{ color: 'var(--muted)', fontSize: '11px' }}>
                {m.reached && m.reached_on ? `Unlocked on ${formatYmd(m.reached_on)}` : `Requires ${m.threshold}% completion`}
              </small>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Completion Trend Over Time (Chart) */}
      <section className="panel" style={{ padding: '24px' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '16px' }}>Completion Trend Over Time</h3>
          </div>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Weekly average completion percentage across elapsed challenge weeks
          </p>
        </div>

        {chartData.length > 0 ? (
          <>
            <div style={{ width: '100%', height: '260px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="weekLabel"
                    stroke="var(--muted)"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--muted)"
                    fontSize={12}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--text)',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => {
                      const num = typeof val === 'number' ? val : Number(val) || 0
                      return [`${num.toFixed(1)}%`, 'Completion Rate']
                    }}
                    labelFormatter={(label: unknown) => `Week ${String(label || '').replace('W', '')}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="percentage"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#analyticsTrendGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Text Summary Table for Accessibility */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {chartData.map((d) => (
                <div
                  key={d.weekLabel}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                  }}
                >
                  <span className="muted">Week {d.weekNumber}: </span>
                  <strong style={{ color: 'var(--text)' }}>{d.percentage.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
              No weekly breakdown data yet (first week has not elapsed).
            </p>
          </div>
        )}
      </section>

      {/* 4. Per-Activity Completion & Performance Breakdown */}
      <section className="panel" style={{ padding: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={18} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '16px' }}>Per-Activity Performance</h3>
          </div>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Cumulative logging volume and consistency scores per activity
          </p>
        </div>

        {analytics && analytics.activities_performance.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {analytics.activities_performance.map((act) => {
              const avgPct = act.average_daily_percentage
              const unitLabel =
                act.tracking_type === 'checkbox'
                  ? 'days checked'
                  : act.unit || (act.tracking_type === 'duration' ? 'min' : 'units')

              return (
                <article
                  key={act.activity_id}
                  style={{
                    padding: '16px 18px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <strong style={{ fontSize: '15px', color: 'var(--text)' }}>
                        {act.name}
                      </strong>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--muted)',
                          background: 'rgba(255, 255, 255, 0.04)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        Target: {act.daily_target} {act.unit || (act.tracking_type === 'duration' ? 'min' : '')} / day
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="required-badge">
                        {act.is_required ? 'Required' : 'Optional'}
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: avgPct >= 80 ? 'var(--status-completed)' : avgPct >= 50 ? 'var(--status-partial)' : 'var(--text)',
                        }}
                      >
                        {avgPct.toFixed(1)}% avg
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="progress-track" style={{ height: '6px' }}>
                    <span
                      style={{
                        width: `${Math.min(100, Math.max(0, avgPct))}%`,
                        background:
                          avgPct >= 80
                            ? 'var(--status-completed)'
                            : avgPct >= 50
                            ? 'var(--progress-gradient)'
                            : 'var(--status-pending)',
                      }}
                    />
                  </div>

                  {/* Sub metrics */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--muted)',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}
                  >
                    <span>
                      <strong style={{ color: 'var(--text)' }}>{act.days_completed}</strong> days target met
                    </span>
                    <span>
                      Total logged: <strong style={{ color: 'var(--text)' }}>{act.total_logged}</strong> {unitLabel}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: '13px' }}>
            No activity performance data recorded yet.
          </p>
        )}
      </section>
    </div>
  )
}

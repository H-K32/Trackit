import { useEffect } from 'react'
import { Flame, Users, X } from 'lucide-react'

interface StreakBuddiesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function StreakBuddiesModal({ isOpen, onClose }: StreakBuddiesModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-buddies-title"
    >
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px' }}
      >
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '11px',
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
              }}
            >
              <Users size={20} />
            </div>
            <div>
              <span className="eyebrow">COMING SOON</span>
              <h2 id="streak-buddies-title" style={{ fontSize: '18px', margin: 0 }}>
                Streak Buddies is coming soon
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 24px 24px' }}>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              color: 'var(--muted)',
              margin: '0 0 18px',
            }}
          >
            Invite friends to a track, see each other&apos;s daily progress, and keep each other&apos;s streaks alive.
          </p>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            >
              <Users
                size={16}
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              />
              <span>Invite friends to your active challenge tracks</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            >
              <Flame
                size={16}
                style={{ color: 'var(--status-partial)', flexShrink: 0 }}
              />
              <span>View daily logs together to stay consistent and accountable</span>
            </div>
          </div>

          <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="button primary"
              onClick={onClose}
              style={{ minWidth: '96px' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StreakBuddiesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="button secondary"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <Users size={16} />
      <span>Streak Buddies</span>
      <span className="badge-soon">Soon</span>
    </button>
  )
}

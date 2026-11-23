import { useEffect, useState } from 'react'
import { CloudLightning } from 'lucide-react'
import { subscribeSlowNotice } from '../../api/client.ts'

export function ServerWakeNotice() {
  const [isSlow, setIsSlow] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    return subscribeSlowNotice((slow, msg) => {
      setIsSlow(slow)
      if (msg) {
        setMessage(msg)
      }
    })
  }, [])

  if (!isSlow) {
    return null
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4), 0 0 20px color-mix(in srgb, var(--accent) 20%, transparent)',
        borderRadius: '12px',
        padding: '12px 20px',
        color: 'var(--text)',
        fontSize: '14px',
        fontWeight: 600,
        backdropFilter: 'blur(12px)',
        animation: 'slide-down 0.25s ease-out',
      }}
    >
      <CloudLightning size={18} style={{ color: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
      <span>{message || 'Waking up the server, this can take up to a minute on the first visit'}</span>
      <style>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      `}</style>
    </aside>
  )
}

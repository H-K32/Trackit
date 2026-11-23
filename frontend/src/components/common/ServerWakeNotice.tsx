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
        background: 'linear-gradient(135deg, rgba(21, 31, 53, 0.98), rgba(27, 41, 66, 0.98))',
        border: '1px solid rgba(100, 139, 255, 0.4)',
        boxShadow: '0 12px 36px rgba(3, 7, 18, 0.5), 0 0 20px rgba(100, 139, 255, 0.2)',
        borderRadius: '12px',
        padding: '12px 20px',
        color: '#E0EAFF',
        fontSize: '14px',
        fontWeight: 600,
        backdropFilter: 'blur(12px)',
        animation: 'slide-down 0.25s ease-out',
      }}
    >
      <CloudLightning size={18} style={{ color: '#648BFF', animation: 'pulse 1.5s infinite' }} />
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

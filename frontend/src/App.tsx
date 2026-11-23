import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { TrackWorkspace } from './features/tracks/TrackWorkspace'
import { ActivityDetail } from './features/activities/ActivityDetail'
import { Analytics } from './features/analytics/Analytics'
import { ProfileSettings } from './features/settings/ProfileSettings'
import { AuthPage } from './features/auth/AuthPage'
import { useLocalTracks } from './hooks/useLocalTracks'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ServerWakeNotice } from './components/common/ServerWakeNotice'
import './theme.css'

function AppContent() {
  const [tracks, setTracks] = useLocalTracks()
  const { isAuthenticated, isInitializing } = useAuth()

  if (isInitializing) {
    return (
      <div
        style={{
          display: 'grid',
          minHeight: '100vh',
          placeItems: 'center',
          background: 'var(--color-bg, #0B0F17)',
          color: 'var(--color-text, #F8FAFC)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid rgba(100, 139, 255, 0.2)',
              borderTopColor: '#648BFF',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: 'var(--color-text-muted, #94A3B8)', fontSize: '14px', margin: 0 }}>
            Restoring session...
          </p>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }

  return (
    <>
      <ServerWakeNotice />
      <Routes>
        <Route
          path="/auth"
          element={
            isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage />
            )
          }
        />
        <Route
          element={
            isAuthenticated ? (
              <AppShell />
            ) : (
              <Navigate to="/auth" replace />
            )
          }
        >
          <Route
            index
            element={
              <Dashboard
                tracks={tracks}
                onCreate={(track) => setTracks([...tracks, track])}
              />
            }
          />
          <Route
            path="tracks/:trackId"
            element={
              <TrackWorkspace tracks={tracks} onUpdate={setTracks} />
            }
          />
          <Route
            path="tracks/:trackId/activities/:activityId"
            element={
              <ActivityDetail tracks={tracks} onUpdate={setTracks} />
            }
          />
          <Route path="analytics" element={<Analytics />} />
          <Route path="profile" element={<ProfileSettings mode="profile" />} />
          <Route path="settings" element={<ProfileSettings mode="settings" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

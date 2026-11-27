import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { TrackWorkspace } from './features/tracks/TrackWorkspace'
import { ActivityDetail } from './features/activities/ActivityDetail'
import { Analytics } from './features/analytics/Analytics'
import { PlansPage } from './features/plans/PlansPage'
import { ProfileSettings } from './features/settings/ProfileSettings'
import { AuthPage } from './features/auth/AuthPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ServerWakeNotice } from './components/common/ServerWakeNotice'
import './theme.css'

function AppContent() {
  const { isAuthenticated, isInitializing } = useAuth()

  if (isInitializing) {
    return (
      <div
        style={{
          display: 'grid',
          minHeight: '100vh',
          placeItems: 'center',
          background: 'var(--midnight)',
          color: 'var(--text)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>
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
          <Route index element={<Dashboard />} />
          <Route path="tracks/:trackId" element={<TrackWorkspace />} />
          <Route path="tracks/:trackId/activities/:activityId" element={<ActivityDetail />} />
          <Route path="plans" element={<PlansPage />} />
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
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App

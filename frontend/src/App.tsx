import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { Dashboard } from './features/dashboard/Dashboard'
import { TrackWorkspace } from './features/tracks/TrackWorkspace'
import { ActivityDetail } from './features/activities/ActivityDetail'
import { Analytics } from './features/analytics/Analytics'
import { ProfileSettings } from './features/settings/ProfileSettings'
import { AuthPage } from './features/auth/AuthPage'
import { useLocalTracks } from './hooks/useLocalTracks'
import './theme.css'

function App() {
  const [tracks, setTracks] = useLocalTracks()
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
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
        <Route path="/auth" element={<AuthPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

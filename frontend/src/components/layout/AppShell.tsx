import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, LayoutDashboard, LogOut, Settings, Target } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export function AppShell({ onLogout }: { onLogout?: () => void } = {}) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const nav = [
    { to:'/', label:'Dashboard', icon:LayoutDashboard },
    { to:'/analytics', label:'Analytics', icon:BarChart3 },
  ]

  const handleLogout = async () => {
    if (onLogout) {
      onLogout()
    }
    await logout()
    navigate('/auth', { replace: true })
  }

  const displayName = user?.name || 'Alex Kim'
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AK'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate('/')}>
          <span className="brand-mark"><Target size={20}/></span>
          <span>TrackIt</span>
        </button>
        <nav className="side-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18}/>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="nav-item">
            <Settings size={18}/>
            <span>Settings</span>
          </NavLink>
          <NavLink to="/profile" className="profile">
            <span className="avatar">{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{user?.email || 'Personal workspace'}</small>
            </span>
          </NavLink>
          <button
            type="button"
            className="nav-item"
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <LogOut size={18}/>
            <span>Log out</span>
          </button>
        </div>
      </aside>
      <main className="main"><Outlet/></main>
    </div>
  )
}

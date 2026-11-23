import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, LayoutDashboard, LogOut, Menu, Palette, Settings, Target, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

export function AppShell({ onLogout }: { onLogout?: () => void } = {}) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { currentThemeInfo, cycleTheme } = useTheme()
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)

  const nav = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ]

  const handleLogout = async () => {
    setIsMobileDrawerOpen(false)
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
      {/* 1. Mobile Top Bar with Hamburger & Theme Switcher (visible on mobile only) */}
      <header className="mobile-top-bar">
        <button
          type="button"
          className="icon-button"
          onClick={() => setIsMobileDrawerOpen(true)}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        <button
          type="button"
          className="mobile-top-bar-brand"
          onClick={() => navigate('/')}
        >
          <span className="brand-mark" style={{ width: '32px', height: '32px', borderRadius: '10px' }}>
            <Target size={17} />
          </span>
          <span>TrackIt</span>
        </button>

        <div className="mobile-top-bar-actions">
          <button
            type="button"
            className="icon-button"
            onClick={cycleTheme}
            title={`Current theme: ${currentThemeInfo.name}. Tap to switch.`}
            aria-label="Switch theme"
          >
            <Palette size={18} />
          </button>
          <NavLink
            to="/profile"
            className="avatar"
            style={{ width: '32px', height: '32px', fontSize: '11px' }}
          >
            {initials}
          </NavLink>
        </div>
      </header>

      {/* 2. Mobile Backdrop Overlay */}
      <div
        className={`sidebar-backdrop ${isMobileDrawerOpen ? 'open' : ''}`}
        onClick={() => setIsMobileDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* 3. Navigation Sidebar (Desktop persistent, Mobile slide-out SIDE drawer) */}
      <aside className={`sidebar ${isMobileDrawerOpen ? 'open' : ''}`}>
        {/* Mobile Drawer Header with Close Button */}
        <div className="sidebar-drawer-header">
          <div className="brand" onClick={() => { setIsMobileDrawerOpen(false); navigate('/') }}>
            <span className="brand-mark"><Target size={20} /></span>
            <span>TrackIt</span>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setIsMobileDrawerOpen(false)}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Desktop Brand Header */}
        <button className="brand desktop-brand" onClick={() => navigate('/')}>
          <span className="brand-mark"><Target size={20} /></span>
          <span>TrackIt</span>
        </button>

        {/* Primary Navigation Links */}
        <nav className="side-nav">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setIsMobileDrawerOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Secondary Bottom Links & Profile */}
        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item"
            onClick={cycleTheme}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              width: '100%',
            }}
            title="Click to cycle themes"
          >
            <Palette size={18} />
            <span style={{ fontSize: '13px' }}>Theme: {currentThemeInfo.name}</span>
          </button>

          <NavLink
            to="/settings"
            className="nav-item"
            onClick={() => setIsMobileDrawerOpen(false)}
          >
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>

          <NavLink
            to="/profile"
            className="profile"
            onClick={() => setIsMobileDrawerOpen(false)}
          >
            <span className="avatar">{initials}</span>
            <span>
              <strong>{displayName}</strong>
              <small>{user?.email || 'Personal workspace'}</small>
            </span>
          </NavLink>

          <button
            type="button"
            className="nav-item logout-button"
            onClick={handleLogout}
          >
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, LayoutDashboard, Settings, Target } from 'lucide-react'

export function AppShell() {
  const navigate = useNavigate()
  const nav = [
    { to:'/', label:'Dashboard', icon:LayoutDashboard },
    { to:'/analytics', label:'Analytics', icon:BarChart3 },
  ]
  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>navigate('/')}><span className="brand-mark"><Target size={20}/></span><span>TrackIt</span></button>
      <nav className="side-nav">
        {nav.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/' } className={({isActive})=>`nav-item ${isActive?'active':''}`}><Icon size={18}/><span>{label}</span></NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/settings" className="nav-item"><Settings size={18}/><span>Settings</span></NavLink>
        <NavLink to="/profile" className="profile"><span className="avatar">AK</span><span><strong>Alex Kim</strong><small>Personal workspace</small></span></NavLink>
      </div>
    </aside>
    <main className="main"><Outlet/></main>
  </div>
}

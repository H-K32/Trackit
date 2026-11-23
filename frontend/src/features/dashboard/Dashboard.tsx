import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, Clock3, Plus, Target } from 'lucide-react'
import type { Track } from '../../types'
import { addDays, formatDate, trackProgress } from '../../utils'

export function CreateTrackModal({open,onClose,onCreate}:{open:boolean,onClose:()=>void,onCreate:(track:Track)=>void}) {
  const [name,setName]=useState('Chess Track')
  const [description,setDescription]=useState('Improve my chess through consistent daily practice.')
  const [startDate,setStartDate]=useState('2026-11-19')
  const [duration,setDuration]=useState(100)
  if(!open)return null
  const submit=(e:React.FormEvent)=>{e.preventDefault(); onCreate({id:`track-${Date.now()}`,name,description,category:'Chess',startDate,durationDays:duration,status:'In Progress',activities:[]})}
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">NEW TRACK</span><h2>Create a Chess Track</h2></div><button className="icon-button" onClick={onClose}>×</button></div>
    <form onSubmit={submit}>
      <label>Track name<input value={name} onChange={e=>setName(e.target.value)} required/></label>
      <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} required/></label>
      <div className="form-grid"><label>Start date<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} required/></label><label>Duration (days)<input type="number" min="1" value={duration} onChange={e=>setDuration(Number(e.target.value))} required/></label></div>
      <div className="end-date"><CalendarDays size={16}/><span>End date</span><strong>{addDays(startDate,duration)}</strong></div>
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary">Create Track</button></div>
    </form>
  </div></div>
}

export function Dashboard({tracks,onCreate}:{tracks:Track[],onCreate:(track:Track)=>void}) {
  const [open,setOpen]=useState(false); const navigate=useNavigate()
  const latest=tracks.flatMap(t=>t.activities.flatMap(a=>a.records.map(r=>({...r,activity:a.name,track:t.name})))).sort((a,b)=>b.date.localeCompare(a.date))[0]
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">THURSDAY, NOVEMBER 19</p><h1>Good morning, Alex</h1><p className="muted">You’re building momentum. Keep going.</p></div><button className="button primary" onClick={()=>setOpen(true)}><Plus size={18}/>Create Track</button></header>
    <section><div className="section-heading"><div><h2>My Tracks</h2><p>{tracks.length} active track{tracks.length===1?'':'s'}</p></div></div>
      {tracks.length ? <div className="track-grid">{tracks.map(track=>{const progress=trackProgress(track.activities); return <article className="track-card" key={track.id} onClick={()=>navigate(`/tracks/${track.id}`)}>
        <div className="track-card-top"><span className="category"><span className="knight">♞</span> {track.category}</span><span className="status"><i/> {track.status}</span></div>
        <h3>{track.name}</h3><p className="track-desc">{track.description}</p>
        <div className="track-meta"><span><CalendarDays size={15}/>{formatDate(track.startDate)}</span><span><Clock3 size={15}/>{track.durationDays} days</span></div>
        <div className="progress-row"><span>Progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div>
        <div className="track-footer"><span>{track.activities.length} activities</span><ChevronRight size={18}/></div>
      </article>})}</div> : <button className="empty-track" onClick={()=>setOpen(true)}><span><Plus/></span><strong>Create your first track</strong><small>Start a focused journey</small></button>}
    </section>
    <section className="bottom-grid"><div className="panel"><div className="section-heading"><div><h2>Recent activity</h2><p>Your latest updates</p></div></div>{latest?<div className="activity-row"><span className="activity-icon"><Target size={17}/></span><div><strong>{latest.activity}</strong><p>{latest.track}</p></div><span className="activity-value">{latest.completed?'Completed':`${latest.value} logged`}</span></div>:<p className="muted">No activity recorded yet.</p>}</div>
      <div className="panel summary-panel"><h2>This week</h2><div className="week-days">{['M','T','W','T','F','S','S'].map((d,i)=><div key={i} className={i<4?'done':''}><span>{d}</span><i>{i<4?'✓':''}</i></div>)}</div></div></section>
    <CreateTrackModal open={open} onClose={()=>setOpen(false)} onCreate={t=>{onCreate(t);setOpen(false);navigate(`/tracks/${t.id}`)}}/>
  </div>
}

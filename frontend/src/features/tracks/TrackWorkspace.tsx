import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Check, ChevronRight, CirclePlus, Gamepad2, Puzzle, ScanSearch, Target } from 'lucide-react'
import type { Track, Activity } from '../../types'
import { activityProgress, addDays, trackProgress } from '../../utils'

function ActivityIcon({template}:{template:string}) {
  const Icon = template.includes('Puzzle') ? Puzzle : template.includes('Game') ? Gamepad2 : template.includes('Opening') || template.includes('Endgame') ? ScanSearch : template.includes('Reading') || template.includes('Lesson') ? BookOpen : Target
  return <Icon size={18}/>
}

export function TrackWorkspace({tracks,onUpdate}:{tracks:Track[],onUpdate:(tracks:Track[])=>void}) {
  const {trackId}=useParams(); const navigate=useNavigate(); const track=tracks.find(t=>t.id===trackId)
  if(!track)return <div className="page"><h2>Track not found</h2></div>
  const progress=trackProgress(track.activities)
  const addActivity=(template:string)=>{const activity:Activity={id:`activity-${Date.now()}`,trackId:track.id,name:template,description:'A daily practice activity.',template:template as Activity['template'],trackingType:'numeric',unit:'minutes',dailyTarget:15,required:false,records:[{date:'2026-11-19',value:0,completed:false}]}; onUpdate(tracks.map(t=>t.id===track.id?{...t,activities:[...t.activities,activity]}:t)); navigate(`/tracks/${track.id}/activities/${activity.id}`)}
  return <div className="page workspace">
    <button className="back-button" onClick={()=>navigate('/')}><ArrowLeft size={16}/>Dashboard</button>
    <header className="workspace-header"><div><span className="category"><span className="knight">♞</span> Chess Track</span><h1>{track.name}</h1><p className="muted">{track.description}</p></div><button className="button primary" onClick={()=>addActivity('Custom')}><CirclePlus size={18}/>Add Activity</button></header>
    <section className="stats-grid"><div className="stat-card"><span>Overall progress</span><strong>{progress}%</strong><div className="progress-track"><span style={{width:`${progress}%`}}/></div></div><div className="stat-card"><span>Days completed</span><strong>10</strong><small>of {track.durationDays} days</small></div><div className="stat-card"><span>Days remaining</span><strong>{Math.max(0,track.durationDays-10)}</strong><small>Ends {addDays(track.startDate,track.durationDays)}</small></div></section>
    <section><div className="section-heading"><div><h2>Activities</h2><p>{track.activities.length} activities in this track</p></div></div>
      <div className="activity-grid">{track.activities.map(a=>{const ap=activityProgress(a); return <article className="activity-card" key={a.id} onClick={()=>navigate(`/tracks/${track.id}/activities/${a.id}`)}><div className="activity-card-head"><span className="activity-icon"><ActivityIcon template={a.template} /></span><span className={`tiny-status ${ap===100?'complete':''}`}>{ap===100?<Check size={13}/>:null}{ap===100?'Complete':'In progress'}</span></div><h3>{a.name}</h3><p>{a.description}</p><div className="progress-row"><span>Today</span><strong>{a.records.at(-1)?.value||0}/{a.dailyTarget} {a.unit}</strong></div><div className="progress-track"><span style={{width:`${ap}%`}}/></div><button className="card-link">Open activity <ChevronRight size={16}/></button></article>})}</div>
    </section>
    <section className="bottom-grid"><div className="panel"><h2>Track calendar</h2><div className="calendar-strip">{Array.from({length:14},(_,i)=><div key={i} className={i===9?'today':''}><small>{i+6}</small><i className={i<10?'filled':''}/></div>)}</div></div><div className="panel"><h2>Recent activity</h2>{track.activities.slice(-3).reverse().map(a=><div className="activity-row compact" key={a.id}><span className="activity-icon"><ActivityIcon template={a.template}/></span><div><strong>{a.name}</strong><p>Today</p></div><span className="activity-value">{a.records.at(-1)?.value||0}/{a.dailyTarget}</span></div>)}</div></section>
  </div>
}

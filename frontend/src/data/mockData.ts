import type { Track } from '../types'

export const initialTracks: Track[] = [{
  id: 'chess-100', name: '100 Day Chess Challenge',
  description: 'Build consistency, improve calculation, and deepen my chess understanding.',
  category: 'Chess', startDate: '2026-11-10', durationDays: 100, status: 'In Progress',
  activities: [
    { id:'puzzles', trackId:'chess-100', name:'Chess Puzzles', description:'Sharpen calculation and pattern recognition.', template:'Chess Puzzles', trackingType:'numeric', unit:'puzzles', dailyTarget:5, required:true, records:[{date:'2026-11-19',value:3,completed:false,notes:''},{date:'2026-11-18',value:5,completed:true}] },
    { id:'games', trackId:'chess-100', name:'Chess Games', description:'Play focused classical or rapid games.', template:'Chess Games', trackingType:'numeric', unit:'games', dailyTarget:2, required:true, records:[{date:'2026-11-19',value:2,completed:true,wins:1,losses:1,draws:0,notes:'Good patience in the endgame.'},{date:'2026-11-18',value:1,completed:false,wins:1,losses:0,draws:0}] },
    { id:'opening', trackId:'chess-100', name:'Opening Study', description:'Learn one line deeply and review key ideas.', template:'Opening Study', trackingType:'numeric', unit:'minutes', dailyTarget:15, required:false, records:[{date:'2026-11-19',value:10,completed:false,duration:10,opening:'Sicilian Najdorf'},{date:'2026-11-18',value:20,completed:true,duration:20,opening:'Sicilian Najdorf'}] },
    { id:'analysis', trackId:'chess-100', name:'Game Analysis', description:'Review games and document lessons.', template:'Game Analysis', trackingType:'numeric', unit:'games', dailyTarget:1, required:true, records:[{date:'2026-11-19',value:1,completed:true,gamesReviewed:1,mistakes:3,notes:'Missed a knight fork and equalized poorly.'}] },
    { id:'reading', trackId:'chess-100', name:'Chess Reading', description:'Read chess books and theory.', template:'Chess Reading', trackingType:'checkbox', unit:'session', dailyTarget:1, required:false, records:[{date:'2026-11-18',value:1,completed:true,notes:'My System, chapter 4'}] }
  ]
}]

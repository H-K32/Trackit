import { useEffect, useState } from 'react'
import { initialTracks } from '../data/mockData'
import type { Track } from '../types'

const KEY = 'trackit-tracks'

export function useLocalTracks() {
  const [tracks, setTracks] = useState<Track[]>(() => {
    try { const saved = localStorage.getItem(KEY); return saved ? JSON.parse(saved) : initialTracks } catch { return initialTracks }
  })
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(tracks)), [tracks])
  return [tracks, setTracks] as const
}

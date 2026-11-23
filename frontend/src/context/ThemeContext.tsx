/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'

export type ThemeId = 'midnight-cobalt' | 'obsidian' | 'forest-night' | 'sunset-plum' | 'clean-light'

export interface ThemeInfo {
  id: ThemeId
  name: string
  tagline: string
  description: string
  colorScheme: 'dark' | 'light'
  metaColor: string
  swatches: {
    midnight: string
    surface: string
    card: string
    accent: string
    accent2: string
    text: string
    muted: string
    border: string
    statusCompleted: string
  }
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'midnight-cobalt',
    name: 'Midnight Cobalt',
    tagline: 'Default Theme',
    description: 'Cosmic dark navy with electric cobalt and violet accents.',
    colorScheme: 'dark',
    metaColor: '#0B1020',
    swatches: {
      midnight: '#0B1020',
      surface: '#10182B',
      card: '#151F35',
      accent: '#648BFF',
      accent2: '#A78BFA',
      text: '#F1F5FC',
      muted: '#9AA9C2',
      border: '#293750',
      statusCompleted: '#36C9A5',
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'OLED Black',
    description: 'True pure black surface designed for OLED screens and battery saving.',
    colorScheme: 'dark',
    metaColor: '#000000',
    swatches: {
      midnight: '#000000',
      surface: '#0A0A0A',
      card: '#111111',
      accent: '#8AB4FF',
      accent2: '#C4B5FD',
      text: '#F5F5F5',
      muted: '#A1A1AA',
      border: '#2A2A2A',
      statusCompleted: '#36C9A5',
    },
  },
  {
    id: 'forest-night',
    name: 'Forest Night',
    tagline: 'Emerald & Lime',
    description: 'Deep woodland green with bright lime accent and teal highlights.',
    colorScheme: 'dark',
    metaColor: '#07130F',
    swatches: {
      midnight: '#07130F',
      surface: '#0C1D17',
      card: '#10261E',
      accent: '#A3E635',
      accent2: '#2DD4BF',
      text: '#ECFDF5',
      muted: '#8FB5A5',
      border: '#234537',
      statusCompleted: '#36C9A5',
    },
  },
  {
    id: 'sunset-plum',
    name: 'Sunset Plum',
    tagline: 'Aubergine & Pink',
    description: 'Rich plum background paired with sunset pink and warm orange gradients.',
    colorScheme: 'dark',
    metaColor: '#140B1F',
    swatches: {
      midnight: '#140B1F',
      surface: '#1C1129',
      card: '#251735',
      accent: '#F472B6',
      accent2: '#FB923C',
      text: '#FAF5FF',
      muted: '#B7A6CC',
      border: '#46315F',
      statusCompleted: '#36C9A5',
    },
  },
  {
    id: 'clean-light',
    name: 'Clean Light',
    tagline: 'High-Contrast Light',
    description: 'Bright off-white canvas with royal blue and vivid purple accents.',
    colorScheme: 'light',
    metaColor: '#F6F8FC',
    swatches: {
      midnight: '#F6F8FC',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      accent: '#3B63E0',
      accent2: '#7C5CE6',
      text: '#0F172A',
      muted: '#5B6B85',
      border: '#D8DFEB',
      statusCompleted: '#0F9F7E',
    },
  },
]

const THEME_STORAGE_KEY = 'trackit_theme'
const VALID_THEMES: ThemeId[] = ['midnight-cobalt', 'obsidian', 'forest-night', 'sunset-plum', 'clean-light']

export function getStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved && (VALID_THEMES as string[]).includes(saved)) {
      return saved as ThemeId
    }
  } catch {
    // Fall back to default if storage is inaccessible
  }
  return 'midnight-cobalt'
}

export function applyThemeToDocument(themeId: ThemeId): void {
  try {
    const themeInfo = THEMES.find((t) => t.id === themeId) || THEMES[0]
    document.documentElement.setAttribute('data-theme', themeId)
    document.documentElement.style.colorScheme = themeInfo.colorScheme

    let metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta')
      metaThemeColor.name = 'theme-color'
      document.head.appendChild(metaThemeColor)
    }
    metaThemeColor.content = themeInfo.metaColor
  } catch {
    // Non-blocking in non-browser or restricted environments
  }
}

interface ThemeContextType {
  theme: ThemeId
  setTheme: (newTheme: ThemeId) => void
  cycleTheme: () => void
  currentThemeInfo: ThemeInfo
  themes: ThemeInfo[]
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    const initial = getStoredTheme()
    applyThemeToDocument(initial)
    return initial
  })

  const setTheme = useCallback((newTheme: ThemeId) => {
    if (!VALID_THEMES.includes(newTheme)) return
    setThemeState(newTheme)
    applyThemeToDocument(newTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme)
    } catch {
      // Storage unavailable fallback
    }
  }, [])

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const currentIndex = VALID_THEMES.indexOf(current)
      const nextTheme = VALID_THEMES[(currentIndex + 1) % VALID_THEMES.length]
      applyThemeToDocument(nextTheme)
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      } catch {
        // Storage unavailable fallback
      }
      return nextTheme
    })
  }, [])

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  const currentThemeInfo = useMemo(() => {
    return THEMES.find((t) => t.id === theme) || THEMES[0]
  }, [theme])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      cycleTheme,
      currentThemeInfo,
      themes: THEMES,
    }),
    [theme, setTheme, cycleTheme, currentThemeInfo]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { getStoredToken, setStoredToken, clearStoredToken, setUnauthorizedHandler } from '../api/client.ts'
import { me as apiMe, login as apiLogin, register as apiRegister, logout as apiLogout } from '../api/auth.ts'
import type { User, LoginPayload, RegisterPayload } from '../api/auth.ts'

interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isInitializing: boolean
  login: (payload: LoginPayload) => Promise<User>
  register: (payload: RegisterPayload) => Promise<User>
  logout: () => Promise<void>
  updateUser: (updatedUser: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [user, setUser] = useState<User | null>(null)
  const [isInitializing, setIsInitializing] = useState<boolean>(() => Boolean(getStoredToken()))

  // Configure 401 unauthorized handler
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredToken()
      setToken(null)
      setUser(null)
    })
    return () => {
      setUnauthorizedHandler(null)
    }
  }, [])

  // Restore session on app load if token exists
  useEffect(() => {
    let isMounted = true
    const currentToken = getStoredToken()

    if (!currentToken) {
      return
    }

    apiMe()
      .then((userData) => {
        if (isMounted) {
          setUser(userData)
          setToken(currentToken)
        }
      })
      .catch((error) => {
        if (isMounted) {
          // If 401 or session invalid, clear token
          if (error?.status === 401) {
            clearStoredToken()
            setToken(null)
            setUser(null)
          } else {
            // Network failure or cold-start timeout
            clearStoredToken()
            setToken(null)
            setUser(null)
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsInitializing(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const login = async (payload: LoginPayload): Promise<User> => {
    const data = await apiLogin(payload)
    setStoredToken(data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }

  const register = async (payload: RegisterPayload): Promise<User> => {
    const data = await apiRegister(payload)
    setStoredToken(data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser)
  }

  const logout = async (): Promise<void> => {
    try {
      await apiLogout()
    } catch {
      // Proceed with clearing local state even if logout endpoint fails
    } finally {
      clearStoredToken()
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch {
        // Ignore storage restrictions
      }
      setToken(null)
      setUser(null)
    }
  }

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isInitializing,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, token, isInitializing]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

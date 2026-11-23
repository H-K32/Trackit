import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CloudLightning, Eye, EyeOff, LockKeyhole, Mail, Target, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.tsx'
import { subscribeSlowNotice } from '../../api/client.ts'
import type { ApiError } from '../../api/client.ts'

type AuthMode = 'login' | 'register'
type FieldErrors = Record<string, string[]>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, isAuthenticated } = useAuth()

  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isSlow, setIsSlow] = useState(false)
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [serverMessage, setServerMessage] = useState('')

  // Cold-start notification listener
  useEffect(() => {
    return subscribeSlowNotice((slow) => {
      setIsSlow(slow)
    })
  }, [])

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const resetFeedback = () => {
    setClientErrors({})
    setServerErrors({})
    setServerMessage('')
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setPassword('')
    setShowPassword(false)
    resetFeedback()
  }

  const validate = () => {
    const errors: FieldErrors = {}
    if (mode === 'register' && !name.trim()) errors.name = ['Name is required.']
    if (!email.trim()) errors.email = ['Email is required.']
    else if (!emailPattern.test(email)) errors.email = ['Enter a valid email address.']
    if (!password) errors.password = ['Password is required.']
    else if (password.length < 8) errors.password = ['Password must be at least 8 characters.']
    setClientErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    resetFeedback()
    if (!validate()) return

    setLoading(true)
    try {
      if (mode === 'register') {
        const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          timezone: detectedTimezone,
        })
      } else {
        await login({
          email: email.trim(),
          password,
        })
      }
      navigate('/', { replace: true })
    } catch (error: unknown) {
      const apiErr = error as ApiError
      setServerMessage(apiErr.message || 'Something went wrong. Please try again.')
      setServerErrors(apiErr.errors || {})
    } finally {
      setLoading(false)
    }
  }

  const fieldError = (field: string) => clientErrors[field]?.[0] || serverErrors[field]?.[0]

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="TrackIt introduction">
        <div className="auth-brand"><span className="brand-mark"><Target size={20}/></span><span>TrackIt</span></div>
        <div className="auth-visual-copy">
          <p className="eyebrow">PERSONAL PERFORMANCE</p>
          <h1>Build consistency,<br/><span>one day at a time.</span></h1>
          <p>Turn ambitious goals into a clear daily practice.</p>
        </div>
        <div className="auth-orbit"><span/><span/><i/></div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Log in</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>

          <div className="auth-heading">
            <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'START YOUR JOURNEY'}</p>
            <h2>{mode === 'login' ? 'Log in to TrackIt' : 'Create your account'}</h2>
            <p>{mode === 'login' ? 'Continue where you left off.' : 'Set up your personal workspace.'}</p>
          </div>

          {serverMessage && <div className="auth-alert" role="alert"><strong>{serverMessage}</strong></div>}

          {isSlow && (
            <div
              className="auth-notice"
              role="status"
              style={{
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CloudLightning size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span>Waking up the server, this can take a minute...</span>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="auth-name">Name</label>
                <div className={`auth-input ${fieldError('name') ? 'has-error' : ''}`}>
                  <UserRound size={18}/>
                  <input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Alex Kim" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(fieldError('name'))}/>
                </div>
                {fieldError('name') && <small className="field-error">{fieldError('name')}</small>}
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <div className={`auth-input ${fieldError('email') ? 'has-error' : ''}`}>
                <Mail size={18}/>
                <input id="auth-email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fieldError('email'))}/>
              </div>
              {fieldError('email') && <small className="field-error">{fieldError('email')}</small>}
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className={`auth-input ${fieldError('password') ? 'has-error' : ''}`}>
                <LockKeyhole size={18}/>
                <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Minimum 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fieldError('password'))}/>
                <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
              </div>
              {fieldError('password') && <small className="field-error">{fieldError('password')}</small>}
            </div>

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? <><span className="loading-dot"/>Please wait...</> : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">{mode === 'login' ? "New to TrackIt?" : 'Already have an account?'} <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Log in'}</button></p>
        </div>
      </section>
    </main>
  )
}

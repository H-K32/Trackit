import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, Mail, Target, UserRound } from 'lucide-react'
import { login, register } from '../../api/auth.ts'

type AuthMode = 'login' | 'register'
type FieldErrors = Record<string, string[]>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface AuthPageProps {
  onAuthSuccess?: (user?: unknown) => void
}

export function AuthPage({ onAuthSuccess }: AuthPageProps = {}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [serverMessage, setServerMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const resetFeedback = () => {
    setClientErrors({})
    setServerErrors({})
    setServerMessage('')
    setSuccessMessage('')
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
      let result
      if (mode === 'register') {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        result = await register({ name: name.trim(), email: email.trim(), password, timezone })
      } else {
        result = await login({ email: email.trim(), password })
      }
      setSuccessMessage(result.message)
      localStorage.setItem('trackit_auth', 'true')
      if (result.user) {
        localStorage.setItem('trackit_user', JSON.stringify(result.user))
      }
      if (onAuthSuccess) {
        onAuthSuccess(result.user)
      }
      setTimeout(() => {
        navigate('/')
      }, 400)
    } catch (error: unknown) {
      const laravelError = error as { message?: string; errors?: FieldErrors }
      setServerMessage(laravelError.message || 'Something went wrong. Please try again.')
      setServerErrors(laravelError.errors || {})
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
          {successMessage && <div className="auth-success" role="status"><strong>{successMessage}</strong></div>}

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

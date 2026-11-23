import { client } from './client.ts'

export interface User {
  id: number
  name: string
  email: string
  timezone: string
  email_verified_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  timezone?: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface LogoutResponse {
  message: string
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const timezone = payload.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return client.post<AuthResponse>('/register', {
    name: payload.name,
    email: payload.email,
    password: payload.password,
    timezone,
  }, { skipAuth: true })
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  return client.post<AuthResponse>('/login', {
    email: payload.email,
    password: payload.password,
  }, { skipAuth: true })
}

export async function logout(): Promise<LogoutResponse> {
  return client.post<LogoutResponse>('/logout')
}

export async function me(): Promise<User> {
  return client.get<User>('/me')
}

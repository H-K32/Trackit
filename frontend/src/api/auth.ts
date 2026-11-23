export interface RegisterPayload {
  name: string
  email: string
  password: string
  timezone: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface LaravelAuthError {
  message?: string
  errors?: Record<string, string[]>
}

const wait = (ms = 650) => new Promise((resolve) => setTimeout(resolve, ms))

export async function register(payload: RegisterPayload) {
  await wait()
  if (payload.email.toLowerCase() === 'taken@example.com') {
    throw {
      message: 'Please correct the highlighted fields.',
      errors: { email: ['This email address is already registered.'] },
    } satisfies LaravelAuthError
  }
  return {
    message: 'Account created successfully.',
    user: { name: payload.name, email: payload.email, timezone: payload.timezone },
  }
}

export async function login(payload: LoginPayload) {
  await wait()
  if (payload.email.toLowerCase() === 'invalid@example.com') {
    throw {
      message: 'Unable to sign in.',
      errors: { email: ['These credentials do not match our records.'] },
    } satisfies LaravelAuthError
  }
  return { message: 'Signed in successfully.', user: { email: payload.email } }
}

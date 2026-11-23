/**
 * Trackit API Client
 *
 * Handles base URL configuration, default headers, Bearer authentication,
 * response JSON parsing, normalized errors, 401 handling, and cold-start notifications.
 */

export interface ApiError {
  status: number
  message: string
  errors?: Record<string, string[]>
  code?: string
}

const TOKEN_KEY = 'trackit_token'

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Ignore localStorage access restrictions
  }
}

export function clearStoredToken(): void {
  setStoredToken(null)
}

// ── 401 Unauthorized callback ────────────────────────────────────────────────

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

function notifyUnauthorized(): void {
  if (unauthorizedHandler) {
    try {
      unauthorizedHandler()
    } catch {
      // Ignore handler errors
    }
  }
}

// ── Cold start (slow request) listeners ──────────────────────────────────────

type SlowNoticeListener = (isSlow: boolean, message?: string) => void
const slowNoticeListeners = new Set<SlowNoticeListener>()

export function subscribeSlowNotice(listener: SlowNoticeListener): () => void {
  slowNoticeListeners.add(listener)
  return () => {
    slowNoticeListeners.delete(listener)
  }
}

function notifySlowNotice(isSlow: boolean, message?: string): void {
  for (const listener of slowNoticeListeners) {
    try {
      listener(isSlow, message)
    } catch {
      // Ignore listener error
    }
  }
}

// ── Core request function ───────────────────────────────────────────────────

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  skipAuth?: boolean
}

function getBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl && typeof envUrl === 'string') {
    return envUrl.replace(/\/+$/, '')
  }
  return 'http://localhost/api'
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const baseUrl = getBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  let urlString = `${baseUrl}${cleanPath}`
  if (options.params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value))
      }
    }
    const query = searchParams.toString()
    if (query) {
      urlString += (urlString.includes('?') ? '&' : '?') + query
    }
  }

  const headers = new Headers(options.headers)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  if (!options.skipAuth && !headers.has('Authorization')) {
    const token = getStoredToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }

  let body: BodyInit | null | undefined = undefined
  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === 'string' || options.body instanceof FormData || options.body instanceof Blob) {
      body = options.body as BodyInit
    } else {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
      body = JSON.stringify(options.body)
    }
  }

  // 90s timeout for cold start waking, 5s notification
  const controller = new AbortController()
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort())
  }

  let didNotifySlow = false
  const slowTimer = setTimeout(() => {
    didNotifySlow = true
    notifySlowNotice(true, 'Waking up the server, this can take a minute...')
  }, 5000)

  const timeoutTimer = setTimeout(() => {
    controller.abort()
  }, 90000)

  try {
    const response = await fetch(urlString, {
      ...options,
      headers,
      body,
      signal: controller.signal,
    })

    clearTimeout(slowTimer)
    clearTimeout(timeoutTimer)
    if (didNotifySlow) {
      notifySlowNotice(false)
    }

    // Parse JSON if available
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')
    const data = isJson ? await response.json() : null

    if (!response.ok) {
      if (response.status === 401) {
        clearStoredToken()
        notifyUnauthorized()
      }

      const normalizedError: ApiError = {
        status: response.status,
        message: data?.message || (response.status === 401 ? 'Unauthenticated.' : `Request failed with status ${response.status}`),
        errors: data?.errors,
        code: data?.code,
      }
      throw normalizedError
    }

    return data as T
  } catch (error: unknown) {
    clearTimeout(slowTimer)
    clearTimeout(timeoutTimer)
    if (didNotifySlow) {
      notifySlowNotice(false)
    }

    // Already normalized ApiError
    if (typeof error === 'object' && error !== null && 'status' in error && 'message' in error) {
      throw error as ApiError
    }

    // Timeout (AbortError)
    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError: ApiError = {
        status: 408,
        message: 'The server took too long to respond (timed out after 90 seconds). Please try again.',
      }
      throw timeoutError
    }

    // Generic network / connection error
    const message = error instanceof Error ? error.message : 'Unable to connect to the server. Please check your network connection.'
    const networkError: ApiError = {
      status: 0,
      message,
    }
    throw networkError
  }
}

export const client = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

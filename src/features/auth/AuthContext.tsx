import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export interface AuthUser {
  id: string
  email: string
  displayName: string | null
}

interface AuthState {
  user: AuthUser | null
  /** True until the first `/api/auth/me` settles, so the UI can avoid flashing. */
  loading: boolean
  register: (input: { email: string; password: string; displayName?: string; claimTripId?: string }) => Promise<void>
  login: (input: { email: string; password: string; claimTripId?: string }) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Reads the API's error message, falling back to something a person can act on.
 *
 * The endpoints deliberately return human-readable messages ("Email or password
 * is incorrect"), so showing the server's own text is better than a generic
 * string — but a network failure has no body, hence the fallback.
 */
async function messageFrom(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error !== '' ? body.error : fallback
  } catch {
    return fallback
  }
}

async function postJson(url: string, body: unknown, fallback: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The session is an httpOnly cookie, so it must be sent with the request.
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
  } catch {
    // Distinguish "couldn't reach the server" from "server said no" — the user
    // can act on the first (check connection) but not on a generic failure.
    throw new Error('Could not reach the server. Check your connection and try again.')
  }
  if (!res.ok) throw new Error(await messageFrom(res, fallback))
  return res
}

/**
 * Holds the signed-in user for the whole app.
 *
 * On mount it asks the server who the user is rather than trusting anything in
 * localStorage: the session lives in an httpOnly cookie that JavaScript cannot
 * read, which is exactly what makes an XSS bug unable to steal it.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : { user: null }))
      .then((body: { user?: AuthUser | null }) => {
        if (!cancelled) setUser(body.user ?? null)
      })
      .catch(() => {
        // A failed identity check means "treat as signed out", never an error
        // screen — the app is fully usable without an account.
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const register = useCallback<AuthState['register']>(async (input) => {
    const res = await postJson('/api/auth/register', input, 'Could not create your account.')
    const body = (await res.json()) as { user: AuthUser }
    setUser(body.user)
  }, [])

  const login = useCallback<AuthState['login']>(async (input) => {
    const res = await postJson('/api/auth/login', input, 'Could not sign you in.')
    const body = (await res.json()) as { user: AuthUser }
    setUser(body.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } finally {
      // Clear locally even if the request failed: the user asked to sign out,
      // and leaving them looking signed in is worse than a stale cookie.
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, register, login, logout }),
    [user, loading, register, login, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** @throws If used outside {@link AuthProvider} — a wiring mistake, not a runtime state. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

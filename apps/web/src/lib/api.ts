/**
 * API fetch wrapper for apps/web.
 *
 * - Attaches the in-memory access token as a Bearer header on every request.
 * - Automatically attempts a silent token refresh on 401 and retries once.
 * - Falls back to clearing the token on a failed refresh; callers handle redirect.
 *
 * Access tokens are stored in module scope (in-memory only — cleared on page reload).
 * The auth context re-initialises them via a silent refresh call on mount.
 */

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

type ApiFetchOptions = RequestInit & {
  /** Internal flag — prevents infinite refresh loops. */
  _retry?: boolean;
};

/**
 * Fetch wrapper that prepends /api/v1, attaches the Bearer token,
 * and silently refreshes on 401.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { _retry, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...rest,
    headers,
    credentials: 'include', // send refresh_token httpOnly cookie
  });

  if (res.status === 401 && !_retry) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return apiFetch(path, { ...options, _retry: true });
    }
  }

  return res;
}

/**
 * Attempt to refresh the access token using the httpOnly refresh_token cookie.
 * Returns true if a new access token was obtained.
 */
export async function silentRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const data = (await res.json()) as { accessToken: string };
      setAccessToken(data.accessToken);
      return true;
    }
  } catch {
    // network error — treat as failed refresh
  }
  setAccessToken(null);
  return false;
}

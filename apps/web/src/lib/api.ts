/**
 * Module-level access token storage + fetch wrapper.
 *
 * The access token is kept in a module-level variable (not React state) so it
 * is available to non-component code (e.g. API helpers) without needing a
 * context reference.
 *
 * apiFetch:
 *  - Prepends /api/v1 to the path.
 *  - Attaches the current Bearer token if present.
 *  - On 401: attempts a silent refresh, retries once.
 */

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export async function silentRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { accessToken?: string };
    if (body.accessToken) {
      setAccessToken(body.accessToken);
      return body.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers as HeadersInit);

  if (_accessToken) {
    headers.set('Authorization', `Bearer ${_accessToken}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    const newToken = await silentRefresh();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      return fetch(`${BASE}/api/v1${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return res;
}

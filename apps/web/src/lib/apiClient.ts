/**
 * Typed API client (PH1-T05). Wraps fetch with:
 *  - /api/v1 base path (same-origin via Next rewrite)
 *  - Bearer access token held in memory only
 *  - httpOnly refresh cookie (credentials: 'same-origin')
 *  - refresh-on-401 exactly once per request (Section 9)
 *  - x-aptiva-client header required by cookie-authenticated mutations
 *  - envelope unwrapping and typed ApiError mapping
 */

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  data: T;
  meta?: { requestId?: string };
}

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthSession | null> | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();
export function onTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emitTokenChange(): void {
  listeners.forEach((l) => l());
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Test hook — production code must not call this. */
export function setAccessTokenForTest(token: string | null): void {
  accessToken = token;
}

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthSession {
  accessToken: string;
  user: SessionUser;
}

function setAccessToken(token: string | null): void {
  accessToken = token;
  emitTokenChange();
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ErrorEnvelope;
    return new ApiError(
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? `Request failed (${res.status})`,
      res.status,
      body.error?.details,
    );
  } catch {
    return new ApiError('INTERNAL', `Request failed (${res.status})`, res.status);
  }
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'x-aptiva-client': 'web',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** Calls E-003 to restore/rotate the session from the refresh cookie. */
export async function refreshSession(): Promise<AuthSession | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await rawFetch('/auth/refresh', { method: 'POST' });
      if (!res.ok) return null;
      const body = (await res.json()) as Envelope<AuthSession>;
      setAccessToken(body.data.accessToken);
      return body.data;
    } catch {
      return null;
    }
  })();
  const session = await refreshPromise;
  refreshPromise = null;
  if (!session) setAccessToken(null);
  return session;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const doFetch = () =>
    rawFetch(path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(auth && accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    });

  let res = await doFetch();
  if (res.status === 401 && auth) {
    // Refresh once, then retry exactly once.
    const session = await refreshSession();
    if (!session) throw await parseError(res);
    res = await doFetch();
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const envelope = (await res.json()) as Envelope<T>;
  return envelope.data;
}

// ------------------------------------------------------------- auth calls

export function login(email: string, password: string): Promise<AuthSession> {
  return api<AuthSession>('/auth/login', { method: 'POST', body: { email, password } }).then(
    (session) => {
      setAccessToken(session.accessToken);
      return session;
    },
  );
}

export function register(payload: {
  email: string;
  password: string;
  gradYear?: number | undefined;
  branch?: string | undefined;
  college?: string | undefined;
  consentVersion: string;
}): Promise<AuthSession> {
  return api<AuthSession>('/auth/register', { method: 'POST', body: payload }).then((s) => {
    setAccessToken(s.accessToken);
    return s;
  });
}

export async function logout(): Promise<void> {
  try {
    await api<null>('/auth/logout', { method: 'POST', auth: accessToken !== null });
  } finally {
    setAccessToken(null);
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getAccessToken, setAccessTokenForTest } from './apiClient';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const okEnvelope = (data: unknown) => ({ data, meta: { requestId: 'r1' } });

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessTokenForTest(null);
});

describe('apiClient', () => {
  it('unwraps the success envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, okEnvelope({ status: 'ok' }))),
    );
    await expect(api<{ status: string }>('/health', { auth: false })).resolves.toEqual({
      status: 'ok',
    });
  });

  it('maps error envelopes to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'nope' } }),
        ),
    );
    const err = await api('/me', { auth: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('UNAUTHENTICATED');
    expect((err as ApiError).status).toBe(401);
  });

  it('refreshes once on 401 and retries the request', async () => {
    setAccessTokenForTest('stale-token');
    const fetchMock = vi
      .fn()
      // 1) original request → 401
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
      )
      // 2) refresh → new token
      .mockResolvedValueOnce(
        jsonResponse(
          200,
          okEnvelope({
            accessToken: 'fresh-token',
            user: { id: 'u', email: 'e', role: 'student', emailVerified: true },
          }),
        ),
      )
      // 3) retried request → 200
      .mockResolvedValueOnce(jsonResponse(200, okEnvelope({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);

    const result = await api<{ ok: boolean }>('/me');
    expect(result).toEqual({ ok: true });
    expect(getAccessToken()).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The retried call carried the fresh token.
    const retryHeaders = fetchMock.mock.calls[2]?.[1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('does not retry when refresh fails', async () => {
    setAccessTokenForTest('stale-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'dead' } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBeNull();
  });
});

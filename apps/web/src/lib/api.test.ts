import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, setApiToken } from './api.ts';
import { ApiError } from './api.ts';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiRequest', () => {
  it('unwraps { data } envelopes', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ data: { id: 'p1' } }),
      })),
    );
    await expect(apiRequest<{ id: string }>('/api/projects')).resolves.toEqual({ id: 'p1' });
  });

  it('returns health payloads without a data wrapper', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({ status: 'ok', service: 'dbt-scheduler' }),
      })),
    );
    await expect(apiRequest('/api/health')).resolves.toEqual({
      status: 'ok',
      service: 'dbt-scheduler',
    });
  });

  it('throws ApiError from error envelopes', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 401,
        ok: false,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } }),
      })),
    );
    const error = apiRequest('/api/projects');
    await expect(error).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Missing token',
    });
    await expect(error).rejects.toBeInstanceOf(ApiError);
  });

  it('attaches a bearer token from localStorage', async () => {
    vi.stubGlobal('window', { localStorage: memoryStorage() });
    setApiToken('local-token');
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ status: 'ok' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/api/health');
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer local-token');
  });
});

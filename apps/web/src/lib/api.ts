import type {
  EnqueueResult,
  HealthStatus,
  JobLog,
  JobRun,
  Project,
  Schedule,
  SystemStatus,
  Worker,
} from './types.ts';

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const TOKEN_KEY = 'dbt-scheduler.api-token';

export function getApiToken(): string | undefined {
  const value = window.localStorage.getItem(TOKEN_KEY);
  return value === null || value.length === 0 ? undefined : value;
}

export function setApiToken(token: string | undefined): void {
  if (token === undefined || token.length === 0) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

interface Envelope<T> {
  data: T;
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getApiToken();
  const headers = new Headers(init.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token !== undefined) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json().catch(() => ({}))) as Envelope<T> & ErrorBody;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_ERROR',
      payload.error?.message ?? `Request failed (${response.status})`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload as T;
}

export const api = {
  health: () => apiRequest<HealthStatus>('/api/health'),
  status: () => apiRequest<SystemStatus>('/api/system/status'),
  projects: () => apiRequest<Project[]>('/api/projects'),
  createProject: (body: Record<string, unknown>) =>
    apiRequest<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteProject: (id: string) => apiRequest<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  updateProject: (id: string, body: Record<string, unknown>) =>
    apiRequest<Project>(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  schedules: (projectId?: string) =>
    apiRequest<Schedule[]>(
      projectId === undefined ? '/api/schedules' : `/api/schedules?projectId=${projectId}`,
    ),
  createSchedule: (body: Record<string, unknown>) =>
    apiRequest<Schedule>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateSchedule: (id: string, body: Record<string, unknown>) =>
    apiRequest<Schedule>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  runSchedule: (id: string) =>
    apiRequest<EnqueueResult>(`/api/schedules/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  enableSchedule: (id: string) =>
    apiRequest<Schedule>(`/api/schedules/${id}/enable`, { method: 'POST' }),
  disableSchedule: (id: string) =>
    apiRequest<Schedule>(`/api/schedules/${id}/disable`, { method: 'POST' }),
  deleteSchedule: (id: string) => apiRequest<void>(`/api/schedules/${id}`, { method: 'DELETE' }),
  jobs: (query: { status?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (query.status !== undefined) {
      params.set('status', query.status);
    }
    if (query.limit !== undefined) {
      params.set('limit', String(query.limit));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return apiRequest<JobRun[]>(`/api/jobs${suffix}`);
  },
  job: (id: string) => apiRequest<JobRun>(`/api/jobs/${id}`),
  jobLogs: (id: string) => apiRequest<JobLog[]>(`/api/jobs/${id}/logs`),
  cancelJob: (id: string) => apiRequest<JobRun>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  workers: () => apiRequest<Worker[]>('/api/workers'),
};

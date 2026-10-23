import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import type { JobStatus } from './types.ts';

const pollMs = 4_000;

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    retry: 0,
    refetchInterval: 10_000,
  });
}

export function useSystemStatus() {
  return useQuery({
    queryKey: ['system-status'],
    queryFn: api.status,
    refetchInterval: pollMs,
  });
}

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: api.projects });
}

export function useSchedules(projectId?: string) {
  return useQuery({
    queryKey: ['schedules', projectId ?? 'all'],
    queryFn: () => api.schedules(projectId),
    refetchInterval: pollMs,
  });
}

export function useJobs(status?: JobStatus) {
  return useQuery({
    queryKey: ['jobs', status ?? 'all'],
    queryFn: () => api.jobs({ ...(status === undefined ? {} : { status }), limit: 100 }),
    refetchInterval: pollMs,
  });
}

export function useJob(id: string | undefined) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => api.job(id ?? ''),
    enabled: id !== undefined && id.length > 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'RUNNING' || query.state.data?.status === 'QUEUED'
        ? 2_000
        : pollMs,
  });
}

export function useJobLogs(id: string | undefined, active: boolean) {
  return useQuery({
    queryKey: ['job-logs', id],
    queryFn: () => api.jobLogs(id ?? ''),
    enabled: id !== undefined && id.length > 0,
    refetchInterval: active ? 2_000 : false,
  });
}

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: api.workers,
    refetchInterval: pollMs,
  });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.updateProject(id, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['projects'] });
      await client.invalidateQueries({ queryKey: ['schedules'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useCreateSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createSchedule,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['schedules'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useUpdateSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.updateSchedule(id, body),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['schedules'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useRunSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.runSchedule,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['jobs'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useToggleSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? api.enableSchedule(id) : api.disableSchedule(id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['schedules'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useDeleteSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteSchedule,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['schedules'] });
      await client.invalidateQueries({ queryKey: ['jobs'] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

export function useCancelJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.cancelJob,
    onSuccess: async (_job, id) => {
      await client.invalidateQueries({ queryKey: ['jobs'] });
      await client.invalidateQueries({ queryKey: ['job', id] });
      await client.invalidateQueries({ queryKey: ['system-status'] });
    },
  });
}

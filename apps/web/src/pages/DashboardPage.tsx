import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import {
  cardClass,
  headingClass,
  linkClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui.ts';
import { formatDateTime, isWorkerOnline } from '../lib/format.ts';
import type { JobRun } from '../lib/types.ts';
import { useJobs, useProjects, useSchedules, useSystemStatus, useWorkers } from '../lib/queries.ts';

export function DashboardPage() {
  const status = useSystemStatus();
  const jobs = useJobs();
  const schedules = useSchedules();
  const projects = useProjects();
  const workers = useWorkers();
  const error = status.error ?? jobs.error ?? schedules.error ?? workers.error;

  const projectName = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
  const scheduleName = new Map((schedules.data ?? []).map((item) => [item.id, item.name]));
  const recent = (jobs.data ?? []).slice(0, 8);
  const running = (jobs.data ?? []).filter((job) => job.status === 'RUNNING');
  const failures = (jobs.data ?? []).filter((job) => job.status === 'FAILED').slice(0, 5);
  const upcoming = (schedules.data ?? [])
    .filter((item) => item.enabled && item.nextRunAt !== null)
    .sort((left, right) => (left.nextRunAt ?? '').localeCompare(right.nextRunAt ?? ''))
    .slice(0, 5);
  const onlineWorkers = (workers.data ?? []).filter((worker) =>
    isWorkerOnline(worker.status, worker.lastHeartbeat),
  ).length;

  return (
    <section>
      <PageHeader
        title="Dashboard"
        summary="Schedules, queue depth, failures, and worker health."
      />
      {error ? (
        <div className="mb-4">
          <ErrorBanner error={error} />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total schedules" value={schedules.data?.length ?? '—'} />
        <StatCard
          label="Active schedules"
          value={schedules.data?.filter((item) => item.enabled).length ?? '—'}
        />
        <StatCard label="Running jobs" value={status.data?.jobs.RUNNING ?? '—'} />
        <StatCard label="Queued jobs" value={status.data?.jobs.QUEUED ?? '—'} />
        <StatCard label="Successful jobs" value={status.data?.jobs.SUCCESS ?? '—'} />
        <StatCard label="Failed jobs" value={status.data?.jobs.FAILED ?? '—'} />
        <StatCard label="Workers online" value={workers.data ? onlineWorkers : '—'} />
        <StatCard label="Workers total" value={status.data?.workers.total ?? '—'} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel title="Currently running">
          <JobMiniTable
            jobs={running}
            projectName={projectName}
            scheduleName={scheduleName}
            empty="No jobs are running."
          />
        </Panel>
        <Panel title="Upcoming schedules">
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              body="Enable a schedule to see the next run time."
            />
          ) : (
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Schedule</th>
                  <th className={thClass}>Next run</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((item) => (
                  <tr key={item.id}>
                    <td className={tdClass}>{item.name}</td>
                    <td className={tdClass}>{formatDateTime(item.nextRunAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Recent jobs">
          <JobMiniTable
            jobs={recent}
            projectName={projectName}
            scheduleName={scheduleName}
            empty="No jobs yet. Create a schedule and use Run now."
          />
        </Panel>
        <Panel title="Recent failures">
          <JobMiniTable
            jobs={failures}
            projectName={projectName}
            scheduleName={scheduleName}
            empty="No failed jobs."
          />
        </Panel>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cardClass}>
      <h3 className={`mb-3 ${headingClass}`}>{title}</h3>
      {children}
    </section>
  );
}

function JobMiniTable({
  jobs,
  projectName,
  scheduleName,
  empty,
}: {
  jobs: JobRun[];
  projectName: Map<string, string>;
  scheduleName: Map<string, string>;
  empty: string;
}) {
  if (jobs.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>;
  }
  return (
    <table className={tableClass}>
      <thead>
        <tr>
          <th className={thClass}>Status</th>
          <th className={thClass}>Schedule</th>
          <th className={thClass}>Project</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td className={tdClass}>
              <Link className={`font-medium ${linkClass}`} to={`/jobs/${job.id}`}>
                <StatusBadge status={job.status} />
              </Link>
            </td>
            <td className={tdClass}>
              {scheduleName.get(job.scheduleId) ?? job.scheduleId.slice(0, 8)}
            </td>
            <td className={tdClass}>
              {projectName.get(job.projectId) ?? job.projectId.slice(0, 8)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

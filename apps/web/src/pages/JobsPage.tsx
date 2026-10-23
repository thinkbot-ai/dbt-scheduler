import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import {
  inputClass,
  labelClass,
  panelClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui.ts';
import { formatDateTime, formatDuration, shortSha } from '../lib/format.ts';
import { useJobs, useProjects, useSchedules } from '../lib/queries.ts';
import { JOB_STATUSES, type JobStatus } from '../lib/types.ts';

export function JobsPage() {
  const [status, setStatus] = useState<JobStatus | 'all'>('all');
  const jobs = useJobs(status === 'all' ? undefined : status);
  const projects = useProjects();
  const schedules = useSchedules();
  const projectName = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
  const scheduleName = new Map((schedules.data ?? []).map((item) => [item.id, item.name]));

  return (
    <section>
      <PageHeader
        title="Jobs"
        summary="Queue history. Open a job for logs, SHA, metrics, and cancel."
      />
      {jobs.error ? (
        <div className="mb-4">
          <ErrorBanner error={jobs.error} />
        </div>
      ) : null}
      <label className={`mb-4 block max-w-xs ${labelClass}`}>
        Status
        <select
          className={`${inputClass} mt-1`}
          value={status}
          onChange={(e) => setStatus(e.target.value as JobStatus | 'all')}
        >
          <option value="all">All</option>
          {JOB_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      {(jobs.data ?? []).length === 0 && !jobs.isLoading ? (
        <EmptyState title="No jobs" body="Run a schedule or wait for the next cron tick." />
      ) : (
        <div className={panelClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Status</th>
                <th className={thClass}>Schedule</th>
                <th className={thClass}>Project</th>
                <th className={thClass}>Trigger</th>
                <th className={thClass}>Queued</th>
                <th className={thClass}>Duration</th>
                <th className={thClass}>SHA</th>
              </tr>
            </thead>
            <tbody>
              {(jobs.data ?? []).map((job) => (
                <tr key={job.id}>
                  <td className={tdClass}>
                    <Link className="inline-flex" to={`/jobs/${job.id}`}>
                      <StatusBadge status={job.status} />
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {scheduleName.get(job.scheduleId) ?? job.scheduleId.slice(0, 8)}
                  </td>
                  <td className={tdClass}>
                    {projectName.get(job.projectId) ?? job.projectId.slice(0, 8)}
                  </td>
                  <td className={tdClass}>{job.triggerType}</td>
                  <td className={tdClass}>{formatDateTime(job.queuedAt)}</td>
                  <td className={tdClass}>{formatDuration(job.durationMs)}</td>
                  <td className={tdClass}>{shortSha(job.commitSha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

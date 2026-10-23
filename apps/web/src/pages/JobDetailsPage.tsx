import { Link, useParams } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { buttonClass, cardClass, eyebrowClass, headingClass, linkClass } from '../components/ui.ts';
import { formatDateTime, formatDuration, priorityLabel, shortSha } from '../lib/format.ts';
import { useCancelJob, useJob, useJobLogs, useProjects, useSchedules } from '../lib/queries.ts';

export function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const jobQuery = useJob(id);
  const job = jobQuery.data;
  const active = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  const logs = useJobLogs(id, active === true);
  const cancel = useCancelJob();
  const projects = useProjects();
  const schedules = useSchedules();
  const project = (projects.data ?? []).find((item) => item.id === job?.projectId);
  const schedule = (schedules.data ?? []).find((item) => item.id === job?.scheduleId);
  const canCancel = job?.status === 'QUEUED' || job?.status === 'RUNNING';

  return (
    <section>
      <PageHeader
        title="Job details"
        summary="Status, commit SHA, dbt metrics, and polled logs. Secrets are never shown."
        actions={
          <Link className={`text-sm font-medium ${linkClass}`} to="/jobs">
            Back to jobs
          </Link>
        }
      />
      {jobQuery.error ? (
        <div className="mb-4">
          <ErrorBanner error={jobQuery.error} />
        </div>
      ) : null}
      {cancel.error ? (
        <div className="mb-4">
          <ErrorBanner error={cancel.error} />
        </div>
      ) : null}
      {job === undefined && !jobQuery.isLoading ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">Job not found.</p>
      ) : null}
      {job ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <StatusBadge status={job.status} />
            {canCancel ? (
              <button
                className={buttonClass}
                type="button"
                disabled={cancel.isPending}
                onClick={() => {
                  void cancel.mutateAsync(job.id);
                }}
              >
                {job.status === 'QUEUED' ? 'Cancel' : 'Request cancel'}
              </button>
            ) : null}
            {job.cancelRequestedAt !== null ? (
              <span className="text-sm text-amber-800 dark:text-amber-400">
                Cancel requested {formatDateTime(job.cancelRequestedAt)}
              </span>
            ) : null}
          </div>
          <dl className={`mb-8 grid gap-3 sm:grid-cols-2 ${cardClass}`}>
            <Item label="Job ID" value={job.id} />
            <Item label="Project" value={project?.name ?? job.projectId} />
            <Item label="Schedule" value={schedule?.name ?? job.scheduleId} />
            <Item label="Trigger" value={job.triggerType} />
            <Item label="Priority" value={priorityLabel(job.priority)} />
            <Item label="Attempt" value={`${job.attempt} / ${job.maxAttempts}`} />
            <Item label="Worker" value={job.workerId ?? '—'} />
            <Item label="Commit SHA" value={shortSha(job.commitSha)} />
            <Item label="Branch" value={job.branch ?? '—'} />
            <Item
              label="dbt command"
              value={`${job.dbtCommand}${job.dbtArguments.length > 0 ? ` ${job.dbtArguments.join(' ')}` : ''}`}
            />
            <Item label="Queued" value={formatDateTime(job.queuedAt)} />
            <Item label="Started" value={formatDateTime(job.startedAt)} />
            <Item label="Finished" value={formatDateTime(job.finishedAt)} />
            <Item label="Duration" value={formatDuration(job.durationMs)} />
            <Item label="Exit code" value={job.exitCode === null ? '—' : String(job.exitCode)} />
            <Item label="Failure class" value={job.failureClass ?? '—'} />
            <Item label="Error" value={job.errorMessage ?? '—'} />
          </dl>
          {job.metrics ? (
            <div className={`mb-8 grid gap-3 sm:grid-cols-4 ${cardClass}`}>
              <Metric label="Models attempted" value={job.metrics.modelsAttempted} />
              <Metric label="Models successful" value={job.metrics.modelsSuccessful} />
              <Metric label="Models failed" value={job.metrics.modelsFailed} />
              <Metric label="Models skipped" value={job.metrics.modelsSkipped} />
              <Metric label="Tests passed" value={job.metrics.testsPassed} />
              <Metric label="Tests failed" value={job.metrics.testsFailed} />
            </div>
          ) : null}
          <h3 className={`mb-2 ${headingClass}`}>Logs</h3>
          {logs.error ? <ErrorBanner error={logs.error} /> : null}
          <pre className="max-h-[32rem] overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
            {(logs.data ?? [])
              .slice()
              .sort((left, right) => left.sequenceNumber - right.sequenceNumber)
              .map((line) => `[${line.stream}] ${line.message}`)
              .join('\n') || (logs.isLoading ? 'Loading logs…' : 'No log lines yet.')}
          </pre>
        </>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={eyebrowClass}>{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className={eyebrowClass}>{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

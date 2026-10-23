import { useState } from 'react';
import type { FormEvent } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { Modal } from '../components/Modal.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  buttonClass,
  cardClass,
  checkboxClass,
  disableButtonClass,
  enableButtonClass,
  inputClass,
  labelClass,
  mutedTextClass,
  panelClass,
  secondaryButtonClass,
  subtleTextClass,
  tableClass,
  tdClass,
  thClass,
  valueTextClass,
} from '../components/ui.ts';
import { formatDateTime, priorityLabel } from '../lib/format.ts';
import {
  useCreateSchedule,
  useDeleteSchedule,
  useProjects,
  useRunSchedule,
  useSchedules,
  useToggleSchedule,
  useUpdateSchedule,
} from '../lib/queries.ts';
import {
  CONCURRENCY_POLICIES,
  CRON_PRESETS,
  DBT_COMMANDS,
  JOB_PRIORITIES,
  TIMEZONES,
  type Schedule,
} from '../lib/types.ts';

function splitArgs(raw: string): string[] {
  return raw.trim().length === 0 ? [] : raw.trim().split(/\s+/);
}

/** Builds a "daily at this 24-hour time" cron expression from an <input type="time"> value. */
function buildDailyCron(time: string): string {
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText ?? 0);
  const minute = Number(minuteText ?? 0);
  return `${minute} ${hour} * * *`;
}

/** Reverses buildDailyCron/preset selection for an existing schedule being edited. */
function cronToPresetState(cron: string): { preset: string; customTime: string } {
  const knownPreset = CRON_PRESETS.find((item) => item.value === cron);
  if (knownPreset) {
    return { preset: knownPreset.value, customTime: '09:00' };
  }
  const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cron);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    const hour = match[2].padStart(2, '0');
    const minute = match[1].padStart(2, '0');
    return { preset: 'custom', customTime: `${hour}:${minute}` };
  }
  return { preset: 'custom', customTime: '09:00' };
}

export function SchedulesPage() {
  const projects = useProjects();
  const schedules = useSchedules();
  const create = useCreateSchedule();
  const run = useRunSchedule();
  const remove = useDeleteSchedule();
  const [togglingSchedule, setTogglingSchedule] = useState<Schedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<string>('*/5 * * * *');
  const [customTime, setCustomTime] = useState('09:00');
  const [timezone, setTimezone] = useState('UTC');
  const [dbtCommand, setDbtCommand] = useState<(typeof DBT_COMMANDS)[number]>('build');
  const [dbtArguments, setDbtArguments] = useState('');
  const [priority, setPriority] = useState<number>(JOB_PRIORITIES.NORMAL);
  const [policy, setPolicy] = useState<(typeof CONCURRENCY_POLICIES)[number]>('SKIP_IF_RUNNING');
  const [pollForChanges, setPollForChanges] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const projectName = new Map((projects.data ?? []).map((project) => [project.id, project.name]));
  const projectById = new Map((projects.data ?? []).map((project) => [project.id, project]));
  const cronExpression = preset === 'custom' ? buildDailyCron(customTime) : preset;
  const firstProject = projects.data?.[0];
  const selectedProjectId = projectId.length > 0 ? projectId : (firstProject?.id ?? '');
  const selectedProjectIsGit = projectById.get(selectedProjectId)?.sourceMode === 'git';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const selectedProject = projectId.length > 0 ? projectId : firstProject?.id;
    if (selectedProject === undefined) {
      return;
    }
    await create.mutateAsync({
      projectId: selectedProject,
      name,
      cronExpression,
      timezone,
      dbtCommand,
      dbtArguments: splitArgs(dbtArguments),
      priority,
      concurrencyPolicy: policy,
      pollForChanges: selectedProjectIsGit && pollForChanges,
    });
    setName('');
    setDbtArguments('');
    setPollForChanges(false);
  }

  return (
    <section>
      <PageHeader
        title="Schedules"
        summary="Cron, timezone, dbt command, priority, and concurrency policy. Run now enqueues a MANUAL job."
      />
      {schedules.error ? (
        <div className="mb-4">
          <ErrorBanner error={schedules.error} />
        </div>
      ) : null}
      {create.error ? (
        <div className="mb-4">
          <ErrorBanner error={create.error} />
        </div>
      ) : null}
      {run.error ? (
        <div className="mb-4">
          <ErrorBanner error={run.error} />
        </div>
      ) : null}
      {remove.error ? (
        <div className="mb-4">
          <ErrorBanner error={remove.error} />
        </div>
      ) : null}
      {runMessage ? (
        <p className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          {runMessage}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className={`mb-8 grid gap-3 sm:grid-cols-2 ${cardClass}`}>
        <label className={labelClass}>
          Project
          <select
            className={`${inputClass} mt-1`}
            value={projectId.length > 0 ? projectId : (firstProject?.id ?? '')}
            onChange={(e) => setProjectId(e.target.value)}
            required
          >
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Cron
          <select
            className={`${inputClass} mt-1`}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {CRON_PRESETS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
                {item.value !== 'custom' ? ` (${item.value})` : ''}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' ? (
          <label className={labelClass}>
            Time of day (24-hour, daily)
            <input
              className={`${inputClass} mt-1`}
              type="time"
              step={60}
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              required
            />
          </label>
        ) : null}
        <label className={labelClass}>
          Timezone
          <select
            className={`${inputClass} mt-1`}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          dbt command
          <select
            className={`${inputClass} mt-1`}
            value={dbtCommand}
            onChange={(e) => setDbtCommand(e.target.value as (typeof DBT_COMMANDS)[number])}
          >
            {DBT_COMMANDS.map((command) => (
              <option key={command} value={command}>
                {command}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Extra args (space-separated)
          <input
            className={`${inputClass} mt-1`}
            value={dbtArguments}
            onChange={(e) => setDbtArguments(e.target.value)}
            placeholder="--select model_name"
          />
        </label>
        <label className={labelClass}>
          Priority
          <select
            className={`${inputClass} mt-1`}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {Object.entries(JOB_PRIORITIES).map(([label, value]) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Concurrency policy
          <select
            className={`${inputClass} mt-1`}
            value={policy}
            onChange={(e) => setPolicy(e.target.value as (typeof CONCURRENCY_POLICIES)[number])}
          >
            {CONCURRENCY_POLICIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-center gap-2 ${labelClass} sm:col-span-2`}>
          <input
            className={checkboxClass}
            type="checkbox"
            checked={pollForChanges && selectedProjectIsGit}
            disabled={!selectedProjectIsGit}
            onChange={(e) => setPollForChanges(e.target.checked)}
          />
          Only run when the repo changes (cron above becomes the poll interval)
          {selectedProjectIsGit ? null : (
            <span className={`font-normal ${subtleTextClass}`}>
              (project source mode must be git)
            </span>
          )}
        </label>
        <div className="flex items-end">
          <button
            className={buttonClass}
            type="submit"
            disabled={create.isPending || (projects.data ?? []).length === 0}
          >
            {create.isPending ? 'Saving…' : 'Add schedule'}
          </button>
        </div>
      </form>

      {(schedules.data ?? []).length === 0 && !schedules.isLoading ? (
        <EmptyState title="No schedules" body="Create a project first, then add a cron schedule." />
      ) : (
        <div className={panelClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Project</th>
                <th className={thClass}>Cron</th>
                <th className={thClass}>Command</th>
                <th className={thClass}>Next run</th>
                <th className={thClass}>Enabled</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {(schedules.data ?? []).map((item) => (
                <tr key={item.id}>
                  <td className={tdClass}>
                    {item.name}
                    <div className={subtleTextClass}>
                      {priorityLabel(item.priority)} · {item.concurrencyPolicy}
                    </div>
                  </td>
                  <td className={tdClass}>
                    {projectName.get(item.projectId) ?? item.projectId.slice(0, 8)}
                  </td>
                  <td className={tdClass}>
                    {item.cronExpression}
                    <div className={subtleTextClass}>
                      {item.timezone}
                      {item.pollForChanges ? ' · polls for changes' : ''}
                    </div>
                  </td>
                  <td
                    className={`${tdClass} max-w-xs truncate`}
                    title={
                      item.dbtArguments.length > 0
                        ? `${item.dbtCommand} ${item.dbtArguments.join(' ')}`
                        : item.dbtCommand
                    }
                  >
                    {item.dbtCommand}
                    {item.dbtArguments.length > 0 ? ` ${item.dbtArguments.join(' ')}` : ''}
                  </td>
                  <td className={tdClass}>{formatDateTime(item.nextRunAt)}</td>
                  <td className={tdClass}>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${item.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                        aria-hidden
                      />
                      {item.enabled ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className={`${tdClass} space-x-2 whitespace-nowrap`}>
                    <button
                      className={buttonClass}
                      type="button"
                      disabled={run.isPending}
                      onClick={() => {
                        void run.mutateAsync(item.id).then((result) => {
                          if (result.outcome === 'QUEUED') {
                            setRunMessage(`Queued job ${result.job?.id ?? ''}`);
                            return;
                          }
                          setRunMessage(
                            result.reason ??
                              `Skipped (${result.existingJobId ?? 'already running'})`,
                          );
                        });
                      }}
                    >
                      Run now
                    </button>
                    <button
                      className={item.enabled ? disableButtonClass : enableButtonClass}
                      type="button"
                      onClick={() => setTogglingSchedule(item)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M12 2v6" />
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      </svg>
                      {item.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className={secondaryButtonClass}
                      type="button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => setEditingSchedule(item)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="h-4 w-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z"
                        />
                      </svg>
                    </button>
                    <button
                      className={secondaryButtonClass}
                      type="button"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete schedule ${item.name}?`)) {
                          void remove.mutateAsync(item.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {togglingSchedule ? (
        <ToggleScheduleModal
          schedule={togglingSchedule}
          onClose={() => setTogglingSchedule(null)}
        />
      ) : null}

      {editingSchedule ? (
        <EditScheduleModal
          schedule={editingSchedule}
          projectIsGit={projectById.get(editingSchedule.projectId)?.sourceMode === 'git'}
          onClose={() => setEditingSchedule(null)}
        />
      ) : null}
    </section>
  );
}

function ToggleScheduleModal({ schedule, onClose }: { schedule: Schedule; onClose: () => void }) {
  const toggle = useToggleSchedule();
  const willEnable = !schedule.enabled;

  async function onConfirm(): Promise<void> {
    await toggle.mutateAsync({ id: schedule.id, enabled: willEnable });
    onClose();
  }

  return (
    <Modal title={willEnable ? 'Enable schedule' : 'Disable schedule'} onClose={onClose}>
      {toggle.error ? (
        <div className="mb-4">
          <ErrorBanner error={toggle.error} />
        </div>
      ) : null}
      <p className={mutedTextClass}>
        {willEnable ? (
          <>
            Do you want to enable <strong className={valueTextClass}>{schedule.name}</strong>? It
            will resume creating queued jobs on its cron schedule.
          </>
        ) : (
          <>
            Do you want to disable <strong className={valueTextClass}>{schedule.name}</strong>? It
            will stop creating new scheduled jobs. Run now still works while disabled.
          </>
        )}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button className={secondaryButtonClass} type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className={willEnable ? enableButtonClass : disableButtonClass}
          type="button"
          disabled={toggle.isPending}
          onClick={() => void onConfirm()}
        >
          {toggle.isPending ? 'Saving…' : willEnable ? 'Enable' : 'Disable'}
        </button>
      </div>
    </Modal>
  );
}

function EditScheduleModal({
  schedule,
  projectIsGit,
  onClose,
}: {
  schedule: Schedule;
  projectIsGit: boolean;
  onClose: () => void;
}) {
  const update = useUpdateSchedule();
  const initialCron = cronToPresetState(schedule.cronExpression);
  const [name, setName] = useState(schedule.name);
  const [preset, setPreset] = useState(initialCron.preset);
  const [customTime, setCustomTime] = useState(initialCron.customTime);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [dbtCommand, setDbtCommand] = useState<(typeof DBT_COMMANDS)[number]>(schedule.dbtCommand);
  const [dbtArguments, setDbtArguments] = useState(schedule.dbtArguments.join(' '));
  const [priority, setPriority] = useState<number>(schedule.priority);
  const [policy, setPolicy] = useState<(typeof CONCURRENCY_POLICIES)[number]>(
    schedule.concurrencyPolicy,
  );
  const [pollForChanges, setPollForChanges] = useState(schedule.pollForChanges);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await update.mutateAsync({
      id: schedule.id,
      body: {
        name,
        cronExpression: preset === 'custom' ? buildDailyCron(customTime) : preset,
        timezone,
        dbtCommand,
        dbtArguments: splitArgs(dbtArguments),
        priority,
        concurrencyPolicy: policy,
        pollForChanges: projectIsGit && pollForChanges,
      },
    });
    onClose();
  }

  return (
    <Modal title={`Edit ${schedule.name}`} onClose={onClose}>
      {update.error ? (
        <div className="mb-4">
          <ErrorBanner error={update.error} />
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Name
          <input
            className={`${inputClass} mt-1`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Cron
          <select
            className={`${inputClass} mt-1`}
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
          >
            {CRON_PRESETS.map((item) => (
              <option key={item.label} value={item.value}>
                {item.label}
                {item.value !== 'custom' ? ` (${item.value})` : ''}
              </option>
            ))}
          </select>
        </label>
        {preset === 'custom' ? (
          <label className={labelClass}>
            Time of day (24-hour, daily)
            <input
              className={`${inputClass} mt-1`}
              type="time"
              step={60}
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
              required
            />
          </label>
        ) : null}
        <label className={labelClass}>
          Timezone
          <select
            className={`${inputClass} mt-1`}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          dbt command
          <select
            className={`${inputClass} mt-1`}
            value={dbtCommand}
            onChange={(e) => setDbtCommand(e.target.value as (typeof DBT_COMMANDS)[number])}
          >
            {DBT_COMMANDS.map((command) => (
              <option key={command} value={command}>
                {command}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Extra args (space-separated)
          <input
            className={`${inputClass} mt-1`}
            value={dbtArguments}
            onChange={(e) => setDbtArguments(e.target.value)}
            placeholder="--select model_name"
          />
        </label>
        <label className={labelClass}>
          Priority
          <select
            className={`${inputClass} mt-1`}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
          >
            {Object.entries(JOB_PRIORITIES).map(([label, value]) => (
              <option key={label} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Concurrency policy
          <select
            className={`${inputClass} mt-1`}
            value={policy}
            onChange={(e) => setPolicy(e.target.value as (typeof CONCURRENCY_POLICIES)[number])}
          >
            {CONCURRENCY_POLICIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className={`flex items-center gap-2 ${labelClass} sm:col-span-2`}>
          <input
            className={checkboxClass}
            type="checkbox"
            checked={pollForChanges && projectIsGit}
            disabled={!projectIsGit}
            onChange={(e) => setPollForChanges(e.target.checked)}
          />
          Only run when the repo changes (cron above becomes the poll interval)
          {projectIsGit ? null : (
            <span className={`font-normal ${subtleTextClass}`}>
              (project source mode must be git)
            </span>
          )}
        </label>
        <div className="flex items-end justify-end gap-2 sm:col-span-2">
          <button className={secondaryButtonClass} type="button" onClick={onClose}>
            Cancel
          </button>
          <button className={buttonClass} type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

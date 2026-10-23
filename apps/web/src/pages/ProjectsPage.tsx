import { useState } from 'react';
import type { FormEvent } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorBanner } from '../components/ErrorBanner.tsx';
import { Modal } from '../components/Modal.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  buttonClass,
  cardClass,
  inputClass,
  labelClass,
  panelClass,
  secondaryButtonClass,
  subtleTextClass,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui.ts';
import { formatDateTime } from '../lib/format.ts';
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '../lib/queries.ts';
import { PROJECT_SOURCE_MODES, type Project, type ProjectSourceMode } from '../lib/types.ts';

export function ProjectsPage() {
  const projects = useProjects();
  const create = useCreateProject();
  const remove = useDeleteProject();
  const [name, setName] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [sourceMode, setSourceMode] = useState<ProjectSourceMode>('git');
  const [branch, setBranch] = useState('main');
  const [projectPath, setProjectPath] = useState('.');
  const [environment, setEnvironment] = useState('prod');
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState('5');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const isLocalDirectory = sourceMode === 'local_directory';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await create.mutateAsync({
      name,
      repositoryUrl,
      sourceMode,
      ...(isLocalDirectory ? {} : { branch }),
      projectPath,
      environment,
      maxConcurrentJobs: Number(maxConcurrentJobs),
    });
    setName('');
    setRepositoryUrl('');
    setSourceMode('git');
    setBranch('main');
    setProjectPath('.');
    setEnvironment('prod');
    setMaxConcurrentJobs('5');
  }

  return (
    <section>
      <PageHeader
        title="Projects"
        summary="Register GitHub-hosted dbt projects and per-project running-job caps. Tokens stay in worker environment variables, not this form."
      />
      {projects.error ? (
        <div className="mb-4">
          <ErrorBanner error={projects.error} />
        </div>
      ) : null}
      {create.error ? (
        <div className="mb-4">
          <ErrorBanner error={create.error} />
        </div>
      ) : null}
      {remove.error ? (
        <div className="mb-4">
          <ErrorBanner error={remove.error} />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className={`mb-8 grid gap-3 sm:grid-cols-2 ${cardClass}`}>
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
          Source mode
          <select
            className={`${inputClass} mt-1`}
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as ProjectSourceMode)}
          >
            {PROJECT_SOURCE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'git' ? 'Git (clone per run)' : 'Local folder (run in place)'}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          {isLocalDirectory ? 'Local folder path' : 'Repository URL'}
          <input
            className={`${inputClass} mt-1`}
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            placeholder={
              isLocalDirectory
                ? 'C:\\path\\to\\dbt-project'
                : 'https://github.com/org/dbt-project.git'
            }
            required
          />
          {isLocalDirectory ? (
            <span className={`mt-1 block font-normal ${subtleTextClass}`}>
              The worker must run as a host process (npm run dev:worker), not Docker, to see this
              path. No git required — edits in this folder are picked up on the next run.
            </span>
          ) : null}
        </label>
        {isLocalDirectory ? null : (
          <label className={labelClass}>
            Branch
            <input
              className={`${inputClass} mt-1`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
            />
          </label>
        )}
        <label className={labelClass}>
          Project path
          <input
            className={`${inputClass} mt-1`}
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Environment
          <input
            className={`${inputClass} mt-1`}
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Max concurrent jobs
          <input
            className={`${inputClass} mt-1`}
            type="number"
            min={1}
            max={100}
            value={maxConcurrentJobs}
            onChange={(e) => setMaxConcurrentJobs(e.target.value)}
            required
          />
        </label>
        <div className="flex items-end">
          <button className={buttonClass} type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add project'}
          </button>
        </div>
      </form>

      {(projects.data ?? []).length === 0 && !projects.isLoading ? (
        <EmptyState
          title="No projects"
          body="Add a GitHub repository URL, branch, and dbt project path."
        />
      ) : (
        <div className={panelClass}>
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Name</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>Repository</th>
                <th className={thClass}>Branch</th>
                <th className={thClass}>Path</th>
                <th className={thClass}>Env</th>
                <th className={thClass}>Max jobs</th>
                <th className={thClass}>Updated</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {(projects.data ?? []).map((project) => (
                <tr key={project.id}>
                  <td className={tdClass}>{project.name}</td>
                  <td className={tdClass}>
                    {project.sourceMode === 'local_directory' ? 'local' : 'git'}
                  </td>
                  <td className={`${tdClass} max-w-xs truncate`} title={project.repositoryUrl}>
                    {project.repositoryUrl}
                  </td>
                  <td className={tdClass}>
                    {project.sourceMode === 'local_directory' ? '—' : project.branch}
                  </td>
                  <td className={tdClass}>{project.projectPath}</td>
                  <td className={tdClass}>{project.environment}</td>
                  <td className={tdClass}>
                    <ProjectCapCell project={project} />
                  </td>
                  <td className={tdClass}>{formatDateTime(project.updatedAt)}</td>
                  <td className={`${tdClass} space-x-2 whitespace-nowrap`}>
                    <button
                      className={secondaryButtonClass}
                      type="button"
                      aria-label={`Edit ${project.name}`}
                      onClick={() => setEditingProject(project)}
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
                        if (window.confirm(`Delete project ${project.name}?`)) {
                          void remove.mutateAsync(project.id);
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

      {editingProject ? (
        <EditProjectModal project={editingProject} onClose={() => setEditingProject(null)} />
      ) : null}
    </section>
  );
}

function ProjectCapCell({ project }: { project: Project }) {
  const update = useUpdateProject();
  const [value, setValue] = useState(String(project.maxConcurrentJobs));

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void update.mutateAsync({
          id: project.id,
          body: { maxConcurrentJobs: Number(value) },
        });
      }}
    >
      <input
        className={`${inputClass} w-20`}
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={`Max concurrent jobs for ${project.name}`}
      />
      <button className={secondaryButtonClass} type="submit" disabled={update.isPending}>
        Save
      </button>
    </form>
  );
}

function EditProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const update = useUpdateProject();
  const [name, setName] = useState(project.name);
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl);
  const [sourceMode, setSourceMode] = useState<ProjectSourceMode>(project.sourceMode);
  const [branch, setBranch] = useState(project.branch);
  const [projectPath, setProjectPath] = useState(project.projectPath);
  const [environment, setEnvironment] = useState(project.environment);
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(String(project.maxConcurrentJobs));
  const isLocalDirectory = sourceMode === 'local_directory';

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await update.mutateAsync({
      id: project.id,
      body: {
        name,
        repositoryUrl,
        sourceMode,
        ...(isLocalDirectory ? {} : { branch }),
        projectPath,
        environment,
        maxConcurrentJobs: Number(maxConcurrentJobs),
      },
    });
    onClose();
  }

  return (
    <Modal title={`Edit ${project.name}`} onClose={onClose}>
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
          Source mode
          <select
            className={`${inputClass} mt-1`}
            value={sourceMode}
            onChange={(e) => setSourceMode(e.target.value as ProjectSourceMode)}
          >
            {PROJECT_SOURCE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'git' ? 'Git (clone per run)' : 'Local folder (run in place)'}
              </option>
            ))}
          </select>
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          {isLocalDirectory ? 'Local folder path' : 'Repository URL'}
          <input
            className={`${inputClass} mt-1`}
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            required
          />
        </label>
        {isLocalDirectory ? null : (
          <label className={labelClass}>
            Branch
            <input
              className={`${inputClass} mt-1`}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
            />
          </label>
        )}
        <label className={labelClass}>
          Project path
          <input
            className={`${inputClass} mt-1`}
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Environment
          <input
            className={`${inputClass} mt-1`}
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            required
          />
        </label>
        <label className={labelClass}>
          Max concurrent jobs
          <input
            className={`${inputClass} mt-1`}
            type="number"
            min={1}
            max={100}
            value={maxConcurrentJobs}
            onChange={(e) => setMaxConcurrentJobs(e.target.value)}
            required
          />
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

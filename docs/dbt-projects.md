# dbt projects

Projects are usually GitHub-hosted dbt codebases, but a project can also point at a
plain local folder — see [Local folder projects](#local-folder-projects) below. The
scheduler does not contain models.

Required project fields (Phase 2 schema):

- repository URL
- branch
- dbt project path
- environment
- optional dbt-core / dbt-dremio version overrides

Execution path:

```text
Worker → Git workspace → dbt deps (optional) → dbt <command> <args> → dbt-dremio → Dremio
```

Never execute Dremio SQL from Node as the transformation mechanism.

## How the runner invokes dbt

`@dbt-scheduler/dbt-runner` exposes `runDbt(options)`. It spawns dbt with an
argv array and `shell: false`, so no argument can be reinterpreted as shell
syntax. Invalid commands or arguments throw `ValidationError` before any process
starts; runtime outcomes come back as a structured `DbtExecutionResult`.

| Concern      | Behavior                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| Commands     | Allowlisted: `debug`, `deps`, `compile`, `run`, `test`, `build`               |
| Interpreter  | `binArgs` supports `python -m dbt` style invocation                           |
| Logs         | stdout/stderr split, emitted to `onLog` as whole lines, capture is bounded    |
| Timeout      | `timeoutMs`, then SIGTERM and SIGKILL escalation                              |
| Cancellation | `AbortSignal`; only the dbt child is signalled, never the worker              |
| Environment  | Allowlist plus `DBT_` prefixed vars, so unrelated host secrets are not passed |
| Artifacts    | `target/run_results.json`, `manifest.json`, `catalog.json` when present       |

Failures are classified as `CANCELLED`, `CONFIGURATION_FAILURE`,
`TRANSIENT_FAILURE`, `DBT_FAILURE`, or `WORKER_FAILURE`. Only transient and
worker failures are retryable, so a bad profile does not burn all its attempts.

Artifacts are optional. `dbt debug` writes no `run_results.json`, and a corrupt
file is reported through `artifacts.parseError` rather than failing the run.

## Git workspace

`@dbt-scheduler/git-manager` prepares one working tree per job:

1. Resolve `/workspaces/job-<id>` under `WORKSPACE_ROOT` (path traversal is stripped).
2. Delete that directory if it already exists.
3. `git clone --branch <branch> --single-branch` with `shell: false`.
4. `git fetch` + `git reset --hard origin/<branch>` + `git clean -ffd`.
5. Record `git rev-parse HEAD` as `commitSha`.

Do not `git pull` on a dirty tree. Two jobs never share a checkout.

Sample local `profiles.yml` keys (placeholders only):

```yaml
my_project:
  target: dev
  outputs:
    dev:
      type: dremio
      threads: 4
      host: '<dremio-host>'
      port: 9047
      user: '<user>'
      password: '<secret>'
```

Do not commit real Dremio credentials.

## Local folder projects

There are three ways to point a project at a dbt codebase that lives in a folder on
the machine running the worker, instead of a remote GitHub repository. All three
require the worker to run as a **host process** (`npm run dev:worker`), **not**
inside Docker Compose — the Dockerized worker only mounts a named volume
(`workspaces:/workspaces` in `docker-compose.yml`) and cannot see a path like
`C:\Users\you\my-dbt-project`.

### 1. Git clone of a local path (`sourceMode: git`, works today)

Set **Repository URL** to the folder's absolute path (e.g.
`C:\Users\you\my-dbt-project`) and leave **Source mode** as `git`. The folder must
itself be a git repository (`git init` plus at least one commit) — every job still
does a real `git clone` of it into an isolated workspace under `WORKSPACE_ROOT`, so
only **committed** changes are picked up, and edits you haven't committed are
ignored on the next run.

### 2. In-place execution (`sourceMode: local_directory`)

Set **Source mode** to `local_directory` and **Repository URL** (labeled "Local
folder path" in the UI) to the folder's absolute path. No git repository is
required — dbt runs directly in that folder using whatever files are there right
now, so edits are picked up immediately with no commit step. There is no per-job
workspace isolation in this mode, so the scheduler only ever allows **one** job to
be `RUNNING` against a `local_directory` project at a time, regardless of
`maxConcurrentJobs` or a schedule's `ALLOW` concurrency policy — a second job just
waits in the queue until the first finishes. Job history shows a blank commit SHA
and branch for these runs, since there is no commit being tracked.

### 3. Git-change polling (`pollForChanges`, only for `sourceMode: git`)

A schedule with **Only run when the repo changes** checked does not run on every
cron tick. Instead, the cron expression becomes the _poll interval_: on each due
tick, the scheduler checks the project's current HEAD commit (via `git ls-remote`,
no clone) and only enqueues a job when that commit differs from the last one it
saw. This applies to both real remote repos and the git-clone-of-local-path mode
above (both are real git repos with real history); it is not available for
`local_directory` projects, since there is no commit history to poll there. A
transient git error (bad path, network issue) just skips that poll — it never
fails the whole scheduler tick.

Polling runs in the **scheduler** process, so a private GitHub repo needs
`GIT_TOKEN` set on the scheduler too, not just the worker (`docker-compose.yml`
sets it on both).

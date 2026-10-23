# ADR-005: Git workspace isolation

## Status

Accepted

## Context

dbt mutates `.git`, `target/`, and logs. Two workers sharing one checkout can corrupt the repository or mix artifacts across jobs. `git pull` on a dirty tree is not deterministic.

## Decision

Give each job an isolated workspace under `WORKSPACE_ROOT`, for example `/workspaces/job-<id>`. Prepare the repo with clone/fetch/checkout/reset rather than an opportunistic pull. Clean workspaces after a configurable retention period.

## Consequences

- Disk usage grows with concurrent jobs; cleanup is required.
- Clone time is paid per job or per warm cache keyed by project, never by a shared mutable directory.
- Commit SHA recorded on the job is the SHA actually executed.

# ADR-006: Job lease and worker heartbeat

## Status

Accepted

## Context

Workers crash, hosts disappear, and networks partition. A `RUNNING` row with no owner would block a schedule forever or, if blindly failed, hide in-flight work that might still be executing.

## Decision

Every running job has a lease. Workers heartbeat on an interval (default 15s). If the heartbeat is older than the lease timeout, the job becomes `STALE` and is recovered by policy (requeue, fail, or cancel) rather than automatically succeeding or failing.

## Consequences

- Heartbeat and lease columns are part of the job/worker schema.
- Clock skew between workers and Postgres must stay small; use database time where possible.
- Recovery code has to distinguish "worker died" from "dbt is still running on a slow host whose heartbeat failed".

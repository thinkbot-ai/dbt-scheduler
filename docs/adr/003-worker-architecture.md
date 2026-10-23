# ADR-003: Worker architecture

## Status

Accepted

## Context

Running dbt inside the API or scheduler would couple HTTP latency to long transformations and prevent independent scaling. One Node process with 100 in-memory cron jobs cannot be the architecture.

## Decision

Split the runtime into API, scheduler, and worker processes. Workers register, heartbeat, claim jobs, execute dbt, and update results. Concurrency is configured per worker (`WORKER_CONCURRENCY`) and globally (`MAX_CONCURRENT_JOBS`).

## Consequences

- Adding workers increases capacity without scheduler changes.
- The API stays request-driven and never runs dbt.
- Cancellation must kill the child dbt process, not the worker.
- Graceful shutdown must stop claiming and then finish or cancel in-flight work according to policy.

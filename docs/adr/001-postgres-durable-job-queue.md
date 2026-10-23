# ADR-001: PostgreSQL as the durable job queue

## Status

Accepted

## Context

The system must schedule and execute around 100 dbt jobs initially and remain able to grow toward 1,000+ jobs and multiple workers. Queue state must survive process crashes. Redis, Kafka, RabbitMQ, and dedicated workflow engines add operational cost before they are needed.

## Decision

Use PostgreSQL as both the system of record and the V1 job queue. Workers claim work with transactional `SELECT ... FOR UPDATE SKIP LOCKED`.

## Consequences

- One operational datastore for jobs, logs metadata, schedules, and workers.
- Queue semantics are explicit SQL rather than a hidden broker.
- Throughput is bounded by PostgreSQL; the claim interface can later be swapped for Redis/BullMQ without rewriting dbt execution.
- We must be disciplined about transactions, indexes, and lease recovery.

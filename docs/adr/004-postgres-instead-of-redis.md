# ADR-004: PostgreSQL instead of Redis for the initial queue

## Status

Accepted

## Context

Redis/BullMQ is a common Node job queue. For V1 it would add another stateful system, another failure domain, and another credential surface while PostgreSQL is already required.

## Decision

Do not introduce Redis in V1. Keep a queue port/interface in `packages/job-queue` so a Redis-backed implementation can be added later if PostgreSQL claiming becomes the bottleneck.

## Consequences

- Simpler local development: Postgres + Node.
- Must implement leases, SKIP LOCKED, and stale recovery ourselves.
- Operational playbooks stay focused on one database.

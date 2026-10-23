# ADR-002: dbt CLI instead of embedding dbt

## Status

Accepted

## Context

dbt already knows how to resolve refs, compile Jinja, run models, and talk to Dremio through dbt-dremio. Reimplementing any of that in Node would duplicate a mature engine and drift from upstream dbt.

## Decision

Workers execute dbt through `child_process.spawn` with a validated argv. The application is an orchestrator, not a transformation engine.

Pinned runtime versions:

- `dbt-core==1.10.23`
- `dbt-dremio==1.10.1` (compatible with dbt-core 1.10.x)

## Consequences

- Behavior matches local engineer workflows (`dbt build`, `dbt run --select ...`).
- The image must include Python, Git, dbt-core, and dbt-dremio.
- Argument validation is mandatory because we spawn processes.
- Artifact parsing (`target/run_results.json`) is best-effort; commands may not emit every artifact.

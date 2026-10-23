# Security

This system executes subprocesses. Treat every user-supplied command argument as untrusted.

Rules:

- Use `spawn(dbtBin, argv)`. Never `exec(userInput)` or shell interpolation.
- Allowlist dbt commands: `debug`, `deps`, `compile`, `run`, `test`, `build`.
- Validate each argument token. Reject `;`, `|`, `&`, `` ` ``, `$`, and similar metacharacters.
- Isolate Git workspaces per job.
- Redact `GIT_TOKEN`, `API_AUTH_TOKEN`, `DATABASE_URL`, passwords, and Authorization headers from logs.
- Never render secrets in the UI.
- Keep `.env` out of git.

V1 authentication is a simple boundary (`API_AUTH_TOKEN`) designed so OIDC/OAuth/SSO/RBAC can replace it later without scattering checks through controllers. Role names reserved for later: `ADMIN`, `ENGINEER`, `VIEWER`.

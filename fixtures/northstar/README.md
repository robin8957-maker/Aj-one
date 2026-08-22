# Northstar fixture

Internal service used by ALJWHARAH ONE playbooks.

## Current safeguards

- `login()` is single-flight per identity (no overlapping tokens).
- `GET /health` returns `{ ok, status, service, timestamp, uptime, activeUsers }`.
- `POST /login` applies a per-identity token bucket (burst 5).

These are the **fixed** baseline. Playbooks may still rewrite files to demonstrate a mission; the fixture itself no longer ships the race.

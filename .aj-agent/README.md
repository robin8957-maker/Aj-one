# Al Jwharah agent environment

Local runtime root for sessions, swarm rooms, snapshots, browser recordings, and scratch.
Safe to delete when the workspace is idle — the IDE recreates it on demand.

- `swarm_rooms/` — multi-agent discussion transcripts
- `snapshots/` — file-level rollback points before large plans
- `container_states/` — reserved for container / DB / terminal bridges

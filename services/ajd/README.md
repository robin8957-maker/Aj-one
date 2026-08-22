# ajd

Headless ALJWHARAH ONE daemon.

In this workspace the daemon runs in-process inside the Mission Control server
(`src/daemon/ajd.ts`) so the live preview has a single owner for mission state.

Standalone entry (same module):

```
node --experimental-strip-types apps/cli/aj.ts mission list
```

Do not put mission truth in the React tree.

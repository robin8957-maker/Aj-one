# TOOLS

Registered tools live in `src/runtime/tool-registry.ts`.
Unknown tools return `AJ_ERR_CAPABILITY_UNAVAILABLE` and receive no quota.
Authorization is `authorizeTool` + capability tokens.

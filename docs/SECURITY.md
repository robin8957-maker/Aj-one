# Security notes

## Secret lifecycle

- Vault: AES-256-GCM. Master key never lives beside `secrets.vault.json`.
- Agents receive a lease, not a durable secret.
- Prefer `useSecretBuffer`, `kmsHmac`, or `mintSecretHeaders`.
- Callers of `mintSecretHeaders()` **must** invoke `cleanup()`.
- Buffers are overwritten with `randomFillSync` then `fill(0)`.
- JavaScript strings cannot be wiped in V8. Do not put plaintext secrets in HTTP headers.

## Isolation

- v1 execution is **local** or **local-sandbox** (Linux namespaces + chroot + OverlayFS).
- Missing sandbox tools fail closed (`code 126`). There is no host fallback.
- Firecracker remains a research path and will not boot without KVM + kernel + rootfs.

## Models

- Planner: `aj-local`.
- Optional engine: xAI Grok, only with `XAI_API_KEY` **and** `AJ_USE_GROK=1`.
- OpenAI / Anthropic / Cohere are **not** shipped as product backends.

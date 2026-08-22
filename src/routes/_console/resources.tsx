import { createFileRoute } from "@tanstack/react-router";
import { revokeSecretFn, rotateKeyFn } from "@/daemon/fns";
import { useConsole } from "@/components/console/use-console";
import { money } from "@/components/console/format";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_console/resources")({
  component: ResourceCenter,
});

function ResourceCenter() {
  const { data, run, busy } = useConsole();
  const missions = data?.missions ?? [];
  const agents = data?.agents ?? [];
  const tokens = missions.reduce((s, m) => s + m.budget.tokensUsed, 0);
  const spend = missions.reduce((s, m) => s + m.budget.moneyUsed, 0);
  const secrets = data?.secrets ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">RESOURCE CENTER</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Budgets are first-class.</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Tokens consumed" value={tokens.toLocaleString()} />
        <Stat label="Estimated spend" value={money(spend)} />
        <Stat label="Agent instances" value={String(agents.length)} />
      </div>
      <ul className="mt-8 space-y-2">
        {agents.map((a) => (
          <li key={a.agentId} className="flex items-center justify-between gap-3 rounded-md bg-bg-elevated px-3 py-3">
            <span className="text-sm">{a.title}</span>
            <span className="font-mono text-[11px] tabular-nums text-fg-subtle">
              {a.budget.tokensUsed} tok · {money(a.budget.moneyUsed)}
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">SECRETS BROKER</h2>
        <p className="mt-2 max-w-xl text-sm text-fg-muted">
          Values are sealed. This list is metadata only — scoped, expiring, revocable. Agents receive a
          lease handle, then useSecret, then expire. The master key lives in an isolated keyring, not
          next to the vault.
        </p>
        <p className="mt-3 font-mono text-[11px] text-fg-subtle">
          key {data?.broker?.keyId ?? "—"}
        </p>
        <div className="mt-3">
          <Button variant="ghost" disabled={busy} onClick={() => void run(() => rotateKeyFn())}>
            Rotate master key
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {secrets.map((s) => (
            <li
              key={s.secretId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-bg-elevated px-3 py-3"
            >
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                  {s.status} · leases {s.leaseCount} · expires {s.expiresAt.slice(0, 16)}
                  {s.scope.roles?.length ? ` · roles ${s.scope.roles.join(",")}` : ""}
                  {s.scope.tools?.length ? ` · tools ${s.scope.tools.join(",")}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                disabled={busy || s.status === "revoked"}
                onClick={() => void run(() => revokeSecretFn({ data: s.secretId }))}
              >
                Revoke
              </Button>
            </li>
          ))}
          {secrets.length === 0 && <li className="text-sm text-fg-muted">Broker has no sealed secrets yet.</li>}
        </ul>
      </section>

      {(data?.modelRoutes ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">MODEL GOVERNOR</h2>
          <ul className="mt-3 space-y-2">
            {(data?.modelRoutes ?? []).map((r, i) => (
              <li key={`${r.capability}-${r.at}-${i}`} className="rounded-md bg-bg-elevated px-3 py-3">
                <p className="text-sm">
                  {r.capability} → {r.provider}
                </p>
                <p className="mt-1 text-sm text-fg-muted">{r.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[11px] text-fg-subtle">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
    </div>
  );
}

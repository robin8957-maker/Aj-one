import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";

export const Route = createFileRoute("/_console/fleet")({
  component: Fleet,
});

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function Fleet() {
  const { data } = useConsole();
  const agents = data?.performance?.agents ?? [];
  const models = data?.performance?.models ?? [];
  const placements = Object.entries(data?.placements ?? {});
  const routes = data?.modelRoutes ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">FLEET · REPUTATION</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Fitness is not a score.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        Commander classifies the task, then routes a worker from multidimensional history, model
        performance, budget, and risk. Grok is never selected unless you ask for it.
      </p>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">AGENT PROFILES</h2>
        {agents.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">
            No samples yet. Complete a mission and the first profiles appear here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {agents.map((p) => (
              <li key={p.profileId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
                <p className="font-medium">
                  {p.role}
                  <span className="ml-2 font-mono text-[11px] text-fg-subtle">
                    {p.taskDomain} · {p.language}
                  </span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] sm:grid-cols-4">
                  <Stat k="success" v={pct(p.successRate)} />
                  <Stat k="first pass" v={pct(p.firstPassSuccess)} />
                  <Stat k="verifier reject" v={pct(p.verifierRejectRate)} />
                  <Stat k="avg cost" v={`$${p.avgCost.toFixed(2)}`} />
                  <Stat k="retries" v={p.avgRetries.toFixed(1)} />
                  <Stat k="rollback" v={pct(p.rollbackRate)} />
                  <Stat k="policy denials" v={String(p.policyDenials)} />
                  <Stat k="samples" v={String(p.sampleSize)} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">MODEL PERFORMANCE</h2>
        {models.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Governor has no model samples yet. Local planner is the default.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {models.map((p) => (
              <li key={p.profileId} className="rounded-md bg-bg-elevated px-3 py-3">
                <p className="text-sm">
                  {p.provider} · {p.capability} · {p.taskDomain}
                </p>
                <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                  success {pct(p.successRate)} · ${p.avgCost.toFixed(2)} · {Math.round(p.avgLatencyMs)}ms · n={p.sampleSize}
                </p>
              </li>
            ))}
          </ul>
        )}
        {routes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {routes.slice(-6).reverse().map((r, i) => (
              <li key={`${r.capability}-${r.at}-${i}`} className="text-sm text-fg-muted">
                {r.capability} → {r.provider}
                <span className="ml-2 font-mono text-[11px] text-fg-subtle">{r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">PLACEMENT</h2>
        <p className="mt-2 max-w-xl text-sm text-fg-muted">
          Hybrid scheduler records Local / LocalSandbox / Remote / Cloud. Remote and cloud work still
          runs on this host until a remote runtime exists.
        </p>
        {placements.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No missions have been placed yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {placements.map(([missionId, place]) => (
              <li key={missionId} className="rounded-md bg-bg-elevated px-3 py-3">
                <p className="text-sm">
                  {place.kind}
                  <span className="ml-2 font-mono text-[11px] text-fg-subtle">{place.location}</span>
                  {!place.intended && (
                    <span className="ml-2 font-mono text-[11px] text-warn">local stand-in</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-fg-muted">{place.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-fg-subtle">{k}</dt>
      <dd className="mt-0.5 tabular-nums text-fg">{v}</dd>
    </div>
  );
}

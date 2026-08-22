import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";

export const Route = createFileRoute("/_console/decisions")({
  component: DecisionCenter,
});

function DecisionCenter() {
  const { data } = useConsole();
  const rows = data?.decisions ?? [];
  const routes = data?.modelRoutes ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">DECISION CENTER</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Why the architecture is this way.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        A decision is a graph node: choice, alternatives, affects, status. Agents that contradict it raise a
        Decision Conflict — they do not silently override the governor.
      </p>
      {routes.length > 0 && (
        <p className="mt-4 font-mono text-[11px] text-fg-subtle">
          Model route: {routes.at(-1)?.capability} → {routes.at(-1)?.provider}
        </p>
      )}
      <ul className="mt-8 space-y-3">
        {rows.map((d) => (
          <li key={d.decisionId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-medium">{d.question}</p>
            <p className="mt-2 text-sm text-fg-muted">Choice: {d.choice}</p>
            {d.why && <p className="mt-1 text-sm text-fg-muted">{d.why}</p>}
            {d.options.length > 0 && (
              <p className="mt-1 text-sm text-fg-subtle">Alternatives: {d.options.join(" · ")}</p>
            )}
            {(d.affects ?? []).length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-fg-subtle">Affects: {d.affects.join(", ")}</p>
            )}
            <p className="mt-2 font-mono text-[11px] text-fg-subtle">
              {d.status} · confidence {(d.confidence * 100).toFixed(0)}%
            </p>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-fg-muted">No accepted decisions yet.</li>}
      </ul>
    </main>
  );
}

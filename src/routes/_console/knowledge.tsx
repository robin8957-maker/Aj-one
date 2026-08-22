import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";

export const Route = createFileRoute("/_console/knowledge")({
  component: KnowledgeCenter,
});

function KnowledgeCenter() {
  const { data } = useConsole();
  const cards = data?.knowledge ?? [];
  const graph = data?.graph;
  const conflicts = data?.semanticConflicts ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">KNOWLEDGE CENTER</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">What the OS already knows.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        Cards sit on a symbol graph — files, exports, imports, references, diagnostics. Not a chat log.
      </p>

      {graph && (
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="Graph nodes" value={String(graph.nodes.length)} />
          <Stat label="Edges" value={String(graph.edges.length)} />
          <Stat label="Diagnostics" value={String(graph.diagnostics.length)} />
        </section>
      )}

      {graph && graph.nodes.some((n) => n.kind === "symbol" && n.line) && (
        <section className="mt-6">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">DEFINITIONS</h2>
          <ul className="mt-3 space-y-1">
            {graph.nodes
              .filter((n) => n.kind === "symbol" && n.exported)
              .slice(0, 10)
              .map((n) => (
                <li key={n.id} className="font-mono text-[12px] text-fg-muted">
                  {n.label} · {n.file}
                  {n.line ? `:${n.line}` : ""}
                </li>
              ))}
          </ul>
        </section>
      )}

      {graph && graph.diagnostics.length > 0 && (
        <ul className="mt-4 space-y-2">
          {graph.diagnostics.slice(0, 8).map((d) => (
            <li key={`${d.file}:${d.message}`} className="rounded-md bg-bg-elevated px-3 py-2 text-sm">
              <span className="font-mono text-[11px] text-fg-subtle">{d.severity}</span>
              <span className="ml-2 text-fg-muted">
                {d.file} — {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">SEMANTIC MERGE</h2>
          <ul className="mt-3 space-y-2">
            {conflicts.map((c) => (
              <li key={c.conflictId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
                <p className="font-mono text-[11px] text-fg-subtle">{c.verdict}</p>
                <p className="mt-1 text-sm">{c.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="mt-8 space-y-3">
        {cards.map((c) => (
          <li key={c.cardId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-fg-subtle">{c.kind}</p>
            <p className="mt-1 font-medium">{c.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{c.body}</p>
          </li>
        ))}
        {cards.length === 0 && (
          <li className="text-sm text-fg-muted">No cards yet. Run a mission against Northstar.</li>
        )}
      </ul>
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

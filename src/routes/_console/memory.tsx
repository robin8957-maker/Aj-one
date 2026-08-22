import { createFileRoute } from "@tanstack/react-router";
import { forgetMemory, pinMemory } from "@/daemon/fns";
import { useConsole } from "@/components/console/use-console";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_console/memory")({
  component: MemoryHealth,
});

function MemoryHealth() {
  const { data, run } = useConsole();
  const rows = data?.memories ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">MEMORY HEALTH</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Observable. Correctable.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        Transient failures stay incidents until evidence promotes them. You can pin, verify, or forget.
      </p>
      <ul className="mt-8 space-y-3">
        {rows.map((m) => (
          <li key={m.memoryId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{m.title}</p>
                <p className="mt-1 text-sm text-fg-muted">{m.body}</p>
                <p className="mt-2 font-mono text-[11px] text-fg-subtle">
                  {m.klass} · {m.kind} · {m.health} · {(m.confidence * 100).toFixed(0)}%
                  {m.polarity ? ` · ${m.polarity}` : ""}
                  {m.subject ? ` · ${m.subject}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="line"
                  onClick={() => void run(() => pinMemory({ data: { memoryId: m.memoryId, pinned: !m.pinned } }))}
                >
                  {m.pinned ? "Unpin" : "Pin"}
                </Button>
                <Button variant="ghost" onClick={() => void run(() => forgetMemory({ data: m.memoryId }))}>
                  Forget
                </Button>
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-fg-muted">Memory store is empty.</li>}
      </ul>
    </main>
  );
}

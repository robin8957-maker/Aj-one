import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";
import { BattleMap } from "@/components/radar/battle-map";

export const Route = createFileRoute("/_console/radar")({
  component: RadarCenter,
});

function RadarCenter() {
  const { data } = useConsole();
  const map = data?.topology ?? { nodes: [], edges: [], readOnly: true as const };
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">TOPOLOGY RADAR</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Where the swarm is, live.</h1>
      <p className="mt-2 max-w-xl text-sm text-fg-muted">
        Read-only. Nodes light when an agent touches a file, flash red if the verifier objects, green on consensus.
      </p>
      <div className="mt-8 rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
        {map.nodes.length === 0 ? (
          <p className="text-sm text-fg-muted">Index a workspace to populate the map.</p>
        ) : (
          <BattleMap map={map} />
        )}
      </div>
    </main>
  );
}

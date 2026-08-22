import type { TopologyMap, NodeGlow } from "@/runtime/topology";

const FILL: Record<NodeGlow, string> = {
  idle: "var(--color-fg-muted)",
  touched: "var(--color-accent)",
  rejected: "var(--color-danger)",
  consensus: "var(--color-ok, #3d9a6a)",
};

export function BattleMap({ map }: { map: TopologyMap }) {
  const w = 640;
  const h = Math.max(280, 48 + map.nodes.length * 36);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Workspace topology, read only">
      {map.edges.map((e, i) => {
        const a = map.nodes.findIndex((n) => n.id === e.from);
        const b = map.nodes.findIndex((n) => n.id === e.to);
        if (a < 0 || b < 0) return null;
        return (
          <line
            key={`${e.from}-${e.to}-${i}`}
            x1={80}
            y1={32 + a * 36}
            x2={360}
            y2={32 + b * 36}
            stroke="var(--color-line)"
            strokeWidth="1"
          />
        );
      })}
      {map.nodes.map((n, i) => (
        <g key={n.id}>
          <circle cx={80} cy={32 + i * 36} r={7} fill={FILL[n.glow]}>
            {n.glow !== "idle" ? <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" /> : null}
          </circle>
          <text x={100} y={36 + i * 36} fill="var(--color-fg)" fontSize="12" fontFamily="ui-monospace, monospace">
            {n.file}
          </text>
        </g>
      ))}
    </svg>
  );
}

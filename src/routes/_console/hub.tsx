import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";

export const Route = createFileRoute("/_console/hub")({
  component: AgentHub,
});

function AgentHub() {
  const { data } = useConsole();
  const mcp = data?.mcpServers ?? [];
  const external = data?.externalAgents ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">AGENT HUB</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Installed is not authorized.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        External agents declare capabilities. AJ grants them. Self-declared authority is ignored. MCP
        tools execute only through the gateway.
      </p>

      <h2 className="mt-8 font-mono text-[11px] tracking-[0.16em] text-fg-subtle">MCP SERVERS</h2>
      <ul className="mt-3 space-y-3">
        {mcp.map((s) => (
          <li key={s.serverId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-fg-subtle">{s.status}</p>
            <p className="mt-1 font-medium">{s.name}</p>
            <p className="mt-1 text-sm text-fg-muted">
              {s.tools.length ? s.tools.map((t) => t.name).join(" · ") : "No tools discovered yet"}
            </p>
            <p className="mt-2 font-mono text-[11px] text-fg-subtle">
              allow roles: {s.allowRoles.join(", ") || "none"}
            </p>
          </li>
        ))}
        {mcp.length === 0 && <li className="text-sm text-fg-muted">No MCP servers registered.</li>}
      </ul>

      <h2 className="mt-10 font-mono text-[11px] tracking-[0.16em] text-fg-subtle">EXTERNAL AGENTS</h2>
      <ul className="mt-3 space-y-3">
        {external.map((a) => (
          <li key={a.externalId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-fg-subtle">
              {a.kind} · {a.status}
            </p>
            <p className="mt-1 font-medium">{a.name}</p>
            <p className="mt-1 text-sm text-fg-muted">
              requested {a.requested.join(", ") || "—"} · granted {a.granted.join(", ") || "none"}
            </p>
            {a.session && (
              <p className="mt-2 font-mono text-[11px] text-fg-subtle">
                session {a.session.status}
                {a.session.toolsUsed?.length ? ` · used ${a.session.toolsUsed.join(",")}` : ""}
                {a.session.toolsDenied?.length ? ` · denied ${a.session.toolsDenied.join(",")}` : ""}
                {a.session.artifactSummary ? ` · ${a.session.artifactSummary}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

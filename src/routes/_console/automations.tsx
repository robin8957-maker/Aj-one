import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { fireAutomation, ingestHook } from "@/daemon/fns";
import { useConsole } from "@/components/console/use-console";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_console/automations")({
  component: Automations,
});

function Automations() {
  const { data, busy, run } = useConsole();
  const navigate = useNavigate();
  const rows = data?.automations ?? [];
  const ingress = data?.ingress ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">AUTOMATION ENGINE</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Triggers launch missions, not prompts.</h1>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        External webhooks hit a signed ingress first. Bad signatures never reach Commander.
      </p>
      <ul className="mt-8 space-y-3">
        {rows.map((row) => (
          <li
            key={row.automationId}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]"
          >
            <div>
              <p className="font-mono text-[11px] text-fg-subtle">{row.trigger}</p>
              <p className="mt-1 font-medium">{row.title}</p>
              <p className="mt-1 text-sm text-fg-muted">{row.objective}</p>
              <p className="mt-2 font-mono text-[11px] text-fg-subtle">
                {row.enabled ? "Armed" : "Disabled"} · ceiling {row.permissionCeiling} · {row.runs} runs
                {row.lastRunAt ? ` · last ${row.lastRunAt.slice(0, 16)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="line"
                disabled={busy || !row.enabled}
                onClick={() =>
                  void run(async () => {
                    const res = await fireAutomation({ data: row.automationId });
                    await navigate({ to: "/missions/$id", params: { id: res.mission.missionId } });
                  })
                }
              >
                Fire
              </Button>
              <Button
                variant="ghost"
                disabled={busy || !row.enabled}
                onClick={() =>
                  void run(async () => {
                    const res = await ingestHook({
                      data: {
                        event: row.trigger,
                        source: "signed-preview",
                        body: { conclusion: "failure" },
                      },
                    });
                    if (res.missionId) {
                      await navigate({ to: "/missions/$id", params: { id: res.missionId } });
                    }
                  })
                }
              >
                Signed webhook
              </Button>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-fg-muted">Daemon has not seeded automations yet. Open Mission Control once.</li>
        )}
      </ul>

      <section className="mt-10">
        <h2 className="font-mono text-[11px] tracking-[0.16em] text-fg-subtle">INGRESS LOG</h2>
        <ul className="mt-3 space-y-2">
          {ingress.map((row) => (
            <li key={row.ingressId} className="rounded-md bg-bg-elevated px-3 py-3">
              <p className="font-mono text-[11px] text-fg-subtle">
                {row.accepted ? "accepted" : "denied"} · {row.source} · {row.event}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{row.reason}</p>
            </li>
          ))}
          {ingress.length === 0 && (
            <li className="text-sm text-fg-muted">No external events yet. Unsigned posts are rejected.</li>
          )}
        </ul>
      </section>
    </main>
  );
}

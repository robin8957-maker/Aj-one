import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mark } from "@/components/brand/mark";
import { useConsole } from "@/components/console/use-console";
import { connectProvider, disconnectProvider, probeConnections, setLocalOnly, exportAudit } from "@/daemon/fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeSandbox } from "@/runtime/sandbox";
import { liveFleet } from "@/runtime/engines";
import { describeMicrovm } from "@/runtime/microvm";
import { AUDIT_CLAIM } from "@/runtime/audit";
import type { ConnectionFamily } from "@/protocol/connections";

export const Route = createFileRoute("/_console/control")({
  component: ControlPanel,
});

const NAV: { id: ConnectionFamily | "system"; label: string }[] = [
  { id: "system", label: "System" },
  { id: "local", label: "This PC" },
  { id: "model", label: "Models" },
  { id: "cloud", label: "Cloud" },
  { id: "scm", label: "Source" },
];

export function ControlPanel() {
  const { data, busy, run } = useConsole();
  const [section, setSection] = useState<(typeof NAV)[number]["id"]>("model");
  const [secretFor, setSecretFor] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const list = data?.connections ?? [];
  const ready = list.filter((c) => c.status === "ready");
  const fleet = liveFleet(list, Boolean(data?.station.localOnly));
  const liveEngines = fleet.filter((e) => e.live);
  const shown = useMemo(
    () => (section === "system" ? list : list.filter((c) => c.family === section)),
    [list, section],
  );

  return (
    <main className="mind-field flex h-full min-h-0">
      <aside className="hidden w-52 shrink-0 flex-col border-e border-line bg-bg-elevated p-3 md:flex">
        <p className="px-2 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">CONTROL PANEL</p>
        <nav className="mt-3 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={cn(
                "flex min-h-10 items-center rounded-md px-3 text-start text-sm",
                section === n.id ? "bg-bg-subtle text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg",
              )}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <Mark className="size-9 text-fg" pulse />
              <h1 className="font-display text-4xl tracking-tight">Windows Control Panel</h1>
            </div>
            <p className="mt-2 max-w-xl text-sm text-fg-muted">
              Every model and cloud vendor is an engine under AJ. Connect, probe, revoke. Secrets never enter chat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="line" disabled={busy} onClick={() => void run(() => probeConnections())}>
              Probe all
            </Button>
            <Button
              variant={data?.station.localOnly ? "primary" : "line"}
              onClick={() => void run(() => setLocalOnly({ data: !data?.station.localOnly }))}
            >
              {data?.station.localOnly ? "Local only" : "Allow cloud"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Ready" value={String(ready.length)} />
          <Stat label="Catalog" value={String(list.length)} />
          <Stat label="Live engines" value={String(liveEngines.length)} />
          <Stat label="Sandbox" value="Linux NS" />
          <Stat label="Default brain" value="Never Grok" />
        </div>
        <p className="mt-3 text-sm text-fg-muted">
          Live: {liveEngines.map((e) => e.id).join(" · ") || "aj-local"}. Catalog cards are not a lock-in —
          seal a secret and that engine becomes callable. Implementer and judge pick different live engines.
        </p>

        <div className="mt-4 flex gap-1 overflow-x-auto md:hidden">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSection(n.id)}
              className={cn("min-h-9 shrink-0 rounded-md px-3 text-xs", section === n.id ? "bg-bg-subtle" : "text-fg-muted")}
            >
              {n.label}
            </button>
          ))}
        </div>

        {section === "system" && (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">ISOLATION</p>
              <p className="mt-1 font-display text-2xl">{describeSandbox().backend}</p>
              <p className="mt-1 text-xs text-fg-muted">{describeMicrovm().notes[2]}</p>
            </div>
            <div className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
              <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">GOVERNANCE</p>
              <p className="mt-1 font-display text-xl">Provable · Replayable · Rejectable</p>
              <p className="mt-1 text-sm text-fg-muted">{AUDIT_CLAIM}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                <div>
                  <dt className="text-fg-subtle">Verifier catch</dt>
                  <dd className="font-mono">{((data?.governance.verifierCatchRate ?? 0) * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">False PASS</dt>
                  <dd className="font-mono">{((data?.governance.falsePassRate ?? 0) * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Rollback after merge</dt>
                  <dd className="font-mono">{((data?.governance.rollbackAfterMergeRate ?? 0) * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Cost / success</dt>
                  <dd className="font-mono">${(data?.governance.avgCostPerSuccess ?? 0).toFixed(3)}</dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Time to human</dt>
                  <dd className="font-mono">
                    {data?.governance.timeToFirstHumanMs == null ? "—" : `${Math.round(data.governance.timeToFirstHumanMs / 1000)}s`}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-subtle">Missions</dt>
                  <dd className="font-mono">{data?.governance.sampleSize ?? 0}</dd>
                </div>
              </dl>
              <Button
                className="mt-4 h-9 text-xs"
                variant="line"
                disabled={busy || !data?.missions[0]}
                onClick={() => data?.missions[0] && void run(() => exportAudit({ data: data.missions[0]!.missionId }))}
              >
                Export audit bundle
              </Button>
              {data?.station.lastDryRun && data.station.lastDryRun.wouldDeny > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">WHAT-IF</p>
                  <ul className="mt-2 space-y-1 text-xs text-fg-muted">
                    {(data.station.lastDryRun.hints ?? []).map((h) => (
                      <li key={`${h.role}-${h.capability}`}>{h.summary}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <ul className="mt-6 grid gap-3 xl:grid-cols-2">
          {shown.map((c) => (
            <li key={c.connectionId} className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="font-mono text-[10px] tracking-wide text-fg-subtle">{c.vendor}</p>
                </div>
                <span className={cn("status-dot mt-1", c.status === "ready" ? "bg-ok text-ok" : c.status === "denied" ? "bg-danger text-danger" : "bg-fg-subtle text-fg-subtle")} />
              </div>
              <p className="mt-2 text-sm text-fg-muted">{c.blurb}</p>
              <p className="mt-2 font-mono text-[10px] text-fg-subtle">{c.capabilities.join(" · ")}</p>
              {c.lastError && <p className="mt-2 text-xs text-warn">{c.lastError}</p>}
              {secretFor === c.vendor && (
                <input
                  type="password"
                  value={secret}
                  autoComplete="off"
                  placeholder="Seal credential in broker"
                  className="mt-3 h-11 w-full rounded-md px-3 text-sm"
                  onChange={(e) => setSecret(e.target.value)}
                />
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.vendor !== "aj-local" && c.status !== "ready" && (
                  <Button
                    className="h-9 min-h-9 px-3 text-xs"
                    disabled={busy}
                    onClick={() => {
                      if (c.secretName && secretFor !== c.vendor) {
                        setSecretFor(c.vendor);
                        return;
                      }
                      void run(() => connectProvider({ data: { vendor: c.vendor, secret: secret || undefined } })).then(() => {
                        setSecret("");
                        setSecretFor(null);
                      });
                    }}
                  >
                    Connect
                  </Button>
                )}
                {c.vendor !== "aj-local" && c.enabled && (
                  <Button
                    className="h-9 min-h-9 px-3 text-xs"
                    variant="line"
                    disabled={busy}
                    onClick={() => void run(() => disconnectProvider({ data: c.vendor }))}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-elevated px-3 py-3 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">{label}</p>
      <p className="mt-1 font-display text-2xl leading-none">{value}</p>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  cancelMission,
  pauseMission,
  resumeMission,
  steerMission,
} from "@/daemon/fns";
import { useConsole } from "@/components/console/use-console";
import { money, shortId, stateTone, timeLabel } from "@/components/console/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_console/missions/$id")({
  component: MissionDetail,
});

const TABS = [
  "Overview",
  "Fleet",
  "DAG",
  "Timeline",
  "Evidence",
  "Artifacts",
  "Decisions",
  "Memory",
  "Contracts",
] as const;

function MissionDetail() {
  const { id } = Route.useParams();
  const { data, error, busy, run } = useConsole(id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [steer, setSteer] = useState("");

  const mission = data?.missions[0];
  const agents = data?.agents ?? [];
  const agent = agents.find((a) => a.agentId === selectedAgent) ?? agents[0];
  const events = data?.events ?? [];
  const lastWhy = useMemo(
    () => [...events].reverse().find((e) => e.why && e.why.because.length > 0),
    [events],
  );

  if (!data) {
    return (
      <main className="px-6 py-10">
        <div className="h-8 w-48 animate-pulse rounded-md bg-bg-subtle" />
      </main>
    );
  }

  if (!mission) {
    return (
      <main className="px-6 py-10">
        <p className="text-sm text-fg-muted">Mission not found.</p>
        <Link to="/" className="mt-3 inline-block text-sm underline">
          Back to control
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8">
      <div className="min-w-0">
        <Link to="/" className="font-mono text-[11px] text-fg-subtle hover:text-fg">
          ← Mission Control
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl tracking-tight md:text-4xl">{mission.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{mission.objective}</p>
          </div>
          <div className="text-right">
            <p data-testid={`mission-status=${mission.state}`} className={`font-mono text-xs tracking-wide ${stateTone(mission.state)}`}>{mission.state}</p>
            <p className="mt-1 font-mono text-[11px] tabular-nums text-fg-subtle">
              {mission.progress}% · {money(mission.budget.moneyUsed)} / {money(mission.budget.moneyUsd)}
            </p>
          </div>
        </div>

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-bg-subtle">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${mission.progress}%` }} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {mission.state === "PAUSED" ? (
            <Button variant="line" disabled={busy} onClick={() => void run(() => resumeMission({ data: id }))}>
              Resume
            </Button>
          ) : (
            <Button
              variant="line"
              disabled={busy || mission.state === "COMPLETE"}
              onClick={() => void run(() => pauseMission({ data: id }))}
            >
              Pause
            </Button>
          )}
          <Button
            variant="danger"
            disabled={busy || mission.state === "COMPLETE" || mission.state === "CANCELLED"}
            onClick={() => void run(() => cancelMission({ data: id }))}
          >
            Stop
          </Button>
        </div>

        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!steer.trim()) return;
            void run(async () => {
              await steerMission({ data: { missionId: id, text: steer.trim() } });
              setSteer("");
            });
          }}
        >
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder="Steer — add a requirement without restarting the mission"
            className="min-h-11 flex-1 rounded-md bg-bg-elevated px-3 text-sm shadow-[var(--shadow-border)] outline-none"
          />
          <Button type="submit" variant="line" disabled={busy || !steer.trim()}>
            Steer
          </Button>
        </form>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              onClick={() => setTab(t)}
              className={cn(
                "min-h-10 shrink-0 rounded-md px-3 text-sm",
                tab === t ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <section className="mt-5 rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)] md:p-5">
          {tab === "Overview" && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-mono text-[11px] tracking-wide text-fg-subtle">REQUIREMENTS</h3>
                <ul className="mt-3 space-y-2">
                  {mission.requirements.map((r) => (
                    <li key={r.requirementId} className="text-sm">
                      <span className="font-mono text-[11px] text-fg-subtle">{r.key}</span>
                      <p>{r.text}</p>
                      <p className={`font-mono text-[11px] ${stateTone(r.status)}`}>{r.status}</p>
                    </li>
                  ))}
                  {mission.requirements.length === 0 && (
                    <li className="text-sm text-fg-muted">Commander is still extracting requirements.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="font-mono text-[11px] tracking-wide text-fg-subtle">PLAN</h3>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  {mission.planSummary ?? "Awaiting Commander plan."}
                </p>
                {mission.verification && (
                  <p className={`mt-4 text-sm ${stateTone(mission.verification.result)}`}>
                    Verifier {mission.verification.result}: {mission.verification.summary}
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === "Fleet" && (
            <ul className="grid gap-2">
              {agents.map((a) => (
                <li key={a.agentId}>
                  <button
                    type="button"
                    onClick={() => setSelectedAgent(a.agentId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-3 py-3 text-left hover:bg-bg-hover",
                      agent?.agentId === a.agentId && "bg-bg-subtle",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium">{a.title}</span>
                      <span className="block font-mono text-[11px] text-fg-subtle">{a.role}</span>
                    </span>
                    <span className={`font-mono text-[11px] ${stateTone(a.state)}`}>{a.state}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {tab === "DAG" && (
            <ol className="space-y-3">
              {mission.tasks.map((t, i) => (
                <li key={t.taskId} className="flex gap-3">
                  <span className="font-mono text-[11px] text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-sm text-fg-muted">{t.description}</p>
                    <p className={`mt-1 font-mono text-[11px] ${stateTone(t.state)}`}>
                      {t.state} · {t.role} · {t.risk}
                    </p>
                  </div>
                </li>
              ))}
              {mission.tasks.length === 0 && <p className="text-sm text-fg-muted">Task graph not yet published.</p>}
            </ol>
          )}

          {tab === "Timeline" && (
            <ol className="space-y-2">
              {[...events].reverse().slice(0, 80).map((e) => (
                <li key={e.eventId} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
                  <span className="font-mono text-[11px] text-fg-subtle">{timeLabel(e.at)}</span>
                  <span>
                    <span className="font-medium">{e.type}</span>
                    {e.agentId && (
                      <span className="ml-2 font-mono text-[11px] text-fg-subtle">{shortId(e.agentId)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {tab === "Evidence" && (
            <ul className="space-y-3">
              {data.evidence.map((e) => (
                <li key={e.evidenceId} className="text-sm">
                  <p className={e.passed ? "text-ok" : "text-danger"}>{e.passed ? "PASS" : "FAIL"} · {e.claim}</p>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-fg-muted">
                    {e.detail}
                  </pre>
                </li>
              ))}
              {data.evidence.length === 0 && <p className="text-sm text-fg-muted">No evidence yet.</p>}
            </ul>
          )}

          {tab === "Artifacts" && (
            <ul className="space-y-3">
              {data.artifacts.map((a) => (
                <li key={a.artifactId}>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="font-mono text-[11px] text-fg-subtle">{a.kind}</p>
                  <p className="mt-1 text-sm text-fg-muted">{a.summary}</p>
                </li>
              ))}
            </ul>
          )}

          {tab === "Decisions" && (
            <ul className="space-y-3">
              {data.decisions.map((d) => (
                <li key={d.decisionId} className="text-sm">
                  <p className="font-medium">{d.question}</p>
                  <p className="text-fg-muted">Chose {d.choice}</p>
                </li>
              ))}
              {data.decisions.length === 0 && <p className="text-sm text-fg-muted">No decisions recorded.</p>}
            </ul>
          )}

          {tab === "Memory" && (
            <ul className="space-y-3">
              {data.memories.map((m) => (
                <li key={m.memoryId} className="text-sm">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-fg-muted">{m.body}</p>
                  <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                    {m.klass} · {m.kind} · {m.health}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {tab === "Contracts" && (
            <ul className="space-y-4">
              {data.contracts.map((c) => (
                <li key={c.contractId} className="text-sm">
                  <p className="font-medium">{c.role}</p>
                  <p className="text-fg-muted">{c.objective}</p>
                  <p className="mt-1 font-mono text-[11px] text-fg-subtle">
                    scope {c.allowedScope.join(", ")} · forbid {c.forbiddenScope.join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        {agent && (
          <section className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] tracking-wide text-fg-subtle">AGENT</p>
            <h2 className="mt-1 text-lg font-medium">{agent.title}</h2>
            <p className={`font-mono text-[11px] ${stateTone(agent.state)}`}>{agent.state}</p>
            <dl className="mt-4 space-y-2 font-mono text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Model</dt>
                <dd>{agent.model}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Env</dt>
                <dd>{agent.executionEnvironment}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Autonomy</dt>
                <dd className="tabular-nums">{agent.autonomy}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Tokens</dt>
                <dd className="tabular-nums">
                  {agent.budget.tokensUsed} / {agent.budget.tokens}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Tools</dt>
                <dd className="tabular-nums">
                  {agent.budget.toolCallsUsed} / {agent.budget.toolCalls}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-subtle">Heartbeat</dt>
                <dd>{timeLabel(agent.lastHeartbeatAt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">{agent.heartbeat?.note ?? agent.objective}</p>
          </section>
        )}

        <section className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
          <p className="font-mono text-[11px] tracking-wide text-fg-subtle">WHY</p>
          {lastWhy?.why ? (
            <ul className="mt-3 space-y-2 text-sm text-fg-muted">
              {lastWhy.why.because.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">No structured reason yet.</p>
          )}
        </section>

        <section className="rounded-xl bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
          <p className="font-mono text-[11px] tracking-wide text-fg-subtle">WORKTREES</p>
          <ul className="mt-3 space-y-2 text-sm">
            {data.worktrees.map((w) => (
              <li key={w.worktreeId}>
                <p>{w.branch}</p>
                <p className="font-mono text-[11px] text-fg-subtle">
                  {w.mergeStatus} · {w.changedFiles.length} files
                </p>
              </li>
            ))}
            {data.worktrees.length === 0 && <li className="text-fg-muted">None allocated.</li>}
          </ul>
        </section>
      </aside>
    </main>
  );
}

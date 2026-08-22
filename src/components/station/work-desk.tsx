import { useState } from "react";
import {
  advanceWork,
  executeWorkWithOne,
  freezeWorkDecision,
  forkWorkProposal,
  runWorkExperiment,
  startWorkRoom,
  steerWork,
} from "@/daemon/fns";
import { Button } from "@/components/ui/button";
import { shortId, stateTone } from "@/components/console/format";
import { cn } from "@/lib/utils";
import { WORK_PRESETS, type WorkRoom } from "@/protocol/work";
import type { ConsoleView } from "@/daemon/types";

const TABS = ["Room", "Whiteboard", "Evidence", "Compare", "Replay"] as const;

export function WorkDesk({
  data,
  busy,
  run,
  draft,
  setDraft,
}: {
  data: ConsoleView;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  draft: string;
  setDraft: (v: string) => void;
}) {
  const room = data.rooms.find((r) => r.roomId === data.activeRoomId) ?? data.rooms[0];
  const [tab, setTab] = useState<(typeof TABS)[number]>("Room");
  const [preset, setPreset] = useState<(typeof WORK_PRESETS)[number]["id"]>("design");
  const council = data.agents.filter((a) => room && a.missionId === room.missionId);

  if (!room) {
    return (
      <div className="mx-auto flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-8" data-testid="work-room">
        <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">WORK</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight">Live expert council.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-fg-muted">
          Specialists are real agents with contracts. They propose independently, challenge with
          evidence, and run experiments. Discussion never grants write permission.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {WORK_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={cn(
                "min-h-11 rounded-md px-3 text-sm",
                preset === p.id ? "bg-accent text-accent-fg" : "bg-bg-subtle text-fg-muted",
              )}
            >
              {p.title}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void run(() =>
                startWorkRoom({
                  data: { objective: "Redesign authentication architecture", preset },
                }),
              )
            }
          >
            Open design room
          </Button>
          <Button
            variant="line"
            disabled={busy}
            onClick={() =>
              void run(() =>
                startWorkRoom({
                  data: { objective: "Investigate login race and measure overlapping login()", preset: "debug" },
                }),
              )
            }
          >
            Open experiment room
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">
            {room.preset} · {room.round} · {room.quality}
          </p>
          <p className="text-sm">{room.objective}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button data-testid="work-next" variant="line" className="min-h-9 px-2 text-xs" disabled={busy} onClick={() => void run(() => advanceWork({ data: room.roomId }))}>
            Next round
          </Button>
          <Button variant="line" className="min-h-9 px-2 text-xs" disabled={busy} onClick={() => void run(() => runWorkExperiment({ data: room.roomId }))}>
            Run experiment
          </Button>
          <Button variant="line" className="min-h-9 px-2 text-xs" disabled={busy} onClick={() => void run(() => freezeWorkDecision({ data: room.roomId }))}>
            Freeze
          </Button>
          <Button data-testid="execute-btn" className="min-h-9 px-2 text-xs" disabled={busy || !room.decision} onClick={() => void run(() => executeWorkWithOne({ data: room.roomId }))}>
            Execute with ONE
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[12rem_minmax(0,1fr)_13rem]">
        <aside className="hidden overflow-y-auto border-r border-line p-3 lg:block">
          <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">EXPERTS</p>
          <ul className="mt-2 space-y-1">
            {council.map((a) => (
              <li key={a.agentId} className="rounded-md px-2 py-2">
                <p className="text-sm">{a.title}</p>
                <p className={cn("font-mono text-[10px]", stateTone(a.state))}>
                  ● {a.state} · {shortId(a.agentId)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[10px] text-fg-subtle">BUDGET</p>
          <p className="mt-1 text-xs text-fg-muted">
            rounds {room.budget.roundsUsed}/{room.budget.maxRounds} · exp {room.budget.experimentsUsed}/
            {room.budget.maxExperiments}
          </p>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="flex overflow-x-auto border-b border-line">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn("min-h-10 px-3 font-mono text-[11px]", tab === t ? "bg-bg-subtle text-fg" : "text-fg-muted")}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "Room" && <RoomFeed room={room} busy={busy} run={run} />}
            {tab === "Whiteboard" && <Board room={room} />}
            {tab === "Evidence" && <Evidence room={room} />}
            {tab === "Compare" && <Compare room={room} />}
            {tab === "Replay" && (
              <ol className="space-y-2 text-sm">
                {room.timeline.map((t, i) => (
                  <li key={`${t.at}:${i}`} className="flex gap-3">
                    <span className="font-mono text-[10px] text-fg-subtle">{t.at.slice(11, 19)}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              const text = draft;
              setDraft("");
              void run(() => steerWork({ data: { roomId: room.roomId, text } }));
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="@room Redis is forbidden   @security explain the risk"
              className="min-h-11 flex-1 rounded-md bg-bg-subtle px-3 text-sm outline-none"
            />
            <Button type="submit" disabled={busy || !draft.trim()}>
              Steer
            </Button>
          </form>
        </section>

        <aside className="hidden overflow-y-auto border-l border-line p-3 lg:block">
          <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">EVIDENCE</p>
          {room.decision && (
            <div className="mt-2 rounded-md bg-bg-subtle p-2">
              <p className="text-xs text-fg-muted">Decision {room.decision.frozen ? "FROZEN" : "proposed"}</p>
              <p className="text-sm">{room.decision.summary}</p>
            </div>
          )}
          {room.noConsensus && <p className="mt-3 text-xs text-warn">{room.noConsensus}</p>}
          <ul className="mt-3 space-y-2">
            {room.confidence.map((c) => (
              <li key={c.area}>
                <p className="flex justify-between text-xs">
                  <span>{c.area}</span>
                  <span className="font-mono tabular-nums">{c.value}%</span>
                </p>
                <div className="mt-1 h-1 rounded-full bg-bg-subtle">
                  <div className="h-full bg-accent" style={{ width: `${c.value}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {room.minority.length > 0 && (
            <div className="mt-4">
              <p className="font-mono text-[10px] text-fg-subtle">MINORITY</p>
              {room.minority.map((m) => (
                <p key={m.agentId} className="mt-1 text-xs text-fg-muted">
                  {m.role}: {m.concern}
                </p>
              ))}
            </div>
          )}
          {room.constraints.filter((c) => c.locked).map((c) => (
            <p key={c.constraintId} className="mt-3 text-xs text-danger">
              LOCKED {c.forbidden ?? c.text}
            </p>
          ))}
        </aside>
      </div>
    </div>
  );
}

function RoomFeed({
  room,
  busy,
  run,
}: {
  room: WorkRoom;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {room.proposals.map((p) => (
        <article key={p.proposalId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
          <p className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle">
            {p.status} · {p.authorRole} · {p.complexity}
          </p>
          <h3 className="mt-1 text-sm font-medium">{p.summary}</h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.architecture}</p>
          <ul className="mt-2 text-xs text-fg-muted">
            {p.evidence.map((e) => (
              <li key={e.claim}>
                {e.status.toUpperCase()} · {e.claim} ({e.source})
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="mt-2 min-h-9 px-2 text-xs"
            disabled={busy}
            onClick={() => void run(() => forkWorkProposal({ data: { roomId: room.roomId, proposalId: p.proposalId } }))}
          >
            Fork this idea
          </Button>
        </article>
      ))}
      <ol className="space-y-3">
        {room.messages.map((m) => (
          <li key={m.messageId}>
            <p className="font-mono text-[10px] tracking-[0.14em] text-fg-subtle">
              {m.kind} · {m.authorRole}
            </p>
            <p className="mt-1 text-sm leading-relaxed">{m.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Board({ room }: { room: WorkRoom }) {
  return (
    <div className="relative min-h-64 rounded-lg bg-bg-elevated">
      {room.whiteboard.nodes.map((n) => (
        <div
          key={n.nodeId}
          className="absolute max-w-40 rounded-md bg-bg-subtle px-2 py-1 text-xs"
          style={{ left: n.x, top: n.y }}
        >
          {n.label}
        </div>
      ))}
      {room.whiteboard.nodes.length === 0 && <p className="p-4 text-sm text-fg-muted">No board yet.</p>}
    </div>
  );
}

function Evidence({ room }: { room: WorkRoom }) {
  return (
    <ul className="space-y-3 text-sm">
      {room.experiments.map((e) => (
        <li key={e.experimentId} className="rounded-md bg-bg-elevated p-3">
          <p className="font-mono text-[10px] text-fg-subtle">{e.status} · measured, not invented</p>
          <p className="mt-1">{e.hypothesis}</p>
          <p className="mt-1 text-xs text-fg-muted">{e.measurements.map((m) => `${m.name}=${m.value}${m.unit}`).join(" · ")}</p>
        </li>
      ))}
      {room.experiments.length === 0 && <li className="text-fg-muted">No experiments yet.</li>}
    </ul>
  );
}

function Compare({ room }: { room: WorkRoom }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-fg-subtle">
          <th className="py-1 font-medium">Proposal</th>
          <th className="font-medium">Status</th>
          <th className="font-medium">Cost</th>
          <th className="font-medium">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {room.proposals.map((p) => (
          <tr key={p.proposalId}>
            <td className="py-1">{p.summary}</td>
            <td>{p.status}</td>
            <td>{p.cost}</td>
            <td className="tabular-nums">{p.confidence}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

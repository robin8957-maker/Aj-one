import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AtSign,
  Check,
  Command,
  FileCode2,
  FolderGit2,
  GitBranch,
  Monitor,
  Pause,
  Play,
  Plus,
  Slash,
} from "lucide-react";
import { Mark } from "@/components/brand/mark";
import {
  approvePlan,
  attachContext,
  branchMission,
  dryRun,
  editPlanStep,
  execTerminal,
  forkNow,
  generateSpec,
  liveBrowser,
  pauseLive,
  provisionComputer,
  rejectPlan,
  runAdversary,
  searchEditor,
  setAutonomy,
  setPermission,
  setQuality,
  snapshotNow,
  startArena,
  submitComposer,
  takeoverTerminal,
  writeEditorFile,
  setOperatingMode,
} from "@/daemon/fns";
import { OverlayPalette } from "@/components/station/overlay-palette";
import { isCommanderChord } from "@/runtime/overlay";
import { WorkDesk } from "@/components/station/work-desk";
import { useConsole } from "@/components/console/use-console";
import { shortId, stateTone } from "@/components/console/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_COMMANDS, type ContextKind, type GrantMode } from "@/protocol/station";
import type { ConsoleView } from "@/daemon/types";

const BENCH = ["Editor", "Terminal", "Browser", "Computer", "Diff", "Problems", "Permissions"] as const;
const PLUS: { kind: ContextKind; label: string }[] = [
  { kind: "file", label: "Add file" },
  { kind: "folder", label: "Add folder" },
  { kind: "git", label: "Add Git diff" },
  { kind: "terminal", label: "Add terminal output" },
  { kind: "browser", label: "Add browser page" },
  { kind: "artifact", label: "Add artifact" },
  { kind: "decision", label: "Add decision" },
  { kind: "schema", label: "Add database schema" },
  { kind: "mcp", label: "Connect MCP source" },
];

type Bench = (typeof BENCH)[number];

export function Workstation() {
  const { data, error, busy, run, refresh } = useConsole();
  const [draft, setDraft] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const [atOpen, setAtOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [bench, setBench] = useState<Bench>("Editor");
  const [mobile, setMobile] = useState<"missions" | "chat" | "agents" | "bench">("chat");
  const [palette, setPalette] = useState(false);
  const [computerId, setComputerId] = useState<string | undefined>();
  const [filePath, setFilePath] = useState("src/auth.js");
  const [fileBody, setFileBody] = useState("");
  const [termCmd, setTermCmd] = useState("");
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<{ path: string; line: number; text: string }[]>([]);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const station = data?.station;
  const computers = Object.values(station?.computers ?? {}).filter((c) => c.status !== "destroyed");
  const activeComputer = computers.find((c) => c.computerId === (computerId ?? data?.activeComputerId)) ?? computers[0];
  const messages = station?.messages ?? [];
  const specs = station?.specs ?? {};
  const plans = station?.plans ?? {};
  const terminals = Object.values(station?.terminals ?? {});
  const session = terminals.find((t) => t.computerId === activeComputer?.computerId) ?? terminals[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isCommanderChord(e)) {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    if (data?.tree?.length && !fileBody) {
      const first = data.tree.find((t) => t.kind === "file" && (t.path.endsWith(".js") || t.path.endsWith(".ts") || t.path.endsWith(".tsx")));
      if (first) {
        setFilePath(first.path);
        void import("@/daemon/fns").then(async ({ readEditorFile }) => {
          const res = await readEditorFile({ data: { path: first.path, computerId: activeComputer?.computerId } });
          if (res.content) setFileBody(res.content);
        });
      }
    }
  }, [data?.tree, fileBody, activeComputer?.computerId]);

  async function send(text = draft) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft("");
    setPlusOpen(false);
    setAtOpen(false);
    setSlashOpen(false);
    await run(() => submitComposer({ data: { text: trimmed, computerId: activeComputer?.computerId } }));
  }

  async function addContext(kind: ContextKind) {
    const ref =
      kind === "file"
        ? filePath
        : kind === "folder"
          ? "src"
          : kind === "git"
            ? "HEAD"
            : kind === "artifact"
              ? data?.artifacts[0]?.title ?? "artifact"
              : kind === "decision"
                ? data?.decisions[0]?.question ?? "decision"
                : kind;
    await run(async () => {
      await attachContext({ data: { kind, ref, computerId: activeComputer?.computerId } });
    });
    setPlusOpen(false);
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-muted">
        {error ?? "Connecting to the daemon…"}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="workstation">
      <Header data={data} busy={busy} onPalette={() => setPalette(true)} />

      <div className="flex min-h-0 flex-1">
        <aside data-testid="mission-list" className={cn("w-[14.5rem] shrink-0 flex-col border-r border-line bg-bg-elevated md:flex", mobile === "missions" ? "flex" : "hidden md:flex")}>
          <MissionsRail data={data} onBranch={(id) => void run(() => branchMission({ data: id }))} onOpenFile={(path) => {
            setFilePath(path);
            setBench("Editor");
            void import("@/daemon/fns").then(async ({ readEditorFile }) => {
              const res = await readEditorFile({ data: { path, computerId: activeComputer?.computerId } });
              setFileBody(res.content);
            });
          }} />
        </aside>

        <section className={cn("min-w-0 flex-1 flex-col", mobile === "chat" || mobile === "bench" ? "flex" : "hidden md:flex")}>
          {station?.operatingMode === "work" ? (
            <WorkDesk data={data} busy={busy} run={run} draft={draft} setDraft={setDraft} />
          ) : (
            <>
          <div ref={scroller} className="editor-surface min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
            {messages.length === 0 && <EmptyChat onPlaybook={(t) => void send(t)} />}
            <ol className="space-y-3">
              {messages.map((m) => (
                <li key={m.messageId} className="overflow-hidden rounded-md bg-bg-elevated shadow-[var(--shadow-border)]">
                  <p className="flex items-center gap-2 border-b border-line bg-gutter px-3 py-1.5 font-mono text-[10px] tracking-wide text-fg-subtle">
                    <FileCode2 className="size-3" />
                    {m.role === "user" ? "composer.ts" : `${m.author.toLowerCase()}.md`}
                    <span className="ms-auto uppercase">{m.role === "user" ? "you" : m.author}</span>
                  </p>
                  <p className="whitespace-pre-wrap px-3 py-3 font-mono text-[13px] leading-relaxed text-fg">{m.text}</p>
                  {m.contextIds.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 px-3 pb-3">
                      {m.contextIds.map((id) => {
                        const c = station?.contexts[id];
                        return (
                          <li key={id} className="rounded-sm bg-bg-subtle px-2 py-1 font-mono text-[10px] text-fg-muted">
                            {c ? `${c.kind}:${c.title}` : id}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {m.specId && specs[m.specId] && (
                    <SpecCard
                      spec={specs[m.specId]!}
                      plan={m.planId ? plans[m.planId] : undefined}
                      busy={busy}
                      editingStep={editingStep}
                      onGenerate={() => void run(() => generateSpec({ data: m.specId! }))}
                      onApprove={() => void run(() => approvePlan({ data: { planId: m.planId!, computerId: activeComputer?.computerId } }))}
                      onReject={() => m.planId && void run(() => rejectPlan({ data: m.planId! }))}
                      onEdit={(stepId, title) =>
                        m.planId && void run(() => editPlanStep({ data: { planId: m.planId!, stepId, title } }))
                      }
                      setEditing={setEditingStep}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <Composer
            draft={draft}
            setDraft={setDraft}
            plusOpen={plusOpen}
            setPlusOpen={setPlusOpen}
            atOpen={atOpen}
            setAtOpen={setAtOpen}
            slashOpen={slashOpen}
            setSlashOpen={setSlashOpen}
            busy={busy}
            data={data}
            onSend={() => void send()}
            onPlus={addContext}
            onMention={(token) => setDraft((d) => `${d} ${token}`.trim())}
            onSlash={(cmd) => setDraft(`/${cmd} `)}
          />

          <Workbench
            bench={bench}
            setBench={setBench}
            data={data}
            filePath={filePath}
            setFilePath={setFilePath}
            fileBody={fileBody}
            setFileBody={setFileBody}
            termCmd={termCmd}
            setTermCmd={setTermCmd}
            sessionId={session?.sessionId}
            computerId={activeComputer?.computerId}
            search={search}
            setSearch={setSearch}
            hits={hits}
            setHits={setHits}
            busy={busy}
            run={run}
            hidden={mobile !== "bench" && typeof window !== "undefined" && window.innerWidth < 768}
          />
            </>
          )}
        </section>

        <aside className={cn("w-60 shrink-0 flex-col border-l border-line bg-bg-elevated lg:flex", mobile === "agents" ? "flex" : "hidden lg:flex")}>
          <AgentRail
            data={data}
            computers={computers}
            activeId={activeComputer?.computerId}
            onComputer={setComputerId}
            onProvision={(t) => void run(() => provisionComputer({ data: t }))}
          />
        </aside>
      </div>

      <nav className="hidden items-center justify-between border-t border-line bg-bg-elevated px-3 font-mono text-[10px] text-fg-subtle md:flex">
        <span className="flex min-h-7 items-center gap-3">
          <span className="text-ok">● main</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
          <span>Ln {Math.max(fileBody.split("\n").length, 1)}</span>
        </span>
        <span>{data.inbox.approvals} approvals · {computers.length} computers · AJ local</span>
      </nav>

      <nav className="grid grid-cols-4 border-t border-line bg-bg-elevated md:hidden">
        {(
          [
            ["missions", "Missions"],
            ["chat", "Chat"],
            ["agents", "Agents"],
            ["bench", "Bench"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobile(id)}
            className={cn("min-h-12 text-[11px]", mobile === id ? "text-fg" : "text-fg-muted")}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="border-t border-line px-4 py-2 text-xs text-danger">{error}</p>}

      {palette && <OverlayPalette onClose={() => setPalette(false)} />}
    </div>
  );
}

function Header({ data, busy, onPalette }: { data: ConsoleView; busy: boolean; onPalette: () => void }) {
  const { run } = useConsole();
  return (
    <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-line bg-bg-elevated px-2 md:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Mark className="size-6 text-fg" pulse={busy} />
        <span className="hidden font-display text-lg leading-none tracking-tight sm:inline">Aljwharah</span>
        <span className="hidden font-mono text-[10px] tracking-[0.22em] text-fg-subtle sm:inline">ONE</span>
        <span className="hidden h-4 w-px bg-line md:block" />
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-fg-muted">
          <FolderGit2 className="size-3.5 shrink-0" />
          <span className="truncate">northstar</span>
          <span className="text-fg-subtle">/</span>
          <span className="truncate text-fg">src/auth.js</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex rounded-sm bg-bg-subtle p-0.5">
          {(["one", "work"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={mode === "work" ? "work-mode-btn" : "one-mode-btn"}
              onClick={() => void run(() => setOperatingMode({ data: mode }))}
              className={cn(
                "min-h-8 px-2.5 font-mono text-[10px] tracking-wide",
                (data.station.operatingMode ?? "one") === mode ? "rounded-sm bg-accent text-accent-fg" : "text-fg-muted",
              )}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>
        <select
          className="h-8 rounded-sm bg-bg-subtle px-2 font-mono text-[10px] text-fg"
          value={data.station.autonomy}
          onChange={(e) => void run(() => setAutonomy({ data: e.target.value as typeof data.station.autonomy }))}
        >
          <option value="manual">Manual</option>
          <option value="assisted">Assisted</option>
          <option value="autonomous">Autonomous</option>
          <option value="autopilot">Autopilot</option>
        </select>
        <select
          className="hidden h-8 rounded-sm bg-bg-subtle px-2 font-mono text-[10px] text-fg sm:block"
          value={data.station.quality}
          onChange={(e) => void run(() => setQuality({ data: e.target.value as typeof data.station.quality }))}
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="max">Max</option>
          <option value="economy">Economy</option>
          <option value="private">Private</option>
        </select>
        <button
          type="button"
          onClick={onPalette}
          className="hidden h-8 items-center gap-1 rounded-sm bg-bg-subtle px-2 font-mono text-[10px] text-fg-muted md:flex"
        >
          <Command className="size-3" />K
        </button>
        <span className="hidden items-center gap-1 px-2 font-mono text-[10px] text-fg-subtle lg:flex">
          <GitBranch className="size-3" />
          main
        </span>
        <a
          href="/report.html"
          className="flex h-8 items-center rounded-sm bg-accent px-2 font-mono text-[10px] font-semibold text-accent-fg"
        >
          التقرير
        </a>
        <span className="font-mono text-[10px] tabular-nums text-fg-subtle">{busy ? "thinking" : `seq ${data.daemon.seq}`}</span>
      </div>
    </header>
  );
}

function MissionsRail({
  data,
  onBranch,
  onOpenFile,
}: {
  data: ConsoleView;
  onBranch: (id: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const live = data.missions.filter((m) => !["COMPLETE", "CANCELLED", "FAILED"].includes(m.state));
  const done = data.missions.filter((m) => ["COMPLETE", "CANCELLED", "FAILED"].includes(m.state));
  const files = data.tree.filter((t) => t.kind === "file").slice(0, 24);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="px-3 pt-3 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">EXPLORER</p>
      <ul className="mt-2 space-y-0.5 px-2">
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              onClick={() => onOpenFile(f.path)}
              className="flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-start hover:bg-bg-hover"
            >
              <FileCode2 className="size-3.5 shrink-0 text-str" />
              <span className="truncate font-mono text-[12px]">{f.path.split("/").pop()}</span>
            </button>
          </li>
        ))}
        {files.length === 0 && <li className="px-2 font-mono text-[11px] text-fg-muted">// no files</li>}
      </ul>
      <p className="mt-5 px-3 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">MISSIONS</p>
      <ul className="mt-2 space-y-0.5 px-2">
        {live.map((m) => (
          <li key={m.missionId}>
            <Link
              to="/missions/$id"
              params={{ id: m.missionId }}
              data-testid={`mission-status=${m.state}`}
              className="flex min-h-8 items-center gap-2 rounded-sm px-2 py-1 hover:bg-bg-hover"
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", stateTone(m.state).includes("ok") ? "bg-ok" : "bg-warn")} />
              <span className="min-w-0 flex-1 truncate text-[12px]">{m.title}</span>
            </Link>
            <button type="button" className="px-6 font-mono text-[10px] text-fg-subtle hover:text-fg" onClick={() => onBranch(m.missionId)}>
              branch
            </button>
          </li>
        ))}
        {live.length === 0 && <li className="px-2 font-mono text-[11px] text-fg-muted">// idle</li>}
      </ul>
      {done.length > 0 && (
        <>
          <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">ARCHIVE</p>
          <ul className="mt-2 space-y-1">
            {done.slice(0, 8).map((m) => (
              <li key={m.missionId}>
                <Link
                  to="/missions/$id"
                  params={{ id: m.missionId }}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
                >
                  <span className="truncate">{m.title}</span>
                  <span className={stateTone(m.state)}>○</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-auto border-t border-line pt-3">
        <p className="font-mono text-[10px] text-fg-subtle">COMMANDER INBOX</p>
        <p className="mt-1 text-xs text-fg-muted">
          {data.inbox.approvals} approvals · {data.inbox.blocked} blocked · {data.inbox.decisions} decisions
        </p>
      </div>
    </div>
  );
}

function AgentRail({
  data,
  computers,
  activeId,
  onComputer,
  onProvision,
}: {
  data: ConsoleView;
  computers: ConsoleView["station"]["computers"][string][];
  activeId?: string;
  onComputer: (id: string) => void;
  onProvision: (t: "node-fullstack" | "python" | "blank") => void;
}) {
  const live = data.agents.filter((a) => a.state !== "COMPLETE" && a.state !== "CANCELLED");
  const shown = live.length ? live : data.agents.slice(0, 6);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <p className="font-mono text-[10px] tracking-[0.18em] text-fg-subtle">AGENTS</p>
      <ul className="mt-3 space-y-1">
        {shown.map((a) => (
          <li key={a.agentId} className="rounded-md px-2 py-2 hover:bg-bg-hover">
            <p className="text-sm">{a.title}</p>
            <p className={cn("font-mono text-[10px]", stateTone(a.state))}>
              {a.state} · {shortId(a.agentId)}
            </p>
          </li>
        ))}
        {shown.length === 0 && <li className="text-xs text-fg-muted">Fleet is idle.</li>}
      </ul>
      <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">COMPUTERS</p>
      <ul className="mt-2 space-y-1">
        {computers.map((c) => (
          <li key={c.computerId}>
            <button
              type="button"
              onClick={() => onComputer(c.computerId)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-md px-2 text-left text-sm",
                c.computerId === activeId ? "bg-bg-subtle" : "hover:bg-bg-hover",
              )}
            >
              <span>{c.name}</span>
              <span className="font-mono text-[10px] text-fg-subtle">{c.kind}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1">
        <Button variant="line" className="min-h-9 px-2 text-xs" onClick={() => onProvision("node-fullstack")}>
          Give a computer
        </Button>
        <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => onProvision("blank")}>
          Blank
        </Button>
      </div>
      {data.station.live && (
        <div className="mt-6 rounded-md bg-bg-subtle p-3">
          <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">LIVE</p>
          <p className="mt-1 text-sm">{data.station.live.agentTitle}</p>
          <p className="mt-1 text-xs text-fg-muted">{data.station.live.action}</p>
        </div>
      )}
    </div>
  );
}

function EmptyChat({ onPlaybook }: { onPlaybook: (t: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="flex items-center gap-3">
        <Mark className="size-12 text-fg" pulse />
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-fg-subtle">الجوهرة · INTELLIGENCE EDITOR</p>
          <h1 className="font-display text-4xl tracking-tight">Open a file. Ask the jewel.</h1>
        </div>
      </div>
      <pre className="mt-6 overflow-hidden rounded-lg bg-gutter p-4 font-mono text-[12px] leading-relaxed shadow-[var(--shadow-border)]">
        <code>
          <span className="syn-cmt">{"// commander stays the brain"}</span>
          {"\n"}
          <span className="syn-kw">export</span> <span className="syn-kw">function</span>{" "}
          <span className="syn-fn">edit</span>(file, intent) {"{"}
          {"\n"}
          {"  "}
          <span className="syn-kw">return</span> jewel.<span className="syn-fn">specify</span>(intent)
          {"\n"}
          {"    "}.<span className="syn-fn">patch</span>(file)
          {"\n"}
          {"    "}.<span className="syn-fn">verify</span>()
          {"\n"}
          {"}"}
        </code>
      </pre>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[
          ["/fix Fix the Northstar operator console login and capture browser evidence", "/fix login.tsx"],
          ["/plan Add GET /health that returns { ok: true, service: 'northstar' }", "/plan health route"],
          ["/arena Fix the authentication race condition", "/arena auth race"],
          ["/work redesign authentication architecture", "/work auth architecture"],
        ].map(([cmd, label]) => (
          <button
            key={label}
            type="button"
            className="rounded-md bg-bg-elevated px-3 py-3 text-start font-mono text-[12px] shadow-[var(--shadow-border)] hover:bg-bg-hover"
            onClick={() => onPlaybook(cmd)}
          >
            <span className="syn-kw">{label.split(" ")[0]}</span>{" "}
            <span className="text-fg-muted">{label.split(" ").slice(1).join(" ")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SpecCard({
  spec,
  plan,
  busy,
  editingStep,
  onGenerate,
  onApprove,
  onReject,
  onEdit,
  setEditing,
}: {
  spec: ConsoleView["station"]["specs"][string];
  plan?: ConsoleView["station"]["plans"][string];
  busy: boolean;
  editingStep: string | null;
  onGenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (id: string, title: string) => void;
  setEditing: (id: string | null) => void;
}) {
  return (
    <div className="mt-3 rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
      <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">
        {spec.status === "draft" ? "UNDERSTANDING" : "SPEC"} · {spec.risk} risk
      </p>
      <p className="mt-2 text-sm font-medium">{spec.goal}</p>
      <ul className="mt-3 space-y-1">
        {spec.requirements.map((r) => (
          <li key={r.key} className="flex gap-2 text-sm text-fg-muted">
            <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
            <span>
              <span className="font-mono text-[10px] text-fg-subtle">{r.key}</span> {r.text}
              {r.locked ? " · locked" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-muted">
        Affected: {spec.affected.slice(0, 6).join(", ") || "to be mapped"}
      </p>
      {plan && (
        <ol className="mt-4 space-y-1 border-t border-line pt-3">
          {plan.steps.map((s, i) => (
            <li key={s.stepId} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-[10px] text-fg-subtle">{i + 1}</span>
              {editingStep === s.stepId ? (
                <input
                  defaultValue={s.title}
                  className="min-h-9 flex-1 rounded-sm bg-bg-subtle px-2 text-sm"
                  onBlur={(e) => {
                    onEdit(s.stepId, e.target.value);
                    setEditing(null);
                  }}
                />
              ) : (
                <button type="button" className="text-left hover:underline" onClick={() => setEditing(s.stepId)}>
                  {s.title}
                  {s.edited ? " · edited" : ""}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {spec.status === "draft" && (
          <Button className="min-h-10" disabled={busy} onClick={onGenerate}>
            Generate spec
          </Button>
        )}
        {plan && plan.status === "proposed" && (
          <>
            <Button className="min-h-10" disabled={busy} onClick={onApprove}>
              Approve
            </Button>
            <Button variant="line" className="min-h-10" disabled={busy} onClick={onReject}>
              Reject
            </Button>
          </>
        )}
        {plan?.status === "running" && <p className="font-mono text-[11px] text-ok">Mission running</p>}
      </div>
    </div>
  );
}

function Composer({
  draft,
  setDraft,
  plusOpen,
  setPlusOpen,
  atOpen,
  setAtOpen,
  slashOpen,
  setSlashOpen,
  busy,
  data,
  onSend,
  onPlus,
  onMention,
  onSlash,
}: {
  draft: string;
  setDraft: (v: string) => void;
  plusOpen: boolean;
  setPlusOpen: (v: boolean) => void;
  atOpen: boolean;
  setAtOpen: (v: boolean) => void;
  slashOpen: boolean;
  setSlashOpen: (v: boolean) => void;
  busy: boolean;
  data: ConsoleView;
  onSend: () => void;
  onPlus: (k: ContextKind) => void;
  onMention: (token: string) => void;
  onSlash: (cmd: string) => void;
}) {
  const mentions = useMemo(() => {
    const files = data.tree.filter((t) => t.kind === "file").slice(0, 8);
    return [
      ...files.map((f) => `@file/${f.path}`),
      ...data.agents.slice(0, 4).map((a) => `@agent/${a.role}`),
      ...data.decisions.slice(0, 3).map((d) => `@decision/${d.decisionId}`),
      "@browser",
      "@mcp",
      "@repo",
    ];
  }, [data]);

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 md:px-4">
      <div className="composer-shell p-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="font-mono text-[10px] tracking-[0.16em] text-fg-subtle">COMPOSER · + file · @ symbol · / command</p>
          <span className="font-mono text-[10px] text-fg-subtle">{draft.length}c</span>
        </div>
        <div className="flex flex-wrap gap-1 px-1 pb-1">
          {Object.values(data.station.contexts)
            .slice(-6)
            .map((c) => (
              <span key={c.contextId} className="rounded-sm bg-bg-subtle px-2 py-1 font-mono text-[10px] text-fg-muted">
                {c.kind}:{c.title.slice(0, 28)}
              </span>
            ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSend();
          }}
        >
          <div className="relative flex gap-0.5">
            <IconBtn label="Add context" onClick={() => setPlusOpen(!plusOpen)}>
              <Plus className="size-4" />
            </IconBtn>
            <IconBtn label="Mention" onClick={() => setAtOpen(!atOpen)}>
              <AtSign className="size-4" />
            </IconBtn>
            <IconBtn label="Command" onClick={() => setSlashOpen(!slashOpen)}>
              <Slash className="size-4" />
            </IconBtn>
            {plusOpen && (
              <Menu>
                {PLUS.map((p) => (
                  <button key={p.kind} type="button" className="block w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-bg-hover" onClick={() => onPlus(p.kind)}>
                    {p.label}
                  </button>
                ))}
              </Menu>
            )}
            {atOpen && (
              <Menu>
                {mentions.map((m) => (
                  <button key={m} type="button" className="block w-full rounded-sm px-2 py-2 text-left font-mono text-[12px] hover:bg-bg-hover" onClick={() => onMention(m)}>
                    {m}
                  </button>
                ))}
              </Menu>
            )}
            {slashOpen && (
              <Menu>
                {DEFAULT_COMMANDS.map((c) => (
                  <button key={c.name} type="button" className="block w-full rounded-sm px-2 py-2 text-left text-sm hover:bg-bg-hover" onClick={() => onSlash(c.name)}>
                    <span className="syn-kw">/{c.name}</span>
                    <span className="block text-[10px] text-fg-subtle">{c.blurb}</span>
                  </button>
                ))}
              </Menu>
            )}
          </div>
          <textarea
            data-testid="objective-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.endsWith("@")) setAtOpen(true);
              if (e.target.value === "/") setSlashOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Edit this repo…  describe the patch"
            rows={2}
            className="min-h-12 flex-1 resize-none rounded-md bg-gutter px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-fg-subtle"
          />
          <Button type="submit" data-testid="submit-mission" disabled={busy || !draft.trim()} className="min-h-12">
            Run
          </Button>
        </form>
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-12 left-0 z-20 max-h-64 w-64 overflow-y-auto rounded-md bg-bg-elevated p-1 shadow-[var(--shadow-border)]">
      {children}
    </div>
  );
}

function Workbench(props: {
  bench: Bench;
  setBench: (b: Bench) => void;
  data: ConsoleView;
  filePath: string;
  setFilePath: (p: string) => void;
  fileBody: string;
  setFileBody: (p: string) => void;
  termCmd: string;
  setTermCmd: (p: string) => void;
  sessionId?: string;
  computerId?: string;
  search: string;
  setSearch: (p: string) => void;
  hits: { path: string; line: number; text: string }[];
  setHits: (h: { path: string; line: number; text: string }[]) => void;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  hidden?: boolean;
}) {
  const files = props.data.tree.filter((t) => t.kind === "file");
  const session = Object.values(props.data.station.terminals).find((t) => t.sessionId === props.sessionId);
  const computers = Object.values(props.data.station.computers).filter((c) => c.status !== "destroyed");

  return (
    <div className={cn("flex h-[38vh] min-h-[14rem] shrink-0 flex-col border-t border-line bg-bg", props.hidden && "hidden md:flex")}>
      <div className="flex gap-0 overflow-x-auto border-b border-line bg-bg-elevated">
        {BENCH.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => props.setBench(b)}
            className={cn(
              "min-h-9 shrink-0 px-3 font-mono text-[11px] tracking-wide",
              props.bench === b ? "tab-active" : "text-fg-muted hover:text-fg",
            )}
          >
            {b}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.bench === "Editor" && (
          <div className="grid h-full grid-cols-[9rem_minmax(0,1fr)]">
            <ul className="overflow-y-auto border-r border-line p-2 text-[11px]">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className={cn("block w-full truncate py-1 text-left", f.path === props.filePath && "text-fg")}
                    onClick={() => {
                      props.setFilePath(f.path);
                      void import("@/daemon/fns").then(async ({ readEditorFile }) => {
                        const res = await readEditorFile({ data: { path: f.path, computerId: props.computerId } });
                        props.setFileBody(res.content);
                      });
                    }}
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2 border-b border-line px-2">
                <input
                  value={props.search}
                  onChange={(e) => props.setSearch(e.target.value)}
                  placeholder="Search"
                  className="h-9 flex-1 bg-transparent text-xs outline-none"
                />
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 text-xs"
                  onClick={() =>
                    void searchEditor({ data: { query: props.search, computerId: props.computerId } }).then((r) =>
                      props.setHits(r),
                    )
                  }
                >
                  Find
                </Button>
                <Button
                  variant="line"
                  className="min-h-9 px-2 text-xs"
                  disabled={props.busy}
                  onClick={() =>
                    void props.run(() =>
                      writeEditorFile({
                        data: { path: props.filePath, content: props.fileBody, computerId: props.computerId },
                      }),
                    )
                  }
                >
                  Save
                </Button>
              </div>
              {props.hits.length > 0 && (
                <ul className="max-h-16 overflow-y-auto border-b border-line px-2 py-1 text-[11px] text-fg-muted">
                  {props.hits.map((h, i) => (
                    <li key={`${h.path}:${h.line}:${i}`}>
                      {h.path}:{h.line} {h.text}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex min-h-0 flex-1">
                <div className="code-gutter w-10 shrink-0 px-1.5 py-3 text-end">
                  {Array.from({ length: Math.max(props.fileBody.split("\n").length, 8) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  value={props.fileBody}
                  onChange={(e) => props.setFileBody(e.target.value)}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[12px] leading-[1.65] outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {props.bench === "Terminal" && (
          <div className="flex h-full flex-col bg-bg-elevated">
            <div className="flex items-center justify-between border-b border-line px-3">
              <p className="font-mono text-[11px] text-fg-subtle">
                {session ? `${session.title} · ${session.owner}` : "No session"}
              </p>
              {session && (
                <Button
                  variant="ghost"
                  className="min-h-9 px-2 text-xs"
                  onClick={() =>
                    void props.run(() =>
                      takeoverTerminal({
                        data: { sessionId: session.sessionId, owner: session.owner === "user" ? "agent" : "user" },
                      }),
                    )
                  }
                >
                  {session.owner === "user" ? "Return to agent" : "Take control"}
                </Button>
              )}
            </div>
            <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-fg">
              {session?.output || "Ready. Commands run in the selected computer."}
            </pre>
            <form
              className="flex border-t border-line"
              onSubmit={(e) => {
                e.preventDefault();
                if (!props.termCmd.trim()) return;
                const cmd = props.termCmd;
                props.setTermCmd("");
                void props.run(() =>
                  execTerminal({ data: { command: cmd, computerId: props.computerId, sessionId: session?.sessionId } }),
                );
              }}
            >
              <span className="px-3 py-2 font-mono text-xs text-fg-subtle">$</span>
              <input
                value={props.termCmd}
                onChange={(e) => props.setTermCmd(e.target.value)}
                className="min-h-11 flex-1 bg-transparent font-mono text-xs outline-none"
                placeholder="node --test tests/auth.test.js"
              />
            </form>
          </div>
        )}

        {props.bench === "Browser" && (
          <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_14rem]">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 border-b border-line px-2">
                <Monitor className="size-3.5 text-fg-subtle" />
                <span className="font-mono text-[11px] text-fg-muted">northstar / web</span>
                <Button
                  variant="line"
                  className="ml-auto min-h-9 px-2 text-xs"
                  onClick={() => void props.run(() => liveBrowser({ data: { computerId: props.computerId } }))}
                >
                  Run computer-use
                </Button>
                <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => void props.run(() => pauseLive({ data: !(props.data.station.live?.paused ?? false) }))}>
                  {props.data.station.live?.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                </Button>
              </div>
              <div className="relative min-h-0 flex-1 overflow-auto bg-bg-subtle">
                {props.data.station.live?.screenshot ? (
                  <img src={props.data.station.live.screenshot} alt="Live browser" className="h-full w-full object-contain" />
                ) : (
                  <p className="p-4 text-xs text-fg-muted">No frame yet. Run computer-use to capture DOM, a11y, console, and a screenshot.</p>
                )}
                {props.data.station.live && (
                  <div className="absolute bottom-2 left-2 right-2 rounded-md bg-bg/90 p-2 text-xs">
                    <p>{props.data.station.live.goal}</p>
                    <p className="text-fg-muted">{props.data.station.live.action}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="hidden overflow-y-auto border-l border-line p-3 text-[11px] md:block">
              <p className="font-mono text-fg-subtle">A11Y / CONSOLE</p>
              <p className="mt-2 text-fg-muted">Evidence lands in the mission after a run.</p>
            </div>
          </div>
        )}

        {props.bench === "Computer" && (
          <div className="overflow-y-auto p-3">
            <ul className="grid gap-2 sm:grid-cols-2">
              {computers.map((c) => (
                <li key={c.computerId} className="rounded-md bg-bg-elevated p-3 shadow-[var(--shadow-border)]">
                  <p className="text-sm">{c.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-fg-subtle">
                    {c.kind} · {c.template} · {c.status}
                  </p>
                  <p className="mt-1 text-xs text-fg-muted">{c.note}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="line"
                      className="min-h-9 px-2 text-xs"
                      onClick={() => void props.run(() => snapshotNow({ data: { computerId: c.computerId, title: "Checkpoint" } }))}
                    >
                      Snapshot
                    </Button>
                    <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => void props.run(() => forkNow({ data: c.computerId }))}>
                      Fork
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-muted">
              Sandboxes are isolated workspaces with snapshot/fork. Cloud hypervisors are not provisioned here.
            </p>
          </div>
        )}

        {props.bench === "Diff" && (
          <pre className="h-full overflow-auto p-3 font-mono text-[11px] text-fg-muted">
            Open a mission to inspect worktree diffs. Arena candidates keep isolated trees.
          </pre>
        )}

        {props.bench === "Problems" && (
          <ul className="h-full overflow-y-auto p-3 text-sm">
            {props.data.problems.map((p, i) => (
              <li key={`${p.source}:${i}`} className="flex gap-2 py-1">
                <span className={p.severity === "error" ? "text-danger" : "text-warn"}>{p.severity}</span>
                <span className="text-fg-muted">{p.source}</span>
                <span>{p.message}</span>
              </li>
            ))}
            {props.data.problems.length === 0 && <li className="text-fg-muted">No diagnostics.</li>}
            <li className="mt-4">
              <Button variant="line" className="min-h-9 text-xs" onClick={() => void props.run(() => runAdversary({ data: { computerId: props.computerId } }))}>
                Run red team
              </Button>
              <Button
                variant="ghost"
                className="min-h-9 text-xs"
                onClick={() => void props.run(() => startArena({ data: "Fix the authentication race condition" }))}
              >
                Open arena
              </Button>
            </li>
            {props.data.station.redteams.slice(-2).map((r) => (
              <li key={r.reportId} className="mt-3 text-xs">
                Red team · {r.passed ? "held" : `${r.findings.length} findings`}
                <ul className="mt-1 text-fg-muted">
                  {r.findings.map((f) => (
                    <li key={f.id}>
                      {f.severity}: {f.title}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {props.bench === "Permissions" && (
          <div className="h-full overflow-auto p-3">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-fg-subtle">
                  <th className="py-1 font-medium">Capability</th>
                  <th className="font-medium">Role</th>
                  <th className="font-medium">Mode</th>
                </tr>
              </thead>
              <tbody>
                {props.data.station.policy.matrix.map((cell) => (
                  <tr key={`${cell.capability}:${cell.role}`}>
                    <td className="py-1">{cell.capability}</td>
                    <td>{cell.role}</td>
                    <td>
                      <select
                        value={cell.mode}
                        className="h-8 rounded-sm bg-bg-subtle px-1"
                        onChange={(e) =>
                          void props.run(() =>
                            setPermission({
                              data: { capability: cell.capability, role: cell.role, mode: e.target.value as GrantMode },
                            }),
                          )
                        }
                      >
                        {["deny", "ask", "allow-once", "allow-task", "allow-mission", "allow-project", "always"].map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fg-muted">
              Allow {props.data.station.policy.allowGlobs.join(", ")} · Deny {props.data.station.policy.denyGlobs.join(", ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Palette({
  data,
  onClose,
  onCommand,
  onRefresh,
}: {
  data: ConsoleView;
  onClose: () => void;
  onCommand: (c: string) => void;
  onRefresh: () => void;
}) {
  const [q, setQ] = useState("");
  const items = [
    ...DEFAULT_COMMANDS.map((c) => ({ id: c.name, label: `/${c.name}`, sub: c.blurb, run: () => onCommand(`/${c.name} `) })),
    ...data.missions.slice(0, 6).map((m) => ({
      id: m.missionId,
      label: m.title,
      sub: "Mission",
      run: () => {
        window.location.href = `/missions/${m.missionId}`;
      },
    })),
    { id: "dry", label: "Dry run health", sub: "No execution", run: () => void dryRun({ data: "Add GET /health" }).then(onRefresh) },
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-bg/70 pt-[12vh]" onClick={onClose}>
      <div
        className="w-[min(32rem,calc(100%-1.5rem))] rounded-lg bg-bg-elevated p-2 shadow-[var(--shadow-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Open, run, or ask…"
          className="h-11 w-full bg-transparent px-3 text-sm outline-none"
        />
        <ul className="max-h-72 overflow-y-auto">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-bg-hover" onClick={i.run}>
                <span>{i.label}</span>
                <span className="font-mono text-[10px] text-fg-subtle">{i.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

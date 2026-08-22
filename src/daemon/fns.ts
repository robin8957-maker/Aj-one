import { createServerFn } from "@tanstack/react-start";

async function operatorId(): Promise<string> {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const user = await getSessionUser();
  if (user) return user.id;
  const { dbSource } = await import("@/lib/db");
  if (dbSource === "neon") {
    const { UnauthorizedError } = await import("@/lib/auth/verify.server");
    throw new UnauthorizedError();
  }
  return "local-operator";
}

async function daemon() {
  const { getDaemon } = await import("./ajd");
  return getDaemon();
}

export const getConsole = createServerFn({ method: "GET" }).handler(async () => {
  const id = await operatorId();
  const ajd = await daemon();
  return ajd.view(id);
});

export const getMission = createServerFn({ method: "GET" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data: missionId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    return ajd.missionView(id, missionId);
  });

export const startMission = createServerFn({ method: "POST" })
  .validator((input: { objective: string; projectPath?: string }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    const objective = data.objective.trim();
    if (!objective) throw new Error("Objective required");
    return ajd.startMission(id, objective, data.projectPath);
  });

export const pauseMission = createServerFn({ method: "POST" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data: missionId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.pause(id, missionId);
    return ajd.missionView(id, missionId);
  });

export const resumeMission = createServerFn({ method: "POST" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data: missionId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.resume(id, missionId);
    return ajd.missionView(id, missionId);
  });

export const chromeAction = createServerFn({ method: "POST" })
  .validator((cmd: string) => cmd)
  .handler(async ({ data: cmd }) => {
    const { authorizeChromeIpc } = await import("../runtime/tauri-ipc.ts");
    return authorizeChromeIpc(cmd);
  });

export const overlayInvoke = createServerFn({ method: "POST" })
  .validator((raw: string) => raw)
  .handler(async ({ data: raw }) => {
    const id = await operatorId();
    const ajd = await daemon();
    return ajd.overlayInvoke(id, raw);
  });

export const cancelMission = createServerFn({ method: "POST" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data: missionId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.cancel(id, missionId);
    return ajd.missionView(id, missionId);
  });

export const steerMission = createServerFn({ method: "POST" })
  .validator((input: { missionId: string; text: string }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.steer(id, data.missionId, data.text.trim());
    return ajd.missionView(id, data.missionId);
  });

export const resolveApproval = createServerFn({ method: "POST" })
  .validator((input: { approvalId: string; status: "denied" | "allow-once" | "allow-mission" }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.resolveApproval(id, data.approvalId, data.status);
    return ajd.view(id);
  });

export const pinMemory = createServerFn({ method: "POST" })
  .validator((input: { memoryId: string; pinned: boolean }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.pinMemory(id, data.memoryId, data.pinned);
    return ajd.view(id);
  });

export const forgetMemory = createServerFn({ method: "POST" })
  .validator((memoryId: string) => memoryId)
  .handler(async ({ data: memoryId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    ajd.forgetMemory(id, memoryId);
    return ajd.view(id);
  });

export const fireAutomation = createServerFn({ method: "POST" })
  .validator((automationId: string) => automationId)
  .handler(async ({ data: automationId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    const mission = ajd.fireAutomation(id, automationId);
    if (!mission) throw new Error("Automation missing or disabled");
    return { mission, view: ajd.view(id) };
  });

export const ingestHook = createServerFn({ method: "POST" })
  .validator((input: { event: string; source?: string; body?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const { signOperatorEvent } = await import("../runtime/ingress.ts");
    const timestamp = new Date().toISOString();
    const rawBody = JSON.stringify(data.body ?? { conclusion: "failure" });
    const signed = signOperatorEvent(id, timestamp, rawBody);
    if (!signed.ok) throw new Error(`Ingress secret missing: ${signed.reason}`);
    const ajd = await daemon();
    const result = ajd.ingestExternalEvent(id, {
      source: data.source ?? "mission-control",
      event: data.event,
      timestamp,
      signature: signed.signature,
      rawBody,
      mode: "aj",
    });
    return { ...result, view: ajd.view(id) };
  });

export const revokeSecretFn = createServerFn({ method: "POST" })
  .validator((secretId: string) => secretId)
  .handler(async ({ data: secretId }) => {
    const id = await operatorId();
    const ajd = await daemon();
    const meta = ajd.revokeOperatorSecret(id, secretId);
    if (!meta) throw new Error("Secret not found");
    return ajd.view(id);
  });

export const rotateKeyFn = createServerFn({ method: "POST" }).handler(async () => {
  const id = await operatorId();
  const ajd = await daemon();
  ajd.rotateOperatorKey(id);
  return ajd.view(id);
});

export const submitComposer = createServerFn({ method: "POST" })
  .validator((input: { text: string; computerId?: string; contextIds?: string[] }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    if (!data.text.trim()) throw new Error("Empty composer");
    return ajd.submitComposer(id, data);
  });

export const generateSpec = createServerFn({ method: "POST" })
  .validator((specId: string) => specId)
  .handler(async ({ data }) => {
    const id = await operatorId();
    return (await daemon()).generateSpec(id, data);
  });

export const approvePlan = createServerFn({ method: "POST" })
  .validator((input: { planId: string; computerId?: string }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    return (await daemon()).approvePlan(id, data);
  });

export const rejectPlan = createServerFn({ method: "POST" })
  .validator((planId: string) => planId)
  .handler(async ({ data }) => {
    const id = await operatorId();
    return (await daemon()).rejectPlan(id, data);
  });

export const editPlanStep = createServerFn({ method: "POST" })
  .validator((input: { planId: string; stepId: string; title: string }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    return (await daemon()).editPlanStep(id, data);
  });

export const attachContext = createServerFn({ method: "POST" })
  .validator((input: { kind: string; ref: string; extra?: string; computerId?: string }) => input)
  .handler(async ({ data }) => {
    const id = await operatorId();
    const ajd = await daemon();
    const ctx = ajd.attachContext(id, {
      kind: data.kind as "file",
      ref: data.ref,
      extra: data.extra,
      computerId: data.computerId,
    });
    return { ctx, view: ajd.view(id) };
  });

export const setAutonomy = createServerFn({ method: "POST" })
  .validator((autonomy: "manual" | "assisted" | "autonomous" | "autopilot") => autonomy)
  .handler(async ({ data }) => (await daemon()).setAutonomy(await operatorId(), data));

export const setQuality = createServerFn({ method: "POST" })
  .validator((quality: "fast" | "balanced" | "max" | "economy" | "private") => quality)
  .handler(async ({ data }) => (await daemon()).setQuality(await operatorId(), data));

export const provisionComputer = createServerFn({ method: "POST" })
  .validator((template: "local" | "node-fullstack" | "python" | "blank") => template)
  .handler(async ({ data }) => (await daemon()).provisionComputer(await operatorId(), data));

export const snapshotNow = createServerFn({ method: "POST" })
  .validator((input: { computerId: string; title: string }) => input)
  .handler(async ({ data }) => (await daemon()).snapshotNow(await operatorId(), data.computerId, data.title));

export const forkNow = createServerFn({ method: "POST" })
  .validator((computerId: string) => computerId)
  .handler(async ({ data }) => (await daemon()).forkNow(await operatorId(), data));

export const restoreNow = createServerFn({ method: "POST" })
  .validator((snapshotId: string) => snapshotId)
  .handler(async ({ data }) => (await daemon()).restoreNow(await operatorId(), data));

export const execTerminal = createServerFn({ method: "POST" })
  .validator((input: { computerId?: string; sessionId?: string; command: string; asAgent?: boolean }) => input)
  .handler(async ({ data }) => (await daemon()).execTerminal(await operatorId(), data));

export const takeoverTerminal = createServerFn({ method: "POST" })
  .validator((input: { sessionId: string; owner: "user" | "agent" }) => input)
  .handler(async ({ data }) => (await daemon()).takeoverTerminal(await operatorId(), data.sessionId, data.owner));

export const writeEditorFile = createServerFn({ method: "POST" })
  .validator((input: { computerId?: string; path: string; content: string }) => input)
  .handler(async ({ data }) => (await daemon()).writeEditorFile(await operatorId(), data));

export const readEditorFile = createServerFn({ method: "POST" })
  .validator((input: { computerId?: string; path: string }) => input)
  .handler(async ({ data }) => (await daemon()).readEditorFile(await operatorId(), data));

export const searchEditor = createServerFn({ method: "POST" })
  .validator((input: { query: string; computerId?: string }) => input)
  .handler(async ({ data }) => (await daemon()).searchEditor(await operatorId(), data.query, data.computerId));

export const liveBrowser = createServerFn({ method: "POST" })
  .validator((input: { computerId?: string }) => input)
  .handler(async ({ data }) => (await daemon()).liveBrowser(await operatorId(), data));

export const pauseLive = createServerFn({ method: "POST" })
  .validator((paused: boolean) => paused)
  .handler(async ({ data }) => (await daemon()).pauseLive(await operatorId(), data));

export const startArena = createServerFn({ method: "POST" })
  .validator((objective: string) => objective)
  .handler(async ({ data }) => (await daemon()).startArena(await operatorId(), data));

export const runAdversary = createServerFn({ method: "POST" })
  .validator((input: { computerId?: string; missionId?: string }) => input)
  .handler(async ({ data }) => (await daemon()).runAdversary(await operatorId(), data));

export const branchMission = createServerFn({ method: "POST" })
  .validator((fromMissionId: string) => fromMissionId)
  .handler(async ({ data }) => (await daemon()).branchMission(await operatorId(), data));

export const setPermission = createServerFn({ method: "POST" })
  .validator((input: { capability: string; role: string; mode: "deny" | "ask" | "allow-once" | "allow-task" | "allow-mission" | "allow-project" | "always" }) => input)
  .handler(async ({ data }) => (await daemon()).setPermission(await operatorId(), data));

export const dryRun = createServerFn({ method: "POST" })
  .validator((objective: string) => objective)
  .handler(async ({ data }) => (await daemon()).dryRun(await operatorId(), data));

export const exportAudit = createServerFn({ method: "POST" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data }) => {
    const out = (await daemon()).exportAudit(await operatorId(), data);
    return { path: out.path, claim: out.bundle.claim, missionId: out.bundle.missionId, view: out.view };
  });

export const rewindMission = createServerFn({ method: "POST" })
  .validator((seq: number) => seq)
  .handler(async ({ data }) => (await daemon()).rewindMission(await operatorId(), data));

export const setOperatingMode = createServerFn({ method: "POST" })
  .validator((mode: "one" | "work") => mode)
  .handler(async ({ data }) => (await daemon()).setOperatingMode(await operatorId(), data));

export const startWorkRoom = createServerFn({ method: "POST" })
  .validator((input: { objective: string; preset?: "design" | "debug" | "security" | "research" | "review" | "incident" | "product"; quality?: "fast" | "balanced" | "max" }) => input)
  .handler(async ({ data }) => (await daemon()).startWorkRoom(await operatorId(), data));

export const steerWork = createServerFn({ method: "POST" })
  .validator((input: { roomId?: string; text: string }) => input)
  .handler(async ({ data }) => (await daemon()).steerWork(await operatorId(), data));

export const advanceWork = createServerFn({ method: "POST" })
  .validator((roomId?: string) => roomId)
  .handler(async ({ data }) => (await daemon()).advanceWork(await operatorId(), data));

export const runWorkExperiment = createServerFn({ method: "POST" })
  .validator((roomId?: string) => roomId)
  .handler(async ({ data }) => (await daemon()).runWorkExperiment(await operatorId(), data));

export const freezeWorkDecision = createServerFn({ method: "POST" })
  .validator((roomId?: string) => roomId)
  .handler(async ({ data }) => (await daemon()).freezeWorkDecision(await operatorId(), data));

export const executeWorkWithOne = createServerFn({ method: "POST" })
  .validator((roomId?: string) => roomId)
  .handler(async ({ data }) => (await daemon()).executeWorkWithOne(await operatorId(), data));

export const escalateToWork = createServerFn({ method: "POST" })
  .validator((missionId: string) => missionId)
  .handler(async ({ data }) => (await daemon()).escalateToWork(await operatorId(), data));

export const forkWorkProposal = createServerFn({ method: "POST" })
  .validator((input: { roomId?: string; proposalId: string }) => input)
  .handler(async ({ data }) => (await daemon()).forkWorkProposal(await operatorId(), data));

export const connectProvider = createServerFn({ method: "POST" })
  .validator((input: { vendor: string; secret?: string }) => input)
  .handler(async ({ data }) =>
    (await daemon()).connectProvider(await operatorId(), { vendor: data.vendor as import("../protocol/connections.ts").ConnectionVendor, secret: data.secret }),
  );

export const disconnectProvider = createServerFn({ method: "POST" })
  .validator((vendor: string) => vendor)
  .handler(async ({ data }) =>
    (await daemon()).disconnectProvider(await operatorId(), data as import("../protocol/connections.ts").ConnectionVendor),
  );

export const probeConnections = createServerFn({ method: "POST" }).handler(async () =>
  (await daemon()).probeConnections(await operatorId()),
);

export const setLocale = createServerFn({ method: "POST" })
  .validator((locale: "en" | "ar") => locale)
  .handler(async ({ data }) => (await daemon()).setLocale(await operatorId(), data));

export const setTheme = createServerFn({ method: "POST" })
  .validator((theme: "pearl-dark" | "pearl-light") => theme)
  .handler(async ({ data }) => (await daemon()).setTheme(await operatorId(), data));

export const setLocalOnly = createServerFn({ method: "POST" })
  .validator((localOnly: boolean) => localOnly)
  .handler(async ({ data }) => (await daemon()).setLocalOnly(await operatorId(), data));



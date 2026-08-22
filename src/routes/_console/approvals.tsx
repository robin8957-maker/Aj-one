import { createFileRoute } from "@tanstack/react-router";
import { resolveApproval } from "@/daemon/fns";
import { useConsole } from "@/components/console/use-console";
import { Button } from "@/components/ui/button";
import { invokeNative, isTauriRuntime } from "@/runtime/tauri-ipc";

export const Route = createFileRoute("/_console/approvals")({
  component: ApprovalInbox,
});

function ApprovalInbox() {
  const { data, run } = useConsole();
  const rows = data?.approvals ?? [];

  async function decide(approvalId: string, status: "denied" | "allow-once" | "allow-mission") {
    if (isTauriRuntime()) {
      await invokeNative(status === "denied" ? "mission.reject" : "mission.approve", approvalId);
    }
    await run(() => resolveApproval({ data: { approvalId, status } }));
  }
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">APPROVAL INBOX</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">Policy sits above every agent.</h1>
      <ul className="mt-8 space-y-3">
        {rows.map((a) => (
          <li key={a.approvalId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-medium">{a.action}</p>
            <p className="mt-1 text-sm text-fg-muted">{a.reason}</p>
            <p className="mt-2 font-mono text-[11px] text-fg-subtle">
              {a.risk} · {a.status}
            </p>
            {a.status === "pending" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() => void decide(a.approvalId, "denied")}
                >
                  Deny
                </Button>
                <Button variant="line" onClick={() => void decide(a.approvalId, "allow-once")}>
                  Allow once
                </Button>
                <Button onClick={() => void decide(a.approvalId, "allow-mission")}>
                  Allow for mission
                </Button>
              </div>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-fg-muted">
            Empty. High-risk tools (secrets, unrestricted network, MCP) stop here. Worktree writes stay inside
            contract scope.
          </li>
        )}
      </ul>
    </main>
  );
}

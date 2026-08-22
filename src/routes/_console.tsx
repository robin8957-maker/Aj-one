import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Shell } from "@/components/console/shell";
import { WindowsShell } from "@/components/desktop/windows-shell";

export const Route = createFileRoute("/_console")({
  component: () => (
    <WindowsShell>
      <Shell>
        <Outlet />
      </Shell>
    </WindowsShell>
  ),
});

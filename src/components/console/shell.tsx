import { Link, useRouterState } from "@tanstack/react-router";
import {
  Box,
  Brain,
  CircuitBoard,
  Command,
  GitBranch,
  Inbox,
  Library,
  Plug,
  Scale,
  Settings,
  Sparkles,
  Gauge,
  Radar,
} from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Mark } from "@/components/brand/mark";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Workstation", icon: Command },
  { to: "/control", label: "Control Panel", icon: Settings },
  { to: "/connections", label: "Models", icon: Plug },
  { to: "/knowledge", label: "Knowledge", icon: Library },
  { to: "/decisions", label: "Decisions", icon: Scale },
  { to: "/memory", label: "Memory", icon: Brain },
  { to: "/artifacts", label: "Artifacts", icon: Box },
  { to: "/radar", label: "Radar", icon: Radar },
  { to: "/approvals", label: "Approvals", icon: Inbox },
  { to: "/resources", label: "Resources", icon: CircuitBoard },
  { to: "/fleet", label: "Fleet", icon: Gauge },
  { to: "/automations", label: "Automations", icon: Sparkles },
  { to: "/hub", label: "Agent Hub", icon: GitBranch },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isPending } = useCurrentUserState();
  const station = pathname === "/";

  if (station) {
    return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg">{children}</div>;
  }

  return (
    <div className="flex h-full min-h-0 bg-bg text-fg">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-bg-elevated md:flex">
        <Link to="/" className="flex items-center gap-2 px-4 pt-5 pb-4">
          <Mark className="size-7 text-fg" />
          <span className="font-display text-xl leading-none tracking-tight">Aljwharah</span>
          <span className="font-mono text-[10px] tracking-[0.22em] text-fg-muted">ONE</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150",
                  active ? "bg-bg-subtle text-fg" : "text-fg-muted hover:bg-bg-hover hover:text-fg",
                )}
              >
                <Icon className="size-4" strokeWidth={1.6} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 md:px-6">
          <Link to="/" className="font-display text-xl md:hidden">
            Aljwharah <span className="font-mono text-[10px] tracking-[0.2em]">ONE</span>
          </Link>
          <p className="hidden font-mono text-[11px] tracking-wide text-fg-subtle md:block">Centers</p>
          <div className="flex items-center gap-3">
            {isPending ? (
              <div className="h-8 w-24 animate-pulse rounded-full bg-bg-subtle" />
            ) : (
              <>
                <SignedIn>
                  <UserButton />
                </SignedIn>
                <SignedOut>
                  <Link to="/login" className="text-sm text-fg-muted hover:text-fg">
                    Sign in
                  </Link>
                </SignedOut>
              </>
            )}
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

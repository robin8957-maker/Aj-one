import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Minus, Search, Square, Wifi, X } from "lucide-react";
import { Mark } from "@/components/brand/mark";
import { useConsole } from "@/components/console/use-console";
import { setLocale, setLocalOnly, setTheme } from "@/daemon/fns";
import { invokeNative } from "@/runtime/tauri-ipc";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PINS = [
  { to: "/", label: "Editor" },
  { to: "/control", label: "Control" },
  { to: "/connections", label: "Models" },
  { to: "/fleet", label: "Fleet" },
  { to: "/memory", label: "Memory" },
  { to: "/settings", label: "Settings" },
];

export function WindowsShell({ children }: { children: React.ReactNode }) {
  const { data, run } = useConsole();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [start, setStart] = useState(false);
  const [tray, setTray] = useState(false);
  const [clock, setClock] = useState("");
  const locale = (data?.station.locale ?? "en") as Locale;
  const theme = data?.station.theme ?? "pearl-dark";
  const localOnly = Boolean(data?.station.localOnly);
  const ready = data?.connections.filter((c) => c.status === "ready").length ?? 0;
  const total = data?.connections.length ?? 0;

  useEffect(() => {
    document.documentElement.lang = locale === "ar" ? "ar" : "en";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
  }, [locale, theme]);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString(locale === "ar" ? "ar" : "en-GB", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [locale]);

  return (
    <div className="desktop-wallpaper flex h-dvh flex-col p-0 text-fg md:p-3">
      <div className="win-window flex min-h-0 flex-1 flex-col">
        <header className="mica flex h-11 shrink-0 items-center justify-between border-b border-line px-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mark className="size-6 text-fg" pulse />
            <span className="font-display text-lg leading-none tracking-tight">Aljwharah</span>
            <span className="font-mono text-[10px] tracking-[0.22em] text-fg-subtle">ONE</span>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <span className="hidden font-mono text-[10px] text-fg-subtle md:inline">الجوهرة · Windows Intelligence Editor</span>
          </div>
          <div className="flex items-center">
            <Caption icon={<Minus className="size-3.5" />} label="Minimize" cmd="window.minimize" />
            <Caption icon={<Square className="size-3" />} label="Maximize" cmd="window.maximize" />
            <Caption icon={<X className="size-3.5" />} label="Close" cmd="window.close" danger />
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-bg">{children}</div>

        {start && (
          <div className="absolute inset-0 z-40 bg-bg/35" onClick={() => setStart(false)}>
            <div
              className="acrylic fly-up absolute bottom-16 start-3 w-[min(28rem,calc(100%-1.5rem))] rounded-xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 pb-4">
                <Mark className="size-10 text-fg" pulse />
                <div>
                  <p className="font-display text-2xl leading-none">Aljwharah ONE</p>
                  <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-fg-subtle">
                    {ready}/{total} engines ready · {localOnly ? "local only" : "hybrid"}
                  </p>
                </div>
              </div>
              <p className="px-1 pb-2 font-mono text-[10px] tracking-[0.18em] text-fg-subtle">PINNED</p>
              <div className="grid grid-cols-3 gap-2">
                {PINS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setStart(false)}
                    className="tile flex min-h-16 flex-col justify-end rounded-lg bg-bg-subtle px-3 py-2 text-sm"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {tray && (
          <div className="absolute inset-0 z-40 bg-bg/30" onClick={() => setTray(false)}>
            <aside
              className="acrylic fly-up absolute bottom-16 end-3 w-[min(22rem,calc(100%-1.5rem))] rounded-xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-fg-subtle">{t(locale, "actionCenter")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Quick
                  label={t(locale, "localOnly")}
                  on={localOnly}
                  onClick={() => void run(() => setLocalOnly({ data: !localOnly }))}
                />
                <Quick label="Network" on icon={<Wifi className="size-4" />} />
              </div>
              <p className="mt-4 text-sm text-fg-muted">
                {data ? `${data.inbox.approvals} approvals · ${data.inbox.blocked} blocked` : "…"}
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {ready} {t(locale, "ready")} · AJ governor on
              </p>
              <Link to="/control" onClick={() => setTray(false)} className="mt-3 inline-block text-sm text-fg hover:underline">
                Open Control Panel
              </Link>
            </aside>
          </div>
        )}

        <footer className="mica flex h-12 shrink-0 items-center justify-between border-t border-line px-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStart((v) => !v)}
              className={cn("flex size-11 items-center justify-center rounded-lg hover:bg-bg-hover", start && "bg-bg-subtle")}
              aria-label={t(locale, "start")}
            >
              <Mark className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/control" })}
              className="hidden h-10 items-center gap-2 rounded-lg bg-bg-subtle px-3 text-sm text-fg-muted hover:bg-bg-hover sm:flex"
            >
              <Search className="size-4" />
              Control Panel
            </button>
            <NavChip to="/" active={pathname === "/"} label="Editor" />
            <NavChip to="/control" active={pathname.startsWith("/control") || pathname.startsWith("/connections")} label="Models" />
            <NavChip to="/settings" active={pathname.startsWith("/settings")} label={t(locale, "settings")} />
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setTray((v) => !v)} className="flex h-10 items-center gap-2 rounded-lg px-2 hover:bg-bg-hover">
              <span className="status-dot bg-ok text-ok" />
              <Bell className="size-4" />
              <span className="hidden font-mono text-[11px] tabular-nums md:inline">{clock}</span>
            </button>
            <select
              value={locale}
              className="h-9 rounded-md bg-bg-subtle px-1 font-mono text-[10px]"
              onChange={(e) => void run(() => setLocale({ data: e.target.value as Locale }))}
            >
              <option value="en">EN</option>
              <option value="ar">عر</option>
            </select>
            <select
              value={theme}
              className="hidden h-9 rounded-md bg-bg-subtle px-1 font-mono text-[10px] sm:block"
              onChange={(e) => void run(() => setTheme({ data: e.target.value as "pearl-dark" | "pearl-light" }))}
            >
              <option value="pearl-dark">{t(locale, "pearlDark")}</option>
              <option value="pearl-light">{t(locale, "pearlLight")}</option>
            </select>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Caption({
  icon,
  label,
  danger,
  cmd,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  cmd: "window.minimize" | "window.maximize" | "window.close";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => void invokeNative(cmd)}
      className={cn(
        "flex h-11 w-11 items-center justify-center text-fg-muted hover:bg-bg-hover hover:text-fg",
        danger && "hover:bg-danger hover:text-fg",
      )}
    >
      {icon}
    </button>
  );
}

function NavChip({ to, active, label }: { to: string; active: boolean; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "hidden min-h-10 items-center rounded-lg px-3 text-sm md:flex",
        active ? "bg-bg-subtle text-fg" : "text-fg-muted hover:bg-bg-hover",
      )}
    >
      {label}
    </Link>
  );
}

function Quick({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex min-h-16 flex-col justify-between rounded-lg px-3 py-2 text-start text-sm", on ? "bg-accent text-accent-fg" : "bg-bg-subtle")}
    >
      {icon}
      {label}
    </button>
  );
}

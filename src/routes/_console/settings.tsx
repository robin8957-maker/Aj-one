import { createFileRoute } from "@tanstack/react-router";
import { Mark } from "@/components/brand/mark";
import { useConsole } from "@/components/console/use-console";
import { setLocale, setLocalOnly, setTheme } from "@/daemon/fns";
import { t, type Locale } from "@/lib/i18n";

export const Route = createFileRoute("/_console/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data, run } = useConsole();
  const locale = (data?.station.locale ?? "en") as Locale;
  const theme = data?.station.theme ?? "pearl-dark";
  const localOnly = Boolean(data?.station.localOnly);

  return (
    <main className="mind-field mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
      <div className="flex items-center gap-3">
        <Mark className="size-10 text-fg" />
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">{t(locale, "settings").toUpperCase()}</p>
          <h1 className="font-display text-4xl tracking-tight">This machine.</h1>
        </div>
      </div>
      <p className="mt-3 max-w-xl text-sm text-fg-muted">
        Windows-first shell. Local governor stays the brain. Cloud and model providers stay optional engines.
      </p>

      <section className="mt-8 rounded-lg bg-bg-elevated p-5 shadow-[var(--shadow-border)]">
        <label className="block text-sm">
          {t(locale, "language")}
          <select
            className="mt-2 h-11 w-full rounded-md bg-bg-subtle px-3"
            value={locale}
            onChange={(e) => void run(() => setLocale({ data: e.target.value as Locale }))}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <label className="mt-5 block text-sm">
          {t(locale, "theme")}
          <select
            className="mt-2 h-11 w-full rounded-md bg-bg-subtle px-3"
            value={theme}
            onChange={(e) => void run(() => setTheme({ data: e.target.value as "pearl-dark" | "pearl-light" }))}
          >
            <option value="pearl-dark">{t(locale, "pearlDark")}</option>
            <option value="pearl-light">{t(locale, "pearlLight")}</option>
          </select>
        </label>
        <label className="mt-5 flex min-h-11 items-center justify-between gap-3 text-sm">
          <span>{t(locale, "localOnly")}</span>
          <input type="checkbox" checked={localOnly} onChange={(e) => void run(() => setLocalOnly({ data: e.target.checked }))} />
        </label>
      </section>
    </main>
  );
}

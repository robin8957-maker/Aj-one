import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/brand/mark";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="desktop-wallpaper grid min-h-dvh place-items-center px-4 py-8 text-fg md:px-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-xl bg-bg-elevated shadow-[var(--shadow-border),var(--shadow-lift)] md:grid-cols-[1.15fr_0.85fr]">
        <section className="editor-surface relative border-b border-line p-6 md:border-b-0 md:border-e md:p-10">
          <div className="flex items-center gap-3">
            <Mark className="size-10 text-fg" pulse />
            <div>
              <p className="font-display text-3xl leading-none tracking-tight">Aljwharah</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.28em] text-fg-subtle">ONE · جوهر الذكاء</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-sm font-display text-4xl leading-tight tracking-tight md:text-5xl">
            Governed Agent OS.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-fg-muted">
            Local commander. Contracted agents. Isolated worktrees. Missions complete only with independent proof. Models stay engines.
          </p>
          <a
            href="/report.html"
            className="mt-5 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg"
          >
            التقرير الكامل — تنزيل ونسخ دفعة واحدة
          </a>
          <pre className="mt-8 overflow-hidden rounded-lg bg-gutter p-4 font-mono text-[12px] leading-relaxed shadow-[var(--shadow-border)]">
            <div className="mb-3 flex gap-1.5">
              <span className="size-2 rounded-full bg-danger/70" />
              <span className="size-2 rounded-full bg-warn/70" />
              <span className="size-2 rounded-full bg-ok/70" />
              <span className="ms-2 text-[10px] text-fg-subtle">src/commander.ts</span>
            </div>
            <code>
              <span className="syn-cmt">{"// aljwharah.one — governed intelligence"}</span>
              {"\n"}
              <span className="syn-kw">const</span> jewel = <span className="syn-fn">mind</span>(
              <span className="syn-str">"الجوهرة"</span>)
              {"\n"}
              jewel.<span className="syn-fn">plan</span>(mission)
              {"\n"}
              {"  "}.<span className="syn-fn">with</span>(context)
              {"\n"}
              {"  "}.<span className="syn-fn">verify</span>()
              {"\n"}
              <span className="syn-cmt">{"// never: raw secret → model"}</span>
            </code>
          </pre>
        </section>

        <section className="flex flex-col justify-center p-6 md:p-10">
          <p className="font-mono text-[11px] tracking-[0.2em] text-fg-subtle">OPERATOR</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">Sign in to this machine.</h2>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Local-first: the daemon already runs. Identity only scopes cloud missions.
          </p>
          <div className="mt-6 space-y-2">
            {authEnabled ? (
              GROK_PROVIDERS.map((p) => (
                <Button
                  key={p.providerId}
                  type="button"
                  variant="line"
                  data-testid={`${p.idp === "google" ? "google" : "x"}-login`}
                  className="w-full justify-between"
                  onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                >
                  Continue with {p.label}
                  <span className="font-mono text-[10px] text-fg-subtle">SSO</span>
                </Button>
              ))
            ) : (
              <Link to="/" className="block">
                <Button type="button" className="w-full">
                  Enter the editor
                </Button>
              </Link>
            )}
          </div>
          <Link to="/" data-testid="skip-login" className="mt-8 text-sm text-fg-muted hover:text-fg">
            Skip — open workstation
          </Link>
        </section>
      </div>
    </main>
  );
}

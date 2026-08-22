import { useEffect, useRef, useState } from "react";
import { overlayInvoke } from "@/daemon/fns";
import { isCommanderChord } from "@/runtime/overlay";
import { invokeOverlay, isTauriRuntime } from "@/runtime/tauri-ipc";
import { Mark } from "@/components/brand/mark";
import { cn } from "@/lib/utils";

export function OverlayPalette({
  floating = true,
  onClose,
}: {
  floating?: boolean;
  onClose?: () => void;
}) {
  const [text, setText] = useState("");
  const [note, setNote] = useState("Ctrl+Shift+Space · ابدأ مهمة أو اكتب stop");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
      if (isCommanderChord(e)) {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function go(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    try {
      if (isTauriRuntime()) {
        const native = await invokeOverlay(value);
        if (!native.ok) {
          setNote(native.reason);
          return;
        }
        setNote(native.result);
        setText("");
        onClose?.();
        return;
      }
      const res = await overlayInvoke({ data: value });
      if (!res.ok) setNote(res.reason);
      else if (res.action === "start") {
        setNote(`بدأت المهمة ${res.missionId}`);
        setText("");
        onClose?.();
      } else if (res.action === "stop") {
        setNote(`أُوقفت ${res.missionId ?? ""}`);
        onClose?.();
      } else setNote("لوحة القائد");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        floating && "fixed inset-0 z-50 grid place-items-start bg-bg/70 px-4 pt-[18vh] backdrop-blur-sm",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <section className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-bg-elevated shadow-[var(--shadow-lift)]">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Mark className="size-5 text-fg" pulse={busy} />
          <p className="font-display text-lg leading-none">Commander</p>
          <span className="ms-auto font-mono text-[10px] tracking-widest text-fg-subtle">OVERLAY</span>
        </header>
        <form
          className="p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void go(text);
          }}
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="مهمة جديدة… أو stop"
            className="h-12 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg outline-none ring-accent focus:ring-1"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              data-testid="overlay-mission-resume"
              className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
            >
              تشغيل
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid="overlay-mission-pause"
              onClick={() => void go("stop")}
              className="min-h-11 rounded-md border border-line px-4 text-sm text-fg"
            >
              إيقاف المهمة
            </button>
          </div>
          <p className="mt-3 font-mono text-[11px] text-fg-muted">{note}</p>
          <button type="button" data-testid="overlay-mission-panic" className="sr-only" onClick={() => void go("stop")}>
            panic
          </button>
        </form>
      </section>
    </div>
  );
}

import { artifactFrame, ARTIFACT_SANDBOX, sandboxLeaksOrigin } from "@/runtime/artifact-render";

export function ArtifactRenderer({ title, content }: { title: string; content: string }) {
  const frame = artifactFrame(content);
  if (sandboxLeaksOrigin(frame.sandbox)) {
    return <p className="text-sm text-danger">renderer refused: same-origin leak</p>;
  }
  return (
    <section className="overflow-hidden rounded-lg bg-bg-elevated shadow-[var(--shadow-border)]">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="font-mono text-[11px] text-fg-subtle">SANDBOX · {title}</p>
        <p className="font-mono text-[10px] text-fg-muted">{ARTIFACT_SANDBOX} · no same-origin</p>
      </header>
      <iframe
        title={title}
        sandbox={ARTIFACT_SANDBOX}
        srcDoc={frame.srcdoc}
        referrerPolicy="no-referrer"
        className="h-64 w-full bg-bg"
      />
    </section>
  );
}

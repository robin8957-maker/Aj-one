import { createFileRoute } from "@tanstack/react-router";
import { useConsole } from "@/components/console/use-console";
import { ArtifactRenderer } from "@/components/artifacts/artifact-renderer";
import { isUiArtifact } from "@/runtime/artifact-render";

export const Route = createFileRoute("/_console/artifacts")({
  component: ArtifactCenter,
});

function ArtifactCenter() {
  const { data } = useConsole();
  const rows = data?.artifacts ?? [];
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
      <p className="font-mono text-[11px] tracking-[0.18em] text-fg-subtle">ARTIFACT CENTER</p>
      <h1 className="mt-2 font-display text-4xl tracking-tight">See the result before you merge.</h1>
      <ul className="mt-8 space-y-4" data-testid="artifact-list">
        {rows.map((a) => (
          <li key={a.artifactId} className="rounded-lg bg-bg-elevated p-4 shadow-[var(--shadow-border)]">
            <p className="font-mono text-[11px] text-fg-subtle">{a.kind}</p>
            <p className="mt-1 font-medium">{a.title}</p>
            <p className="mt-2 text-sm text-fg-muted">{a.summary}</p>
            {isUiArtifact(a.kind, a.content) && a.content ? (
              <div className="mt-4">
                <ArtifactRenderer title={a.title} content={a.content} />
              </div>
            ) : null}
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-fg-muted">No artifacts published.</li>}
      </ul>
    </main>
  );
}

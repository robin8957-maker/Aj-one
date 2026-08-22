import { createFileRoute } from "@tanstack/react-router";
import { OverlayPalette } from "@/components/station/overlay-palette";

export const Route = createFileRoute("/overlay")({
  component: () => (
    <main className="min-h-dvh bg-transparent" data-testid="overlay-panel">
      <OverlayPalette floating={false} />
    </main>
  ),
});

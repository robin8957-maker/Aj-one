import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/aj/hooks")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST a signed event. Unsigned payloads are rejected.",
        }),
      POST: async ({ request }) => {
        const { getDaemon } = await import("@/daemon/ajd");
        const { getSessionUser } = await import("@/lib/auth/verify.server");
        const { dbSource } = await import("@/lib/db");
        const user = await getSessionUser();
        let operatorId = user?.id ?? "";
        if (!operatorId) {
          if (dbSource === "neon") {
            return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
          }
          operatorId = "local-operator";
        }
        const rawBody = await request.text();
        const event =
          request.headers.get("x-aj-event") ||
          request.headers.get("x-github-event") ||
          "";
        const timestamp =
          request.headers.get("x-aj-timestamp") ||
          request.headers.get("x-hub-timestamp") ||
          new Date().toISOString();
        const signature =
          request.headers.get("x-aj-signature") ||
          request.headers.get("x-hub-signature-256") ||
          "";
        const source = request.headers.get("x-aj-source") || (request.headers.get("x-github-event") ? "github" : "");
        const mode = request.headers.get("x-hub-signature-256") ? "github" : "aj";
        const deliveryId =
          request.headers.get("x-github-delivery") || request.headers.get("x-aj-delivery") || undefined;
        const ajd = getDaemon();
        const result = ajd.ingestExternalEvent(operatorId, {
          source,
          event,
          timestamp,
          signature,
          rawBody,
          mode,
          deliveryId,
        });
        return Response.json(result, { status: result.accepted ? 202 : 403 });
      },
    },
  },
});

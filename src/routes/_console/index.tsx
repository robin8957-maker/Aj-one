import { createFileRoute } from "@tanstack/react-router";
import { Workstation } from "@/components/station/workstation";

export const Route = createFileRoute("/_console/")({
  component: Workstation,
});

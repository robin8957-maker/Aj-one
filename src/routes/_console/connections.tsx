import { createFileRoute } from "@tanstack/react-router";
import { ControlPanel } from "./control";

export const Route = createFileRoute("/_console/connections")({
  component: ControlPanel,
});

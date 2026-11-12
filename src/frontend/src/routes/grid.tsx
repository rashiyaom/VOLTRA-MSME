import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/grid")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});

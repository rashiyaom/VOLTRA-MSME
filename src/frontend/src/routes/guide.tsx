import { createFileRoute } from "@tanstack/react-router";
import { VoltraUserGuide } from "@/components/VoltraUserGuide";

export const Route = createFileRoute("/guide")({
  head: () => ({
    meta: [
      { title: "Field Guide · VOLTRA" },
      {
        name: "description",
        content:
          "Learn to connect your device, read electrical telemetry, use circuit controls, and export your data.",
      },
    ],
  }),
  component: GuidePage,
});

function GuidePage() {
  return (
    <div className="workspace-page">
      <VoltraUserGuide />
    </div>
  );
}

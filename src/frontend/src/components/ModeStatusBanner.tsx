import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Radio, Unplug } from "lucide-react";
import { useVoltricsStore, type ConnectionState } from "@/stores/useVoltricsStore";
import { cn } from "@/lib/utils";

export function ModeStatusBanner({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { operatingMode, connectionState } = useVoltricsStore();
  const { location } = useRouterState();
  const isSettings = location.pathname.startsWith("/settings");
  const demo = operatingMode === "SIMULATED";
  const connected = connectionState.startsWith("CONNECTED_");
  const pending = connectionState === "CONNECTING" || connectionState === "SCANNING";
  const transports: Partial<Record<ConnectionState, string>> = {
    CONNECTED_BLE: "Bluetooth",
    CONNECTED_WIFI: "Local Wi-Fi",
    CONNECTED_SERIAL: "USB cable",
    CONNECTED_BLYNK: "Blynk Cloud",
  };
  const transport = transports[connectionState];
  const title = demo
    ? "Demo data"
    : pending
      ? "Connecting to device"
      : connected
        ? "Hardware connected"
        : "Waiting for hardware";
  const description = demo
    ? "Readings are simulated. Connect your ESP32 for physical measurements."
    : pending
      ? "Complete the device selection or wait for the connection check."
      : connected
        ? `Connected via ${transport}. Readings come from your device.`
        : "No device is connected. Zero readings mean data is unavailable.";
  const Icon = !demo && !connected && !pending ? Unplug : Radio;
  return (
    <div
      className={cn(
        "source-banner",
        compact && "compact",
        !demo && !connected && !pending && "offline",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {!isSettings && (
        <Link to="/settings">
          {demo ? "Connect device" : connected ? "Connection settings" : "Set up device"}
          <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

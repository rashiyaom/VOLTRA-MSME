import React from "react";
import { Zap, Activity, Gauge, Flame, Radio, AlertTriangle, Bluetooth, Wifi } from "lucide-react";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { cn } from "@/lib/utils";

interface LiveTelemetryBarProps {
  className?: string;
  showExtraMetrics?: boolean;
}

export function LiveTelemetryBar({ className, showExtraMetrics = true }: LiveTelemetryBarProps) {
  const { liveReading, operatingMode, connectionState, overloadState } = useVoltricsStore();

  const isOverload = overloadState.isOverloaded;
  const isRealTimeDisconnected = operatingMode === "REALTIME" && connectionState === "DISCONNECTED";

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4 backdrop-blur-xl shadow-sm transition-all",
        isOverload
          ? "border-red-500/50 bg-red-500/10 shadow-red-950/20"
          : "border-border bg-card/80 dark:border-white/[0.08] dark:bg-[#0c0d12]/90",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Left Indicator */}
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "size-8 rounded-lg border flex items-center justify-center shrink-0 transition-all",
              isOverload
                ? "border-red-500/40 bg-red-500/20 text-red-500"
                : isRealTimeDisconnected
                ? "border-border/70 bg-muted/40 text-muted-foreground"
                : connectionState === "CONNECTED_BLE"
                ? "border-blue-500/40 bg-blue-500/10 text-blue-500"
                : connectionState === "CONNECTED_WIFI" || connectionState === "CONNECTED_BLYNK"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-[#d2f831]"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
            )}
          >
            {isOverload ? (
              <AlertTriangle className="size-4 animate-bounce" />
            ) : isRealTimeDisconnected ? (
              <Activity className="size-4 text-muted-foreground" />
            ) : connectionState === "CONNECTED_BLE" ? (
              <Bluetooth className="size-4 animate-pulse" />
            ) : connectionState === "CONNECTED_WIFI" || connectionState === "CONNECTED_BLYNK" ? (
              <Wifi className="size-4 animate-pulse" />
            ) : (
              <Radio className="size-4 animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground dark:text-neutral-400">
                Live Electrical Telemetry
              </span>

              {/* Status pill */}
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold uppercase",
                  isOverload
                    ? "border-red-500/40 bg-red-500/20 text-red-500 animate-pulse"
                    : isRealTimeDisconnected
                    ? "border-border/70 bg-muted/40 text-muted-foreground"
                    : connectionState === "CONNECTED_BLE"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : connectionState === "CONNECTED_WIFI" || connectionState === "CONNECTED_BLYNK"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isOverload
                      ? "bg-red-500 animate-ping"
                      : isRealTimeDisconnected
                      ? "bg-neutral-500"
                      : connectionState === "CONNECTED_BLE"
                      ? "bg-blue-400 animate-pulse"
                      : connectionState === "CONNECTED_WIFI" || connectionState === "CONNECTED_BLYNK"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-cyan-400 animate-pulse",
                  )}
                />
                {isOverload
                  ? "CRITICAL OVERLOAD"
                  : isRealTimeDisconnected
                  ? "STANDBY (0.0V / 0.0A)"
                  : connectionState === "CONNECTED_BLE"
                  ? "BLE 10Hz STREAM"
                  : connectionState === "CONNECTED_WIFI"
                  ? "LAN WS/REST STREAM"
                  : connectionState === "CONNECTED_BLYNK"
                  ? "BLYNK CLOUD LIVE"
                  : connectionState === "CONNECTED_SERIAL"
                  ? "USB SERIAL LIVE"
                  : "DETERMINISTIC SIMULATION"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              {overloadState.alertMessage ? (
                <span className="text-red-400 font-bold">{overloadState.alertMessage}</span>
              ) : isRealTimeDisconnected ? (
                <span className="text-muted-foreground">Waiting for physical ESP32 connection • Real-time telemetry zeroed</span>
              ) : (
                `Bus Bar 1 · Phase A-N · ${liveReading.frequency.toFixed(2)} Hz Grid Frequency`
              )}
            </p>
          </div>
        </div>

        {/* 4 Core Electrical Telemetry Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:gap-4 divide-x-0 sm:divide-x divide-border dark:divide-white/[0.06]">
          {/* 1. Line Voltage */}
          <div className="sm:px-3 first:pl-0">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Line Voltage
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-lg sm:text-xl font-bold tracking-tight text-foreground dark:text-white">
                {liveReading.voltage_rms.toFixed(1)}
              </span>
              <span className="font-mono text-xs text-muted-foreground font-medium">V</span>
            </div>
          </div>

          {/* 2. Total Current */}
          <div className="sm:px-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Total Current
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span
                className={cn(
                  "font-mono text-lg sm:text-xl font-bold tracking-tight",
                  isOverload ? "text-red-500 animate-pulse" : "text-foreground dark:text-white",
                )}
              >
                {liveReading.current_rms.toFixed(2)}
              </span>
              <span className="font-mono text-xs text-muted-foreground font-medium">A</span>
            </div>
          </div>

          {/* 3. Real Power */}
          <div className="sm:px-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Active Power
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-lg sm:text-xl font-bold tracking-tight text-emerald-600 dark:text-[#d2f831]">
                {Math.round(liveReading.active_power).toLocaleString()}
              </span>
              <span className="font-mono text-xs text-muted-foreground font-medium">W</span>
            </div>
          </div>

          {/* 4. Power Factor */}
          <div className="sm:px-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
              Power Factor
            </span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="font-mono text-lg sm:text-xl font-bold tracking-tight text-foreground dark:text-white">
                {liveReading.power_factor.toFixed(2)}
              </span>
              <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">
                NOMINAL
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

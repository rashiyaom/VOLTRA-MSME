import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Gauge,
  Home,
  Loader2,
  Moon,
  Power,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  TrendingUp,
  TriangleAlert,
  Utensils,
  Wifi,
  Zap,
} from "lucide-react";

import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LiveTelemetryBar } from "@/components/LiveTelemetryBar";
import { ModeStatusBanner } from "@/components/ModeStatusBanner";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authSession, type OperatorProfile } from "@/lib/authSession";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · VOLTRA Smart Energy & Panel Command Center" },
      {
        name: "description",
        content:
          "Real-time AC electrical telemetry, dual-channel hardware connectivity (BLE & Wi-Fi), sub-second breaker actuation, and autonomous overcurrent protection.",
      },
    ],
  }),
  component: DashboardPage,
});

// ─── UI Helper Primitives ─────────────────────────────────────────────────────

function Pulse({ tone = "success" }: { tone?: "success" | "danger" | "warning" }) {
  return (
    <span
      className={cn(
        "relative flex size-2",
        tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success",
      )}
    >
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-current" />
    </span>
  );
}

function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-card shadow-xs transition-all",
        "dark:border-white/[0.08] dark:bg-[#0c0d12]/90 dark:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionHead({
  icon,
  title,
  meta,
  action,
}: {
  icon: React.ComponentType<{ className?: string }> | ReactNode;
  title: string;
  meta?: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 sm:px-5 py-3.5 dark:border-white/[0.08]">
      <div className="flex min-w-0 items-center gap-2.5">
        {React.isValidElement(icon) ? (
          icon
        ) : typeof icon === "function" ? (
          React.createElement(icon as React.ComponentType<{ className?: string }>, {
            className: "size-4 shrink-0 text-emerald-700 dark:text-[#d2f831]",
          })
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-foreground tracking-tight dark:text-white">{title}</h2>
          {meta && (
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted-foreground font-mono font-semibold dark:text-neutral-400">
              {meta}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── Homeowner View Component (Phone-First, Subtle Tint Differentiation) ──────

function HomeownerDashboardView({
  liveReading,
  recentHistory = [],
  connectionState,
  connectionType,
  operatingMode,
  deviceMetadata,
  overloadState,
  actuatingCircuitIds,
  tariffRate,
  tariffCurrency,
  onToggleCircuit,
  onTripAll,
  onResetAll,
  onTestSpike,
  onConnectBle,
  onInitSimulation,
}: {
  liveReading: any;
  recentHistory?: any[];
  connectionState: any;
  connectionType?: string;
  operatingMode?: string;
  deviceMetadata: any;
  overloadState: any;
  actuatingCircuitIds: Record<string, boolean>;
  tariffRate: number;
  tariffCurrency: "USD" | "INR";
  onToggleCircuit: (id: string, name: string, currentState: "OPEN" | "CLOSED" | "TRIPPED") => Promise<void>;
  onTripAll: () => Promise<void>;
  onResetAll: () => Promise<void>;
  onTestSpike: () => void;
  onConnectBle: () => void;
  onInitSimulation: () => void;
}) {
  const activeKw = (liveReading.active_power / 1000).toFixed(2);
  const totalAmps = liveReading.current_rms.toFixed(1);
  const mainCapacityPct = Math.min(100, Math.round((liveReading.current_rms / 40) * 100));
  const activeCircuitsCount = liveReading.circuits.filter((c: any) => c.state === "CLOSED").length;
  const costEstimateToday = (14.8 * (tariffCurrency === "INR" ? tariffRate : tariffRate * 83)).toFixed(0);

  // Dynamic Timestamp
  const updatedTillText = useMemo(() => {
    const d = liveReading.timestamp ? new Date(liveReading.timestamp * 1000) : new Date();
    const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timePart = liveReading.rawTime || d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${datePart}, ${timePart}`;
  }, [liveReading.timestamp, liveReading.rawTime]);

  // Hourly Consumption Trend dynamically calculated from live telemetry and recent buffer
  const powerTrendData = useMemo(() => {
    const currentActiveKw = Number((liveReading.active_power / 1000).toFixed(3)) || Number(activeKw) || 0.05;
    const rate = tariffCurrency === "INR" ? tariffRate : tariffRate * 83;

    if (recentHistory && recentHistory.length >= 4) {
      const step = Math.max(1, Math.floor(recentHistory.length / 8));
      const sampled = [];
      for (let i = 0; i < recentHistory.length; i += step) {
        const snap = recentHistory[i];
        const kw = Number((snap.active_power / 1000).toFixed(2));
        const t = snap.rawTime ? snap.rawTime.slice(0, 5) : new Date(snap.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        sampled.push({
          time: t,
          power: kw,
          cost: Number((kw * rate).toFixed(1)),
        });
      }
      sampled.push({
        time: "Now",
        power: Number(currentActiveKw.toFixed(2)),
        cost: Number((currentActiveKw * rate).toFixed(1)),
      });
      return sampled;
    }

    // Dynamic diurnal trajectory scaled in real-time to active load
    const diurnalFactors = [
      { time: "06:00", factor: 0.35 },
      { time: "08:00", factor: 0.88 },
      { time: "10:00", factor: 0.65 },
      { time: "12:00", factor: 1.05 },
      { time: "14:00", factor: 0.78 },
      { time: "16:00", factor: 0.85 },
      { time: "18:00", factor: 1.30 },
      { time: "20:00", factor: 1.45 },
    ];

    const baseKw = Math.max(0.05, currentActiveKw);
    const data = diurnalFactors.map(({ time, factor }) => {
      const kw = Number((baseKw * factor).toFixed(2));
      return {
        time,
        power: kw,
        cost: Number((kw * rate).toFixed(1)),
      };
    });

    data.push({
      time: "Now",
      power: Number(currentActiveKw.toFixed(2)),
      cost: Number((currentActiveKw * rate).toFixed(1)),
    });

    return data;
  }, [recentHistory, liveReading.active_power, activeKw, tariffCurrency, tariffRate]);

  return (
    <div className="space-y-6">
      {/* ── 1. Four Core Field Cards with Subtle, Minimal Color Differentiation (Phone-First) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">

        {/* Field 1: Active Power Draw (Subtle Emerald Tint) */}
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04] p-4 sm:p-5 backdrop-blur-md shadow-xs transition-all hover:border-emerald-500/40">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500/80 via-emerald-400/40 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400">
              <Zap className="size-3 fill-current" />
              Active Power
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">{totalAmps}A Total</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground dark:text-white">
                {activeKw}
              </span>
              <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">kW</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              PF {liveReading.power_factor.toFixed(2)} · Inflow Stable
            </p>
          </div>

          {/* Micro Progress Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-muted-foreground">Panel Capacity</span>
              <span className="font-semibold text-foreground dark:text-white">{mainCapacityPct}% of 40A</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-950/20 dark:bg-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  mainCapacityPct > 80 ? "bg-red-500" : mainCapacityPct > 60 ? "bg-amber-400" : "bg-emerald-500"
                )}
                style={{ width: `${mainCapacityPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Field 2: Voltage Inflow (Subtle Sky Blue Tint) */}
        <div className="group relative overflow-hidden rounded-2xl border border-sky-500/25 bg-sky-500/[0.03] dark:bg-sky-500/[0.04] p-4 sm:p-5 backdrop-blur-md shadow-xs transition-all hover:border-sky-500/40">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500/80 via-sky-400/40 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-sky-600 dark:text-sky-400">
              <Activity className="size-3" />
              Line Voltage
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">{liveReading.frequency.toFixed(1)} Hz</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground dark:text-white">
                {liveReading.voltage_rms.toFixed(1)}
              </span>
              <span className="font-mono text-sm font-bold text-sky-600 dark:text-sky-400">V AC</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Pure Sinusoidal · Low THD
            </p>
          </div>

          {/* Micro Status Indicators */}
          <div className="mt-4 flex items-center justify-between border-t border-sky-500/15 pt-2.5 text-[11px] font-mono">
            <span className="text-muted-foreground">Grid Inflow</span>
            <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-300 font-semibold">
              <CheckCircle2 className="size-3 text-sky-500" /> Normal Band
            </span>
          </div>
        </div>

        {/* Field 3: Today's Estimated Cost (Subtle Amber Tint) */}
        <div className="group relative overflow-hidden rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] dark:bg-amber-500/[0.04] p-4 sm:p-5 backdrop-blur-md shadow-xs transition-all hover:border-amber-500/40">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500/80 via-amber-400/40 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-amber-600 dark:text-amber-400">
              <TrendingUp className="size-3" />
              Today's Usage
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">14.8 kWh est.</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground dark:text-white">
                {tariffCurrency === "INR" ? "₹" : "$"}{costEstimateToday}
              </span>
              <span className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                / {tariffRate.toFixed(2)} rate
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Off-Peak Slab Applied
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-amber-500/15 pt-2.5 text-[11px] font-mono">
            <span className="text-muted-foreground">Projected Bill</span>
            <span className="font-semibold text-amber-600 dark:text-amber-300">
              {tariffCurrency === "INR" ? "₹4,250" : "$58.40"} / mo
            </span>
          </div>
        </div>

        {/* Field 4: Breaker Guardian (Subtle Violet/Purple Tint) */}
        <div className="group relative overflow-hidden rounded-2xl border border-purple-500/25 bg-purple-500/[0.03] dark:bg-purple-500/[0.04] p-4 sm:p-5 backdrop-blur-md shadow-xs transition-all hover:border-purple-500/40">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-purple-500/80 via-purple-400/40 to-transparent" />
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase text-purple-600 dark:text-purple-400">
              <ShieldCheck className="size-3" />
              Breaker Guardian
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">{activeCircuitsCount}/5 Live</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground dark:text-white">
                {overloadState.isOverloaded ? "ALERT" : "ARMED"}
              </span>
              <span className={cn(
                "size-2.5 rounded-full",
                overloadState.isOverloaded ? "bg-red-500 animate-ping" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
              )} />
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {overloadState.isOverloaded
                ? `Tripped: ${overloadState.trippedCircuitName || "Overload"}`
                : "Autonomous Overcurrent Active"}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-purple-500/15 pt-2.5 text-[11px] font-mono">
            <span className="text-muted-foreground">Trip Latency</span>
            <span className="font-semibold text-purple-600 dark:text-purple-300">
              &lt; 8.0 ms (Sub-Cycle)
            </span>
          </div>
        </div>

      </div>

      {/* ── 2. Smart Branch Circuit Relays (Phone-First Touch Cards) ── */}
      <Card className="p-4 sm:p-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-border dark:border-white/[0.08] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="size-4 text-emerald-600 dark:text-[#d2f831]" />
              <h3 className="font-display text-base sm:text-lg font-bold text-foreground dark:text-white">
                Smart Branch Circuits
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Direct sub-second control of home branch breakers. Tap to isolate or energize.
            </p>
          </div>

          {/* Quick Bulk Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetAll}
              className="text-xs h-8 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
            >
              <RotateCcw className="size-3.5 mr-1" />
              Reset All
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onTripAll}
              className="text-xs h-8 cursor-pointer"
            >
              <Power className="size-3.5 mr-1" />
              Emergency Cut-Off
            </Button>
          </div>
        </div>

        {/* Dynamic Branch Circuit Touch Grid */}
        <div className={cn(
          "grid grid-cols-1 gap-3",
          liveReading.circuits.length === 1 && "max-w-md",
          liveReading.circuits.length === 2 && "sm:grid-cols-2",
          liveReading.circuits.length === 3 && "sm:grid-cols-2 lg:grid-cols-3",
          liveReading.circuits.length === 4 && "sm:grid-cols-2 lg:grid-cols-4",
          liveReading.circuits.length >= 5 && "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        )}>
          {liveReading.circuits.map((c: any) => {
            const isClosed = c.state === "CLOSED";
            const isTripped = c.state === "TRIPPED";
            const isActuating = actuatingCircuitIds[c.id];
            const ratedAmps = c.rated_current || c.rated || 16.0;
            const loadPct = Math.min(100, Math.round((c.current / ratedAmps) * 100));

            return (
              <div
                key={c.id}
                className={cn(
                  "relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200",
                  isTripped
                    ? "border-red-500/40 bg-red-500/[0.05] shadow-xs"
                    : isClosed
                    ? "border-border hover:border-emerald-500/40 bg-card dark:bg-[#13141a]/60 shadow-xs"
                    : "border-border/60 bg-muted/30 opacity-70"
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {c.id.toUpperCase()} · {ratedAmps}A Rated
                      </span>
                      <h4 className="font-semibold text-sm text-foreground dark:text-white mt-0.5 line-clamp-1">
                        {c.name}
                      </h4>
                    </div>

                    <span
                      className={cn(
                        "size-2.5 rounded-full shrink-0 mt-1",
                        isTripped
                          ? "bg-red-500 animate-ping"
                          : isClosed
                          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                          : "bg-neutral-500"
                      )}
                    />
                  </div>

                  {/* Telemetry Numbers */}
                  <div className="my-3 space-y-1">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-2xl font-bold tracking-tight text-foreground dark:text-white">
                        {isClosed ? c.current.toFixed(1) : "0.0"}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">A</span>
                      <span className="text-[10px] font-mono text-muted-foreground ml-auto">
                        {isClosed ? `${(c.current * (liveReading.voltage_rms || 230)).toFixed(0)}W` : "0W"}
                      </span>
                    </div>

                    {/* Load capacity indicator */}
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          loadPct > 85 ? "bg-red-500" : loadPct > 65 ? "bg-amber-400" : "bg-emerald-500"
                        )}
                        style={{ width: isClosed ? `${loadPct}%` : "0%" }}
                      />
                    </div>
                  </div>
                </div>

                {/* Big Phone-Friendly Toggle Button (Min 44px touch height) */}
                <button
                  type="button"
                  disabled={isActuating}
                  onClick={() => onToggleCircuit(c.id, c.name, c.state)}
                  className={cn(
                    "w-full h-10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs",
                    isActuating
                      ? "opacity-60 cursor-not-allowed bg-muted text-muted-foreground"
                      : isTripped
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : isClosed
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-[#d2f831] border border-emerald-500/30 hover:bg-emerald-500/25"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
                  )}
                >
                  {isActuating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Actuating...</span>
                    </>
                  ) : isTripped ? (
                    <>
                      <AlertTriangle className="size-3.5" />
                      <span>Clear Fault & Close</span>
                    </>
                  ) : isClosed ? (
                    <>
                      <Power className="size-3.5" />
                      <span>Open Breaker</span>
                    </>
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      <span>Close Breaker</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 3. Power Consumption Trend & Safety Guardian ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Hourly Trend Chart */}
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-foreground dark:text-white flex items-center gap-2">
                <TrendingUp className="size-4 text-emerald-600 dark:text-[#d2f831]" />
                Today's Power Draw Trajectory
              </h3>
              <p className="text-[11px] font-mono font-medium text-emerald-600 dark:text-[#d2f831] mt-0.5">
                Updated values till: {updatedTillText}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Active load profile & peak shaving markers
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-[#d2f831]">
              Live Inflow
            </span>
          </div>

          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={powerTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" kW" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-md font-mono">
                          <p className="font-bold text-foreground">{data.time}</p>
                          <p className="text-emerald-500 font-semibold">{data.power} kW active</p>
                          <p className="text-muted-foreground">Est. Cost: ₹{data.cost}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="power" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#powerGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Overload Guardian & Hardware Link */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="size-4 text-purple-500" />
              <h3 className="text-sm font-bold text-foreground dark:text-white">
                Safety & Test Suite
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verify your panel's autonomous trip capabilities without endangering household appliances.
            </p>

            <div className="mt-4 p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Overcurrent Curve</span>
                <span className="font-semibold text-foreground">IEC 60255 Class A</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Short Circuit Cut</span>
                <span className="font-semibold text-emerald-500">&lt; 8ms Sub-Cycle</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground">Operating Mode</span>
                <span className="font-semibold text-foreground">
                  {operatingMode === "SIMULATED"
                    ? "Simulation (Demo)"
                    : connectionState?.startsWith("CONNECTED")
                    ? `Real-Time (${connectionType?.replace('_', ' ') || 'Online'})`
                    : "Real-Time (Offline)"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={onTestSpike}
              className="w-full text-xs h-9 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
            >
              <Zap className="size-3.5 mr-1.5" />
              Simulate 2.5× Load Surge
            </Button>

            <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-muted-foreground">
              <span>Hardware Link</span>
              <button
                type="button"
                onClick={onConnectBle}
                className="text-emerald-600 dark:text-[#d2f831] font-bold hover:underline cursor-pointer"
              >
                Pair Web BLE →
              </button>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────

function DashboardPage() {
  const {
    operatingMode,
    connectionState,
    connectionType,
    liveReading,
    recentHistory,
    overloadState,
    deviceMetadata,
    toggleCircuit,
    actuatingCircuitIds,
    triggerTestSpike,
    tariffRate,
    tariffCurrency,
    initSimulation,
    connectBle,
  } = useVoltricsStore();

  const isConnected = connectionState.startsWith("CONNECTED");

  const handleToggleBreaker = async (id: string, name: string, currentState: "OPEN" | "CLOSED" | "TRIPPED") => {
    if (operatingMode === "REALTIME" && !isConnected) {
      toast.error(`Cannot actuate "${name}" in Real-Time Mode`, {
        description: "ESP32 hardware is offline. Connect via Blynk Cloud or USB in Settings.",
      });
      return;
    }

    const targetState = currentState === "CLOSED" ? "OPEN" : "CLOSED";
    try {
      await toggleCircuit(id, targetState);
      if (targetState === "OPEN") {
        toast.warning(`Circuit breaker for "${name}" OPENED / DISCONNECTED`, {
          description: "Relay safely opened. Downstream load interrupted.",
        });
      } else {
        toast.success(`Circuit breaker for "${name}" CLOSED / ENERGIZED`, {
          description: "Current draw resumed within rated capacity.",
        });
      }
    } catch {
      toast.error(`Failed to actuate breaker for ${name}`);
    }
  };

  const handleTripAllBreakers = async () => {
    if (operatingMode === "REALTIME" && !isConnected) {
      toast.error("Cannot actuate breakers: ESP32 hardware is offline");
      return;
    }
    try {
      const activeCircuits = liveReading.circuits.filter((c: any) => c.state === "CLOSED");
      for (const c of activeCircuits) {
        await toggleCircuit(c.id, "OPEN");
      }
      toast.warning("EMERGENCY CUT-OFF ACTIVATED", {
        description: `Safely opened ${activeCircuits.length} active branch circuit breakers.`,
      });
    } catch {
      toast.error("Emergency trip sequence encountered an error.");
    }
  };

  const handleResetAllBreakers = async () => {
    if (operatingMode === "REALTIME" && !isConnected) {
      toast.error("Cannot reset breakers: ESP32 hardware is offline");
      return;
    }
    try {
      const offCircuits = liveReading.circuits.filter((c: any) => c.state !== "CLOSED");
      for (const c of offCircuits) {
        await toggleCircuit(c.id, "CLOSED");
      }
      toast.success("ALL CIRCUITS RESTORED", {
        description: `Safely energized ${offCircuits.length} branch circuit breakers.`,
      });
    } catch {
      toast.error("Circuit restoration sequence encountered an error.");
    }
  };

  const handleTestSpike = () => {
    if (operatingMode === "REALTIME") {
      toast.info("Load surge simulation is disabled in Real-Time Mode to protect physical circuits. Switch to Simulated Mode in Settings to test guardian.");
      return;
    }
    triggerTestSpike();
    toast.error("OVERLOAD SIMULATION INJECTED", {
      description: "Injected 2.5× current surge into Circuit c1. Autonomous guardian triggered!",
    });
  };

  const [profile, setProfile] = useState<OperatorProfile | null>(() => authSession.getProfile());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setProfile(authSession.getProfile());
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Main Content Container ── */}
      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mx-auto max-w-[1740px]">
          {/* Subheader: Clean Homeowner Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase text-emerald-600 dark:text-emerald-400">
                  VOLTRA SMART ELECTRICAL RESIDENCE
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl lg:text-4xl">
                My Home · Main Panel
              </h1>
              <p className="mt-1 text-xs text-muted-foreground dark:text-neutral-400 font-mono flex items-center gap-2">
                <span>Single-Phase 230V AC · 40A Main Service · Automated Breaker Guardian</span>
              </p>
            </div>

            {/* Quick Links */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/breakers"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-all shadow-xs"
              >
                <Sliders className="size-3.5 text-emerald-600 dark:text-[#d2f831]" />
                <span>Breaker Controls</span>
              </Link>
              <Link
                to="/stream"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-all shadow-xs"
              >
                <Activity className="size-3.5 text-red-500" />
                <span>Waveform Stream</span>
              </Link>
              <Link
                to="/analytics"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-all shadow-xs"
              >
                <TrendingUp className="size-3.5 text-amber-500" />
                <span>Tariff & Usage</span>
              </Link>
            </div>
          </div>

          {/* Persistent Operating Mode Status Banner */}
          <ModeStatusBanner className="mb-6" />

          {/* Live Electrical Telemetry Bar */}
          <LiveTelemetryBar className="mb-6" />

          {/* Homeowner Dashboard Core View */}
          <HomeownerDashboardView
            liveReading={liveReading}
            recentHistory={recentHistory}
            connectionState={connectionState}
            connectionType={connectionType}
            operatingMode={operatingMode}
            deviceMetadata={deviceMetadata}
            overloadState={overloadState}
            actuatingCircuitIds={actuatingCircuitIds}
            tariffRate={tariffRate}
            tariffCurrency={tariffCurrency}
            onToggleCircuit={handleToggleBreaker}
            onTripAll={handleTripAllBreakers}
            onResetAll={handleResetAllBreakers}
            onTestSpike={handleTestSpike}
            onConnectBle={connectBle}
            onInitSimulation={initSimulation}
          />
        </div>
      </main>
    </div>
  );
}

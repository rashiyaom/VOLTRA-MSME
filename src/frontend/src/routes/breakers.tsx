import { createFileRoute, Link } from "@tanstack/react-router";
import React from "react";
import {
  Zap,
  Activity,
  Power,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  Flame,
} from "lucide-react";
import { LiveTelemetryBar } from "@/components/LiveTelemetryBar";
import { ModeStatusBanner } from "@/components/ModeStatusBanner";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/breakers")({
  head: () => ({
    meta: [
      { title: "Breakers & Circuit Control · VOLTRA Smart Energy" },
      {
        name: "description",
        content:
          "Monitor and control physical branch circuit breakers. Real-time amperage telemetry, load capacity, and smart relay tripping.",
      },
    ],
  }),
  component: BreakersPage,
});

function BreakersPage() {
  const {
    operatingMode,
    connectionState,
    liveReading,
    actuatingCircuitIds,
    overloadState,
    toggleCircuit,
    triggerTestSpike,
    clearTestSpike,
  } = useVoltricsStore();

  const circuits = liveReading.circuits;
  const isConnected = connectionState.startsWith('CONNECTED');

  const handleToggle = async (id: string, name: string, currentState: 'OPEN' | 'CLOSED' | 'TRIPPED') => {
    if (operatingMode === 'REALTIME' && !isConnected) {
      toast.error(`Cannot actuate "${name}" in Real-Time Mode`, {
        description: "ESP32 hardware is offline. Connect via Blynk Cloud or USB in Settings.",
      });
      return;
    }

    const targetState = currentState === 'CLOSED' ? 'OPEN' : 'CLOSED';
    try {
      await toggleCircuit(id, targetState);
      if (targetState === 'OPEN') {
        toast.warning(`${name} turned off`, {
          description: "The relay command was accepted. Blynk will synchronize the V3/V4 command state.",
        });
      } else {
        toast.success(`${name} turned on`, {
          description: "The relay command was accepted. Blynk will synchronize the V3/V4 command state.",
        });
      }
    } catch (err: any) {
      toast.error(`Actuation Failure on "${name}"`, {
        description: err.message || "Hardware command timed out (>2000ms).",
      });
    }
  };

  const activeCircuitsCount = circuits.filter((c) => c.state === "CLOSED").length;
  const isOverallOverload = overloadState.isOverloaded;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mx-auto max-w-[1740px] space-y-6">
          {/* Header Section */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-[#d2f831] font-mono">
                SUB-PANEL CIRCUIT BREAKER TELEMETRY
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl lg:text-4xl">
                Branch Circuits & Breakers
              </h1>
              <p className="mt-1 text-xs text-muted-foreground dark:text-neutral-400 font-mono">
                Physical Solid-State Relay Matrix · Active Relays: {activeCircuitsCount}/{circuits.length}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Test Overload Spike Button */}
              <button
                type="button"
                onClick={() => {
                  if (operatingMode === "REALTIME") {
                    toast.info("Overload injection is disabled in Real-Time Mode to protect physical circuits. Switch to Simulated Mode to test guardian.");
                    return;
                  }
                  if (isOverallOverload) {
                    clearTestSpike();
                    toast.info("Overload test spike cleared.");
                  } else {
                    triggerTestSpike();
                    toast.warning("Injecting Overload Spike on HVAC (c1)...", {
                      description: "Guardian will auto-trip after 3 consecutive ticks (>16A).",
                    });
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer shadow-sm",
                  isOverallOverload
                    ? "border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20",
                )}
              >
                <Flame className="size-3.5" />
                <span>{isOverallOverload ? "Clear Overload Test" : "Simulate Overload Spike"}</span>
              </button>

              <Link
                to="/analytics"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm dark:border-white/[0.1] dark:bg-[#111216]/90 dark:text-white"
              >
                <Sliders className="size-3.5 text-emerald-600 dark:text-[#d2f831]" />
                <span>View Tariff Simulator</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  if (operatingMode === "REALTIME" && !isConnected) {
                    toast.error("Cannot reset relays: Physical ESP32 is offline");
                    return;
                  }
                  circuits.forEach((c) => {
                    if (c.state !== "CLOSED") {
                      toggleCircuit(c.id, "CLOSED").catch(() => {});
                    }
                  });
                  toast.success("Reset command dispatched for all relays");
                }}
                className="flex items-center gap-2 h-10 rounded-lg border border-border bg-muted/60 hover:bg-muted px-4 text-xs font-semibold text-foreground transition-all cursor-pointer shadow-sm dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-white dark:hover:bg-white/[0.12]"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset All Relays</span>
              </button>
            </div>
          </div>

          {/* Persistent Operating Mode Status Banner */}
          <ModeStatusBanner />

          {/* 1. Live Electrical Telemetry Bar */}
          <LiveTelemetryBar />

          {/* Critical Overload Warning Banner if triggered */}
          {isOverallOverload && (
            <div className="rounded-xl border border-red-500/50 bg-red-500/15 p-4 text-red-400 flex items-center justify-between backdrop-blur-md animate-pulse">
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 shrink-0 text-red-400" />
                <div>
                  <h3 className="text-sm font-bold font-mono">
                    {overloadState.alertMessage || "CRITICAL OVERLOAD DETECTED"}
                  </h3>
                  <p className="text-xs text-red-300">
                    Overload Guardian sustained threshold violation (&gt;3 ticks). Breaker isolation triggered.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={clearTestSpike}
                className="font-bold text-xs"
              >
                Reset Guardian
              </Button>
            </div>
          )}

          {/* 2. Circuit Cards Grid */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {circuits.map((circuit, idx) => {
              const isClosed = circuit.state === "CLOSED";
              const isActuating = !!actuatingCircuitIds[circuit.id];
              const loadPct = Math.min(150, Math.round((circuit.current / circuit.rated) * 100));
              const isOverloaded = circuit.current >= circuit.rated && isClosed;
              const isHighLoad = circuit.current >= circuit.rated * 0.75 && isClosed && !isOverloaded;
              const powerW = Math.round(liveReading.voltage_rms * circuit.current * 0.98);

              return (
                <div
                  key={circuit.id}
                  className={cn(
                    "rounded-xl border p-5 backdrop-blur-md transition-all shadow-sm flex flex-col justify-between min-h-[290px]",
                    isOverloaded
                      ? "border-red-500/40 bg-red-500/5 dark:bg-[#180a0d]/90 shadow-red-950/20"
                      : isHighLoad
                      ? "border-amber-500/30 bg-amber-500/5 dark:bg-[#17130a]/90"
                      : "border-border bg-card dark:border-white/[0.08] dark:bg-[#0c0d12]/90",
                  )}
                >
                  {/* Card Header & Status Pill */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                          Zone {idx + 1} · Sub-Panel A
                        </span>
                        <h2 className="mt-1 font-display text-base font-bold text-foreground dark:text-white">
                          {circuit.name}
                        </h2>
                      </div>

                      {/* Status Pill */}
                      <div>
                        {isActuating ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-cyan-400 uppercase">
                            <Loader2 className="size-2.5 animate-spin" />
                            ACTUATING
                          </span>
                        ) : operatingMode === "REALTIME" && !isConnected ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-rose-400 uppercase">
                            <span className="size-1.5 rounded-full bg-rose-500" />
                            OFFLINE / ZERO
                          </span>
                        ) : !isClosed ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-500/30 bg-neutral-500/10 px-2 py-0.5 text-[9px] font-mono font-bold text-neutral-400 uppercase">
                            <span className="size-1.5 rounded-full bg-neutral-400" />
                            {circuit.state === "TRIPPED" ? "SAFETY TRIP" : "RELAY OFF"}
                          </span>
                        ) : isOverloaded ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[9px] font-mono font-bold text-red-500 uppercase animate-pulse">
                            <span className="size-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                            OVERLOADED
                          </span>
                        ) : isHighLoad ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[9px] font-mono font-bold text-amber-500 uppercase">
                            <span className="size-1.5 rounded-full bg-amber-500" />
                            HIGH LOAD
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            NORMAL
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amperage and Rating */}
                    <div className="mt-4 flex items-baseline justify-between border-y border-border/60 py-3 dark:border-white/[0.06]">
                      <div>
                        <span className="text-[10px] uppercase font-mono text-muted-foreground font-semibold">
                          Current Draw
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span
                            className={cn(
                              "font-mono text-3xl font-bold tracking-tight",
                              !isClosed
                                ? "text-neutral-500"
                                : isOverloaded
                                ? "text-red-500"
                                : isHighLoad
                                ? "text-amber-500"
                                : "text-foreground dark:text-white",
                            )}
                          >
                            {circuit.current.toFixed(1)}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground font-medium">A</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-mono text-muted-foreground font-semibold">
                          Rated Capacity
                        </span>
                        <p className="mt-0.5 font-mono text-sm font-bold text-muted-foreground dark:text-neutral-300">
                          {circuit.rated}A Rated
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                        <span className="text-muted-foreground">Load Utilization</span>
                        <span
                          className={cn(
                            "font-bold",
                            isOverloaded
                              ? "text-red-500"
                              : isHighLoad
                              ? "text-amber-500"
                              : "text-foreground dark:text-neutral-300",
                          )}
                        >
                          {loadPct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-neutral-800">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            !isClosed
                              ? "bg-neutral-600 w-0"
                              : isOverloaded
                              ? "bg-red-500 shadow-[0_0_8px_#ef4444]"
                              : isHighLoad
                              ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]"
                              : "bg-emerald-500 dark:bg-[#d2f831] shadow-[0_0_8px_rgba(16,185,129,0.5)]",
                          )}
                          style={{ width: `${Math.min(100, isClosed ? loadPct : 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Power and Relay Toggle Switch */}
                  <div className="mt-5 pt-3 border-t border-border/60 dark:border-white/[0.06] flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                        Real Power
                      </p>
                      <p className="font-mono text-xs font-semibold text-foreground dark:text-neutral-200">
                        {isClosed ? `${powerW.toLocaleString()} W` : "0 W"}
                      </p>
                    </div>

                    {/* Interactive Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isClosed}
                      aria-label={`${isClosed ? "Turn off" : "Turn on"} ${circuit.name}`}
                      disabled={isActuating}
                      onClick={() => handleToggle(circuit.id, circuit.name, circuit.state)}
                      className={cn(
                        "group relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50",
                        isClosed
                          ? "border-emerald-500 bg-emerald-500/20 dark:border-[#d2f831] dark:bg-[#d2f831]/20"
                          : "border-red-500 bg-red-500/20",
                      )}
                      title={`${isClosed ? "Turn off" : "Turn on"} ${circuit.name}${connectionState === "CONNECTED_BLYNK" && idx < 2 ? ` through Blynk V${idx + 3}` : ""}`}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block size-6 transform rounded-full shadow-md transition duration-200 ease-in-out flex items-center justify-center text-[10px] font-bold font-mono",
                          isClosed
                            ? "translate-x-8 bg-emerald-500 text-white dark:bg-[#d2f831] dark:text-neutral-950"
                            : "translate-x-0 bg-red-500 text-white",
                        )}
                      >
                        {isActuating ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Power className="size-3" />
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* AI Recommendation Banner */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 dark:border-[#d2f831]/25 dark:bg-[#d2f831]/5 backdrop-blur-md">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:border-lime-500/30 dark:bg-lime-500/10 dark:text-[#d2f831] shrink-0 mt-0.5">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-foreground dark:text-white flex items-center gap-2">
                    VOLTRA AI Breaker Advisory
                    <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-[#d2f831]">
                      OPTIMIZATION READY
                    </span>
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-neutral-300 leading-relaxed">
                    EV charging between 18:00 and 21:00 coincides with peak HVAC cycle. Shifting EV charging to off-peak hours (after 23:00) will reduce peak demand load by ~35% and avoid nuisance tripping on Sub-Panel A.
                  </p>
                </div>
              </div>

              <Button
                asChild
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-[#d2f831] dark:hover:bg-[#c2ea24] dark:text-neutral-950 font-bold shrink-0"
              >
                <Link to="/analytics">Simulate Load Shift</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

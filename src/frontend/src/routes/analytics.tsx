import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Sliders,
  FileSpreadsheet,
  FileText,
  TrendingDown,
  Sparkles,
  Zap,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Coins,
  Sun,
  Layers,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { LiveTelemetryBar } from "@/components/LiveTelemetryBar";
import {
  voltricsStore,
  HOURLY_CONSUMPTION_DATA,
  type HourlyConsumptionPoint,
} from "@/lib/voltricsStore";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Indian Rupee Tariff Simulator · VOLTRA Smart Energy" },
      {
        name: "description",
        content:
          "Explore measured snapshots alongside clearly labeled 24-hour load, solar, tariff, and monthly cost scenarios.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const DIURNAL_WEIGHTS = [
  0.28, 0.22, 0.18, 0.18, 0.22, 0.32, 0.65, 1.10, 1.35, 1.25, 1.05, 0.98,
  1.02, 1.08, 1.18, 1.28, 1.42, 1.75, 2.15, 2.25, 2.05, 1.60, 1.15, 0.68,
];

function AnalyticsPage() {
  const { liveReading, recentHistory, tariffRate, setTariff } = useVoltricsStore();
  const [utilityRate, setUtilityRate] = useState<number>(() => tariffRate || 7.5);

  const updatedTillText = useMemo(() => {
    const d = liveReading.timestamp ? new Date(liveReading.timestamp * 1000) : new Date();
    const datePart = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timePart = liveReading.rawTime || d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${datePart}, ${timePart}`;
  }, [liveReading.timestamp, liveReading.rawTime]);

  const handleRateChange = (newRate: number) => {
    setUtilityRate(newRate);
    setTariff(newRate, "INR");
    voltricsStore.setUtilityRate(newRate);
  };

  // Dynamically calculate 24-hour profile from live system telemetry
  const enrichedHourlyData = useMemo(() => {
    const currentActiveKw = (liveReading.active_power > 0 ? liveReading.active_power : liveReading.voltage_rms * liveReading.current_rms) / 1000;
    const scaleBase = Math.max(0.6, currentActiveKw * 3.2);

    const historyHourMap = new Map<number, number[]>();
    if (recentHistory && recentHistory.length > 0) {
      recentHistory.forEach((snap) => {
        let h = new Date(snap.timestamp * 1000).getHours();
        if (snap.rawTime && snap.rawTime.includes(":")) {
          const parsed = parseInt(snap.rawTime.split(":")[0], 10);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 23) {
            h = parsed;
          }
        }
        const kw = snap.active_power > 0 ? snap.active_power / 1000 : (snap.voltage_rms * snap.current_rms) / 1000;
        if (!historyHourMap.has(h)) {
          historyHourMap.set(h, []);
        }
        historyHourMap.get(h)!.push(kw);
      });
    }

    return Array.from({ length: 24 }, (_, i) => {
      const hourStr = `${String(i).padStart(2, "0")}:00`;
      const isPeak = i >= 17 && i <= 21;

      let kwh = 0;
      if (historyHourMap.has(i) && historyHourMap.get(i)!.length > 0) {
        const samples = historyHourMap.get(i)!;
        const avgKw = samples.reduce((a, b) => a + b, 0) / samples.length;
        kwh = Number(avgKw.toFixed(1));
      } else {
        kwh = Number((DIURNAL_WEIGHTS[i] * scaleBase).toFixed(1));
      }
      if (kwh <= 0.1) kwh = 0.2;

      let solarKwh = 0;
      if (i >= 7 && i <= 17) {
        const peakOffset = Math.abs(i - 12);
        const solarPeak = Math.max(1.5, Math.min(5.0, scaleBase * 0.85));
        solarKwh = Number(Math.max(0, solarPeak - peakOffset * 0.45).toFixed(1));
      }

      const netGridKwh = Number(Math.max(0.1, kwh - solarKwh).toFixed(1));
      const cost = Number((kwh * utilityRate).toFixed(2));

      return {
        hour: hourStr,
        kwh,
        solarKwh,
        netGridKwh,
        isPeak,
        cost,
      };
    });
  }, [liveReading.active_power, liveReading.voltage_rms, liveReading.current_rms, recentHistory, utilityRate]);

  const peakKwhTotal = useMemo(
    () => enrichedHourlyData.filter((p) => p.isPeak).reduce((s, p) => s + p.kwh, 0),
    [enrichedHourlyData]
  );
  const totalDailyKwh = useMemo(
    () => enrichedHourlyData.reduce((s, p) => s + p.kwh, 0),
    [enrichedHourlyData]
  );
  const totalSolarDaily = useMemo(
    () => enrichedHourlyData.reduce((s, p) => s + p.solarKwh, 0),
    [enrichedHourlyData]
  );
  const peakLoadPct = totalDailyKwh > 0 ? Math.round((peakKwhTotal / totalDailyKwh) * 100) : 0;

  const projections = useMemo(() => {
    const monthlyKwh = totalDailyKwh * 30;
    const baselineBill = monthlyKwh * utilityRate;
    const loadShiftSavingsPct = 28;
    const projectedOptimizedBill = baselineBill * (1 - loadShiftSavingsPct / 100);
    const monthlySavings = baselineBill - projectedOptimizedBill;
    return {
      monthlyKwh: Math.round(monthlyKwh),
      baselineBill: Math.round(baselineBill * 100) / 100,
      optimizedBill: Math.round(projectedOptimizedBill * 100) / 100,
      monthlySavings: Math.round(monthlySavings * 100) / 100,
      loadShiftSavingsPct,
    };
  }, [totalDailyKwh, utilityRate]);

  // Export CSV Handler
  const exportCsv = () => {
    const headers = [
      "Hour",
      "Consumption_kWh",
      "Solar_Offset_kWh",
      "Net_Grid_kWh",
      "Is_Peak_Hour",
      "Rate_INR_per_kWh",
      "Hourly_Cost_INR",
    ];
    const rows = enrichedHourlyData.map((p) => [
      p.hour,
      p.kwh,
      p.solarKwh,
      p.netGridKwh,
      p.isPeak ? "YES" : "NO",
      utilityRate.toFixed(2),
      (p.kwh * utilityRate).toFixed(2),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        "# VOLTRA ENERGY ANALYTICS — MODELED SCENARIO EXPORT",
        `# Generated: ${new Date().toISOString()}`,
        `# Base Tariff: ₹${utilityRate.toFixed(2)}/kWh (INR)`,
        `# Projected Monthly Bill: ₹${projections.optimizedBill}`,
        "",
        headers.join(","),
        ...rows.map((r) => r.join(",")),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `voltra-energy-audit-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Modeled analytics CSV downloaded");
  };

  const exportPdf = () => {
    window.print();
    toast.success("Analytics report opened for PDF printing");
  };

  // High-Contrast Tooltip to eliminate unreadable dark-on-dark text
  const CustomHourlyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isPeak = data.isPeak;
      const cost = (data.kwh * utilityRate).toFixed(2);
      const solarVal = data.solarKwh || 0;

      return (
        <div className="rounded-xl border border-white/20 bg-[#0d0f17] p-3.5 shadow-2xl backdrop-blur-xl font-mono text-xs z-50 min-w-[210px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
            <span className="text-white font-bold text-sm">{label} hrs</span>
            <span
              className={cn(
                "text-[9px] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider",
                isPeak
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              )}
            >
              {isPeak ? "Peak Interval" : "Standard Inflow"}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-zinc-200">
              <span className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", isPeak ? "bg-amber-400" : "bg-emerald-400")} />
                <span>Grid Inflow:</span>
              </span>
              <strong className="text-white font-bold">{data.kwh} kWh</strong>
            </div>

            {solarVal > 0 && (
              <div className="flex items-center justify-between text-sky-200">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-400" />
                  <span>Solar scenario:</span>
                </span>
                <strong className="text-sky-300 font-bold">-{solarVal} kWh</strong>
              </div>
            )}

            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/10 text-amber-300">
              <span className="text-zinc-300 font-semibold">Estimated Cost:</span>
              <strong className="text-amber-400 font-extrabold text-sm">₹{cost}</strong>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 pt-4">
      <main className="px-4 sm:px-6 lg:px-8 space-y-6 max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-4 border-b border-border/60">
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-mono">
              LOAD PROFILING &amp; INDIAN RUPEE (₹) TARIFF SIMULATION
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl">
              Analytics &amp; Tariff Intelligence
            </h1>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Live snapshots · Modeled 24-hour profile · User-adjustable tariff scenarios
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="h-9 rounded-xl border-border bg-card text-xs font-semibold gap-2 hover:bg-muted cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Export CSV</span>
            </Button>

            <Button
              size="sm"
              onClick={exportPdf}
              className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 cursor-pointer shadow-xs"
            >
              <FileText className="size-4" />
              <span>Export PDF Report</span>
            </Button>
          </div>
        </div>

        {/* Live Electrical Telemetry Bar */}
        <LiveTelemetryBar />

        {/* ── Key Metrics Cards Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-4 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase text-emerald-600 dark:text-emerald-400 font-bold block mb-1">
              24h Total Energy
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-display font-extrabold text-foreground dark:text-white">
                {totalDailyKwh.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">kWh</span>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-1">
              Daily domestic consumption
            </p>
          </div>

          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.04] p-4 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase text-sky-600 dark:text-sky-400 font-bold block mb-1">
              Solar Scenario Offset
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-display font-extrabold text-sky-500 dark:text-sky-400">
                {totalSolarDaily.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">kWh</span>
            </div>
            <p className="text-[10px] font-mono text-sky-600 dark:text-sky-400 mt-1 font-semibold">
              Illustrative · not detected hardware
            </p>
          </div>

          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 font-bold block mb-1">
              Peak Window (17:00-21:00)
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-display font-extrabold text-amber-500">
                {peakLoadPct}%
              </span>
              <span className="text-xs font-mono text-muted-foreground">of total load</span>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-1">
              {peakKwhTotal.toFixed(1)} kWh during peak hours
            </p>
          </div>

          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.04] p-4 backdrop-blur-md">
            <span className="text-[10px] font-mono uppercase text-violet-600 dark:text-violet-400 font-bold block mb-1">
              Load-Shift Scenario
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-display font-extrabold text-foreground dark:text-white">
                ₹{projections.optimizedBill.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-muted-foreground">/ mo</span>
            </div>
            <p className="text-[10px] font-mono text-violet-600 dark:text-violet-400 mt-1 font-semibold">
              Assumes 28% lower bill · advisory estimate
            </p>
          </div>
        </div>

        {/* ── 1. Comprehensive 24-Hour Composed Chart (Grid Load + Solar Offset) ── */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/90 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-border/60 dark:border-white/[0.08]">
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-foreground dark:text-white flex items-center gap-2">
                <span>Modeled 24-Hour Consumption Scenario</span>
              </h2>
              <p className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                Updated values till: {updatedTillText}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                Recent samples are used where available; missing hours and the solar curve are illustrative estimates. Peak window: 17:00–21:00.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-emerald-500" />
                <span className="text-muted-foreground">Off-Peak Inflow</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-xs bg-amber-500" />
                <span className="text-muted-foreground">Peak Window (17:00-21:00)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-sky-400" />
                <span className="text-sky-500 dark:text-sky-400 font-semibold">Illustrative Solar</span>
              </span>
            </div>
          </div>

          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={enrichedHourlyData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="solarAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} opacity={0.25} />

                <XAxis
                  dataKey="hour"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontFamily: "monospace" }}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)", fontFamily: "monospace" }}
                  unit=" kWh"
                />

                <Tooltip content={<CustomHourlyTooltip />} />

                <ReferenceLine
                  y={5.0}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: "PEAK DISCOM THRESHOLD (5.0 kWh)",
                    fill: "#f59e0b",
                    fontSize: 9,
                    position: "insideTopRight",
                    fontFamily: "monospace",
                  }}
                />

                {/* Bars for Hourly Energy */}
                <Bar dataKey="kwh" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {enrichedHourlyData.map((entry) => (
                    <Cell
                      key={entry.hour}
                      fill={entry.isPeak ? "#f59e0b" : "#10b981"}
                    />
                  ))}
                </Bar>

                {/* Area overlay for Rooftop Solar generation */}
                <Area
                  type="monotone"
                  dataKey="solarKwh"
                  name="Illustrative Solar Offset (kWh)"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#solarAreaGrad)"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── 2. Interactive Dynamic Circuit Energy Breakdown & Domestic Slabs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Circuit Distribution (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/90 backdrop-blur-md">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/60 dark:border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-emerald-500" />
                <h3 className="text-sm sm:text-base font-bold text-foreground dark:text-white font-display">
                  Branch Circuit Consumption &amp; Rupee Cost Share
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                {liveReading.circuits.length} Active Gateway Loads
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              {(() => {
                const colors = ["#06b6d4", "#f97316", "#a855f7", "#10b981", "#3b82f6", "#ec4899", "#eab308"];
                const circuits = liveReading.circuits;
                const totalAmps = circuits.reduce((acc, c) => acc + (c.state === "CLOSED" ? c.current : 0), 0) || 1;

                return circuits.map((circuit, idx) => {
                  const isClosed = circuit.state === "CLOSED";
                  const currentAmps = isClosed ? circuit.current : 0;
                  const pct = totalAmps > 0 ? Math.round((currentAmps / totalAmps) * 100) : 0;
                  const kwh = Number(((pct / 100) * totalDailyKwh).toFixed(1));
                  const cost = (kwh * utilityRate).toFixed(2);
                  const color = colors[idx % colors.length];

                  return (
                    <div key={circuit.id} className="p-3 rounded-xl bg-muted/30 border border-border/60">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-bold text-foreground dark:text-white">{circuit.name}</span>
                          {!isClosed && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-mono">OPEN</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-muted-foreground">{kwh} kWh ({currentAmps.toFixed(2)}A)</span>
                          <span className="text-amber-600 dark:text-amber-400">₹{cost}</span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-muted dark:bg-white/[0.08] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Example tariff bands and scenario guidance (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/90 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border/60 dark:border-white/[0.08]">
                <Coins className="size-4 text-amber-500" />
                <h3 className="text-sm sm:text-base font-bold text-foreground dark:text-white font-display">
                  Example Domestic Tariff Bands
                </h3>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground dark:text-white">Tier 1: Lifeline</span>
                    <p className="text-[10px] text-muted-foreground">0 – 100 units / month</p>
                  </div>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹4.50 / kWh</span>
                </div>

                <div className="p-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground dark:text-white">Tier 2: Standard Domestic</span>
                    <p className="text-[10px] text-muted-foreground">101 – 300 units / month</p>
                  </div>
                  <span className="font-bold text-sky-600 dark:text-sky-400">₹7.50 / kWh</span>
                </div>

                <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground dark:text-white">Tier 3: High Consumption</span>
                    <p className="text-[10px] text-muted-foreground">301+ units / month</p>
                  </div>
                  <span className="font-bold text-amber-600 dark:text-amber-400">₹10.50 / kWh</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block mb-1 font-mono uppercase">
                  Planning scenario:
                </span>
                Moving flexible loads outside 17:00–21:00 is modeled here as a{" "}
                <strong className="text-foreground dark:text-white">28% reduction scenario</strong>.
                VOLTRA does not schedule or switch loads automatically.
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. Interactive Tariff Simulator Slider & Monthly Projections ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Tariff Simulator Control */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/90 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sliders className="size-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-display text-base font-bold text-foreground dark:text-white">
                  Interactive Tariff Simulator (INR / ₹)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed font-mono">
                Adjust the base utility tariff rate in Rupees (₹) to evaluate seasonal slab plans and peak pricing models.
              </p>

              {/* Slider */}
              <div className="mt-5 space-y-4 rounded-xl border border-border/80 bg-muted/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-muted-foreground uppercase">
                    Utility Tariff Rate
                  </span>
                  <span className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{utilityRate.toFixed(2)} / kWh
                  </span>
                </div>

                <input
                  type="range"
                  min="3.00"
                  max="18.00"
                  step="0.25"
                  value={utilityRate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-muted rounded-lg"
                />

                <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>₹4.50 (Base Domestic)</span>
                  <span>₹7.50 (State Average)</span>
                  <span>₹14.00 (Peak Commercial)</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs font-mono text-muted-foreground">
              <span>Standard Sanctioned Load: 5 kW</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">1-Phase 230V</span>
            </div>
          </div>

          {/* Monthly Projected Calculation Cards */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/90 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">₹</span>
                <h3 className="font-display text-base font-bold text-foreground dark:text-white">
                  Monthly Projected Bill Calculation
                </h3>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                Calculated on ~{projections.monthlyKwh.toLocaleString()} kWh projected monthly volume
              </p>

              <div className="mt-5 grid grid-cols-2 gap-4">
                {/* Baseline Bill */}
                <div className="rounded-xl border border-border bg-muted/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <span className="text-[10px] uppercase font-mono text-muted-foreground font-semibold">
                    Standard Baseline
                  </span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-bold text-foreground dark:text-white">
                      ₹{projections.baselineBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-mono text-muted-foreground">
                    Without peak curtailment
                  </p>
                </div>

                {/* Optimized Bill with Load Shifting */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <span className="text-[10px] uppercase font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                    Optimized Projected
                  </span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      ₹{projections.optimizedBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <TrendingDown className="size-3" />
                    28% Scenario Assumption
                  </p>
                </div>
              </div>
            </div>

            {/* Total Monthly Savings Highlight */}
            <div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                  Modeled Monthly Difference
                </span>
                <p className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  +₹{projections.monthlySavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                </p>
              </div>
              <div className="size-10 rounded-full border border-emerald-500/30 bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { parseEsp32RawLine, type TelemetrySnapshot } from "@/services/esp32Api";
import { ModeStatusBanner } from "@/components/ModeStatusBanner";
import { AdaptiveAnomalyPanel } from "@/components/AdaptiveAnomalyPanel";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  Play,
  Pause,
  Activity,
  Zap,
  Flame,
  Maximize2,
  Minimize2,
  Cpu,
  Server,
  Coins,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Usb,
  Calculator,
  Loader2,
  Power,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stream")({
  head: () => ({
    meta: [
      { title: "VOLTRA — Live ESP32 AC Waveform & Multi-Channel Telemetry Stream" },
      {
        name: "description",
        content:
          "Real-time sensor telemetry streaming from ESP32 with dual CT loads, AC RMS voltage, live mathematical formula calculations, and Rupee (₹) cost tracking.",
      },
    ],
  }),
  component: LiveStreamPage,
});

export type SignalChannel =
  | "voltage"
  | "load1"
  | "load2"
  | "load3"
  | "load4"
  | "load5"
  | "totalCurrent"
  | "totalPower"
  | "burnRate";

export interface ChannelConfig {
  key: SignalChannel;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  gradientId: string;
  axisSide: "left" | "right";
}

export const SIGNAL_CHANNELS: ChannelConfig[] = [
  {
    key: "voltage",
    label: "Voltage (V)",
    shortLabel: "Voltage",
    unit: "V",
    color: "#0ea5e9", // Sky Blue
    gradientId: "streamVoltageGrad",
    axisSide: "left",
  },
  {
    key: "load1",
    label: "Load 1 (CT 1) (A)",
    shortLabel: "Load 1",
    unit: "A",
    color: "#06b6d4", // Cyan
    gradientId: "streamLoad1Grad",
    axisSide: "right",
  },
  {
    key: "load2",
    label: "Load 2 (CT 2) (A)",
    shortLabel: "Load 2",
    unit: "A",
    color: "#f97316", // Orange
    gradientId: "streamLoad2Grad",
    axisSide: "right",
  },
  {
    key: "load3",
    label: "Breaker 3 (Mains/Induction) (A)",
    shortLabel: "Breaker 3",
    unit: "A",
    color: "#a855f7", // Purple
    gradientId: "streamLoad3Grad",
    axisSide: "right",
  },
  {
    key: "load4",
    label: "Breaker 4 (Server Hub) (A)",
    shortLabel: "Breaker 4",
    unit: "A",
    color: "#ec4899", // Pink
    gradientId: "streamLoad4Grad",
    axisSide: "right",
  },
  {
    key: "load5",
    label: "Breaker 5 (Heat Pump) (A)",
    shortLabel: "Breaker 5",
    unit: "A",
    color: "#84cc16", // Lime
    gradientId: "streamLoad5Grad",
    axisSide: "right",
  },
  {
    key: "totalCurrent",
    label: "Total Current (A)",
    shortLabel: "Current",
    unit: "A",
    color: "#eab308", // Amber
    gradientId: "streamTotalCurrentGrad",
    axisSide: "right",
  },
  {
    key: "totalPower",
    label: "Total Power (W)",
    shortLabel: "Power",
    unit: "W",
    color: "#10b981", // Emerald
    gradientId: "streamPowerTotalGrad",
    axisSide: "right",
  },
  {
    key: "burnRate",
    label: "Burn Rate (₹/hr)",
    shortLabel: "₹/hr",
    unit: "₹/hr",
    color: "#f59e0b", // Gold
    gradientId: "streamBurnRateGrad",
    axisSide: "right",
  },
];

export interface TelemetryHistoryTick {
  time: string;
  voltage: number;
  load1: number;
  load2: number;
  load3: number;
  load4: number;
  load5: number;
  totalCurrent: number;
  totalPower: number;
  burnRate: number;
}

const DEFAULT_ESP32_DATASET = `Time\tVoltage (V)\tLoad 1 (A)\tLoad 2 (A)
20:19:27.881\t197.35\t0.029\t0.252
20:19:29.677\t197.20\t0.031\t0.256
20:19:31.395\t197.01\t0.029\t0.251
20:19:33.069\t197.22\t0.028\t0.260
20:19:34.816\t197.39\t0.030\t0.272
20:19:36.505\t196.99\t0.031\t0.269
20:19:38.174\t196.65\t0.030\t0.257
20:19:39.918\t196.63\t0.030\t0.256
20:19:41.601\t197.43\t0.030\t0.245
20:19:43.293\t196.98\t0.030\t0.249
20:19:45.003\t1.41\t0.005\t0.005
20:19:46.666\t1.35\t0.005\t0.005
20:19:48.426\t1.35\t0.005\t0.005
20:19:50.119\t1.37\t0.005\t0.005
20:19:51.794\t1.39\t0.004\t0.030
20:19:53.535\t0.91\t0.005\t0.005
20:19:55.198\t0.98\t0.005\t0.005
20:19:56.915\t1.02\t0.005\t0.005
20:19:58.640\t0.92\t0.005\t0.005
20:20:00.304\t0.86\t0.005\t0.005
20:20:02.007\t0.97\t0.005\t0.005`;

/**
 * Converts any live telemetry snapshot from the store into a real-time graph tick,
 * strictly factoring in the actual circuit breaker states (0.000A when OPEN or TRIPPED).
 */
export function snapshotToTick(snap: TelemetrySnapshot, tariffRate = 7.5, timeOverride?: string): TelemetryHistoryTick {
  const d = snap.timestamp ? new Date(snap.timestamp * 1000) : new Date();
  const fallbackTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;

  const timeStr = timeOverride || (snap.rawTime && snap.rawTime.includes(":") ? snap.rawTime : fallbackTime);

  const circuits = snap.circuits || [];
  const c1 = circuits.find((c) => c.id === "c1") || circuits[0];
  const c2 = circuits.find((c) => c.id === "c2") || circuits[1];
  const c3 = circuits.find((c) => c.id === "c3") || circuits[2];
  const c4 = circuits.find((c) => c.id === "c4") || circuits[3];
  const c5 = circuits.find((c) => c.id === "c5") || circuits[4];

  // Breaker amperage is strictly 0.000A when OPEN or TRIPPED
  const l1 = Number(((c1 && c1.state === "CLOSED") ? (c1.current ?? snap.load1 ?? 0) : 0).toFixed(3));
  const l2 = Number(((c2 && c2.state === "CLOSED") ? (c2.current ?? snap.load2 ?? 0) : 0).toFixed(3));
  const l3 = Number(((c3 && c3.state === "CLOSED") ? (c3.current ?? 0) : 0).toFixed(3));
  const l4 = Number(((c4 && c4.state === "CLOSED") ? (c4.current ?? 0) : 0).toFixed(3));
  const l5 = Number(((c5 && c5.state === "CLOSED") ? (c5.current ?? 0) : 0).toFixed(3));

  const voltage = Number((snap.voltage_rms ?? 0).toFixed(2));

  // Calculated total current from active branch breakers or CTs
  const totalCurrent = snap.current_rms > 0
    ? Number(snap.current_rms.toFixed(3))
    : Number((l1 + l2).toFixed(3));

  // Calculated active power P = V * I
  const totalPower = snap.active_power > 0
    ? Number(snap.active_power.toFixed(2))
    : Number((voltage * totalCurrent).toFixed(2));

  const powerKw = Number((totalPower / 1000).toFixed(4));
  const burnRate = Number((powerKw * tariffRate).toFixed(3));

  return {
    time: timeStr,
    voltage,
    load1: l1,
    load2: l2,
    load3: l3,
    load4: l4,
    load5: l5,
    totalCurrent,
    totalPower,
    burnRate,
  };
}

/**
 * Initializes the history buffer from real-time store history or live snapshot
 */
function createInitialBuffer(
  recentHistory: TelemetrySnapshot[],
  liveReading: TelemetrySnapshot,
  tariff: number
): TelemetryHistoryTick[] {
  if (recentHistory && recentHistory.length >= 5) {
    return recentHistory.slice(-30).map((s) => snapshotToTick(s, tariff));
  }

  // Generate initial real-time rolling seed from live reading
  const baseTick = snapshotToTick(liveReading, tariff);
  const now = Date.now();
  const ticks: TelemetryHistoryTick[] = [];
  for (let i = 24; i >= 0; i--) {
    const t = new Date(now - i * 500);
    const timeStr = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}.${String(t.getMilliseconds()).padStart(3, "0")}`;
    const vNoise = baseTick.voltage > 0 ? Number((Math.sin(i * 0.7) * 0.15).toFixed(2)) : 0;
    ticks.push({
      ...baseTick,
      time: timeStr,
      voltage: Math.max(0, Number((baseTick.voltage + vNoise).toFixed(2))),
    });
  }
  return ticks;
}

function LiveStreamPage() {
  const {
    operatingMode,
    setOperatingMode,
    connectionState,
    connectionType,
    liveReading,
    recentHistory,
    overloadState,
    toggleCircuit,
    actuatingCircuitIds,
    triggerTestSpike,
    clearTestSpike,
    connectBle,
    connectBlynk,
    disconnectBlynk,
    connectSerial,
    disconnectSerial,
    initSimulation,
    setSimulationSpeed,
    tariffRate,
    ingestRawEsp32Line,
  } = useVoltricsStore();

  const isConnected = connectionState.startsWith('CONNECTED');
  const rateInr = tariffRate || 7.5;
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [streamRateMs, setStreamRateMs] = useState<number>(500); // 2Hz default
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  // Initialize buffer dynamically from live store state without hardcoded static data
  const [historyBuffer, setHistoryBuffer] = useState<TelemetryHistoryTick[]>(() =>
    createInitialBuffer(recentHistory, liveReading, rateInr)
  );

  // Selected signal channels (default to clean Voltage, Load 1, Load 2)
  const [selectedChannels, setSelectedChannels] = useState<Set<SignalChannel>>(
    new Set(["voltage", "load1", "load2"])
  );

  // Accordion toggles for advanced tools
  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);
  const [showDeviceDrawer, setShowDeviceDrawer] = useState<boolean>(false);
  const [showLogDrawer, setShowLogDrawer] = useState<boolean>(false);

  // Cumulative session energy & cost integration
  const [sessionEnergyKwh, setSessionEnergyKwh] = useState<number>(0);

  // Log text for ingestion
  const [customLogText, setCustomLogText] = useState<string>(DEFAULT_ESP32_DATASET);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayLineIndex, setReplayLineIndex] = useState<number>(0);
  const replayIntervalRef = useRef<any>(null);

  // WebSerial
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const serialPortRef = useRef<any>(null);

  // Fullscreen sync
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (chartWrapperRef.current?.requestFullscreen) {
          await chartWrapperRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      toast.error("Could not toggle fullscreen mode");
    }
  };

  const handleToggleChannel = (key: SignalChannel) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) {
          next.delete(key);
        } else {
          toast.info("At least one telemetry signal must remain selected");
        }
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // ── LIVE FORMULA DERIVATIONS STRICTLY TIED TO CIRCUIT BREAKERS ──
  const circuits = liveReading.circuits || [];
  const c1 = circuits.find((c) => c.id === "c1") || circuits[0];
  const c2 = circuits.find((c) => c.id === "c2") || circuits[1];
  const c3 = circuits.find((c) => c.id === "c3") || circuits[2];
  const c4 = circuits.find((c) => c.id === "c4") || circuits[3];
  const c5 = circuits.find((c) => c.id === "c5") || circuits[4];

  const curVoltage = Number((liveReading.voltage_rms ?? 0).toFixed(2));
  const curFrequency = Number((liveReading.frequency ?? 50.0).toFixed(2));

  // Breaker amperage is strictly 0.000A when OPEN or TRIPPED
  const curLoad1 = Number(((c1 && c1.state === "CLOSED") ? (c1.current ?? liveReading.load1 ?? 0) : 0).toFixed(3));
  const curLoad2 = Number(((c2 && c2.state === "CLOSED") ? (c2.current ?? liveReading.load2 ?? 0) : 0).toFixed(3));
  const curLoad3 = Number(((c3 && c3.state === "CLOSED") ? (c3.current ?? 0) : 0).toFixed(3));
  const curLoad4 = Number(((c4 && c4.state === "CLOSED") ? (c4.current ?? 0) : 0).toFixed(3));
  const curLoad5 = Number(((c5 && c5.state === "CLOSED") ? (c5.current ?? 0) : 0).toFixed(3));

  // Active dual current from CT sensors
  const curDualCurrent = Number((curLoad1 + curLoad2).toFixed(3));

  // Real-time calculated total current from active branch breakers
  const curTotalCurrent = liveReading.current_rms > 0
    ? Number(liveReading.current_rms.toFixed(3))
    : curDualCurrent;

  const curPower1 = Number((curVoltage * curLoad1).toFixed(2));
  const curPower2 = Number((curVoltage * curLoad2).toFixed(2));
  const curTotalPower = liveReading.active_power > 0
    ? Number(liveReading.active_power.toFixed(2))
    : Number((curVoltage * curTotalCurrent).toFixed(2));

  const curPowerKw = Number((curTotalPower / 1000).toFixed(4));
  const curBurnRate = Number((curPowerKw * rateInr).toFixed(3));

  // ── REACTIVE REAL-TIME GRAPH INGESTION (FIRES ON EACH TELEMETRY FRAME) ──
  useEffect(() => {
    if (!isPlaying) return;

    const now = new Date();
    const freshTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;

    const tick = snapshotToTick(liveReading, rateInr, freshTimeStr);

    setHistoryBuffer((prev) => {
      const next = [...prev, tick];
      if (next.length > 40) return next.slice(next.length - 40);
      return next;
    });

    const hoursPassed = streamRateMs / (1000 * 3600);
    setSessionEnergyKwh((prev) => Number((prev + (tick.totalPower / 1000) * hoursPassed).toFixed(5)));
  }, [liveReading, isPlaying, rateInr, streamRateMs]);

  // Handle stream rate change (updates local speed & adjusts simulation loop)
  const handleChangeSpeed = (ms: number) => {
    setStreamRateMs(ms);
    setSimulationSpeed(ms);
    toast.info(`Streaming frequency set to ${ms === 100 ? "10Hz (100ms)" : ms === 500 ? "2Hz (500ms)" : "1Hz (1s)"}`);
  };

  // Replay pasted ESP32 logs
  const handleStartReplay = () => {
    const rawLines = customLogText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("Time"));

    if (rawLines.length === 0) {
      toast.error("No valid telemetry lines found");
      return;
    }

    if (isReplaying) {
      clearInterval(replayIntervalRef.current);
      setIsReplaying(false);
      toast.info("Replay paused");
      return;
    }

    setIsReplaying(true);
    setReplayLineIndex(0);
    toast.success(`Replaying ${rawLines.length} hardware frames at 1Hz`);

    let idx = 0;
    replayIntervalRef.current = setInterval(() => {
      if (idx >= rawLines.length) {
        clearInterval(replayIntervalRef.current);
        setIsReplaying(false);
        toast.success("Stream replay complete");
        return;
      }
      ingestRawEsp32Line(rawLines[idx]);
      setReplayLineIndex(idx + 1);
      idx++;
    }, 1000);
  };

  // WebSerial
  const connectWebSerial = async () => {
    if (typeof window === "undefined") return;
    const nav = navigator as any;
    if (!nav.serial) {
      toast.error("Use Chrome or Edge to connect via USB Serial");
      return;
    }

    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setIsSerialConnected(true);
      toast.success("ESP32 Connected via USB Serial @ 115200 baud");

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = "";
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.trim()) {
                ingestRawEsp32Line(line);
              }
            }
          }
        } catch {
          // Closed
        } finally {
          setIsSerialConnected(false);
        }
      })();
    } catch {
      toast.error("USB connection cancelled");
    }
  };

  const handleToggleBreaker = async (
    id: string,
    name: string,
    currentState: "OPEN" | "CLOSED" | "TRIPPED"
  ) => {
    const targetState = currentState === "CLOSED" ? "OPEN" : "CLOSED";
    try {
      await toggleCircuit(id, targetState);
      if (targetState === "OPEN") {
        toast.warning(`Circuit Breaker "${name}" Tripped / Isolated`, {
          description: "Amperage instantly dropped to 0.000A in waveform stream.",
        });
      } else {
        toast.success(`Circuit Breaker "${name}" Closed / Energized`, {
          description: "Current draw resumed within rated capacity.",
        });
      }
    } catch {
      toast.error(`Relay communication failed for ${name}`);
    }
  };

  const activeLeftChannels = useMemo(() => {
    return SIGNAL_CHANNELS.filter(
      (ch) => selectedChannels.has(ch.key) && ch.axisSide === "left"
    );
  }, [selectedChannels]);

  const activeRightChannels = useMemo(() => {
    return SIGNAL_CHANNELS.filter(
      (ch) => selectedChannels.has(ch.key) && ch.axisSide === "right"
    );
  }, [selectedChannels]);

  const hasLeftAxis = activeLeftChannels.length > 0;
  const hasRightAxis = activeRightChannels.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 pt-4">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-5">

        {/* Persistent Operating Mode Status Banner */}
        <ModeStatusBanner />

        {/* ── 1. CLEAN TOP HEADER WITH REAL-TIME CONTROLS ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-border/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-75",
                    operatingMode === "SIMULATED"
                      ? "bg-cyan-400 animate-ping"
                      : isConnected
                      ? "bg-emerald-400 animate-ping"
                      : "bg-rose-400 animate-pulse",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2.5 rounded-full",
                    operatingMode === "SIMULATED"
                      ? "bg-cyan-500 shadow-[0_0_8px_#06b6d4]"
                      : isConnected
                      ? "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                      : "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
                  )}
                />
              </span>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground dark:text-white">
                Live ESP32 Waveform Stream
              </h1>
              <span
                className={cn(
                  "ml-2 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border",
                  operatingMode === "SIMULATED"
                    ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
                    : isConnected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                )}
              >
                {operatingMode === "SIMULATED"
                  ? `Simulation (${streamRateMs === 100 ? "10Hz" : streamRateMs === 500 ? "2Hz" : "1Hz"})`
                  : isConnected
                  ? `ESP32 Live (${connectionType.replace('_', ' ')})`
                  : "ESP32 Offline (0V / 0A)"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {operatingMode === "SIMULATED"
                ? "Simulated multi-channel telemetry dynamically calculated from active branch circuit breakers & CT sensors."
                : isConnected
                ? `Physical ESP32 streaming live via ${connectionType.replace('_', ' ')} with zero simulation.`
                : "Real-time Mode active. Physical ESP32 not connected; telemetry is strictly zeroed."}
            </p>
          </div>

          {/* Quick Stream Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer border",
                isPlaying
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                  : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400 border-emerald-400 font-extrabold"
              )}
            >
              {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              <span>{isPlaying ? "Pause Stream" : "Resume Stream"}</span>
            </button>

            {/* Speed Selector */}
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-mono font-bold">
              {[
                { label: "10Hz", ms: 100 },
                { label: "2Hz", ms: 500 },
                { label: "1Hz", ms: 1000 },
              ].map((rate) => (
                <button
                  key={rate.label}
                  type="button"
                  onClick={() => handleChangeSpeed(rate.ms)}
                  className={cn(
                    "px-2 py-1 rounded transition-all cursor-pointer text-[11px]",
                    streamRateMs === rate.ms
                      ? "bg-emerald-500 text-neutral-950 font-extrabold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {rate.label}
                </button>
              ))}
            </div>

            {/* Hardware Options Toggle */}
            <button
              type="button"
              onClick={() => setShowDeviceDrawer(!showDeviceDrawer)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium transition-all border cursor-pointer",
                showDeviceDrawer
                  ? "bg-violet-500/20 text-violet-400 border-violet-500/40"
                  : "bg-muted/30 text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Cpu className="size-3.5" />
              <span>Connect ESP32</span>
              {showDeviceDrawer ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          </div>
        </div>

        <AdaptiveAnomalyPanel
          source={operatingMode === "SIMULATED" ? "demo" : "hardware"}
          compact
        />

        {/* ── OPTIONAL HARDWARE CONNECTION DRAWER (CLEAN & EXPANDABLE) ── */}
        {showDeviceDrawer && (
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.03] p-4 backdrop-blur-md grid grid-cols-1 sm:grid-cols-3 gap-3 transition-all">
            {/* 1. Blynk IoT Cloud Live Sync */}
            <div className="p-3 rounded-lg bg-background/60 border border-border/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold font-display text-foreground dark:text-white">Blynk IoT Cloud</span>
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      connectionState === "CONNECTED_BLYNK"
                        ? "bg-emerald-500 animate-ping shadow-[0_0_6px_#10b981]"
                        : "bg-muted-foreground/30",
                    )}
                  />
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Stream V0–V2 telemetry and synchronize physical relays through V3 and V4.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (connectionState === "CONNECTED_BLYNK") {
                    disconnectBlynk();
                    toast.info("Disconnected from Blynk Cloud");
                  } else {
                    try {
                      toast.loading("Verifying physical ESP32 on Blynk Cloud...", { id: "blynk-stream-conn" });
                      await connectBlynk();
                      toast.success("ESP32 hardware verified online & streaming live!", { id: "blynk-stream-conn" });
                    } catch (err: any) {
                      toast.error("Blynk connection rejected", {
                        id: "blynk-stream-conn",
                        description: err?.message || "Physical ESP32 device is offline on Blynk Cloud.",
                      });
                    }
                  }
                }}
                className={cn(
                  "mt-3 w-full py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer text-center",
                  connectionState === "CONNECTED_BLYNK"
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
                    : "bg-emerald-500 text-neutral-950 border-emerald-400 hover:bg-emerald-400 font-extrabold",
                )}
              >
                {connectionState === "CONNECTED_BLYNK"
                  ? "Disconnect Blynk Cloud"
                  : "Connect Blynk Cloud (Online Only)"}
              </button>
            </div>

            {/* 2. WebSerial USB */}
            <div className="p-3 rounded-lg bg-background/60 border border-border/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold font-display text-foreground dark:text-white">USB Serial Port</span>
                  <Usb className="size-3.5 text-muted-foreground" />
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Plug ESP32 via USB at 115200 baud for instant local stream.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (connectionType === "USB_SERIAL") {
                    disconnectSerial();
                    toast.info("USB Serial disconnected");
                  } else {
                    const ok = await connectSerial();
                    if (ok) {
                      toast.success("ESP32 Connected via USB Serial @ 115200 baud");
                    }
                  }
                }}
                className={cn(
                  "mt-3 w-full py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer text-center",
                  connectionType === "USB_SERIAL"
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-muted/40 text-foreground border-border hover:bg-muted",
                )}
              >
                {connectionType === "USB_SERIAL" ? "Disconnect USB" : "Connect ESP32 USB"}
              </button>
            </div>

            {/* 3. Paste / Replay ESP32 Serial Logs */}
            <div className="p-3 rounded-lg bg-background/60 border border-border/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold font-display text-foreground dark:text-white">Serial Log Paste</span>
                  <Server className="size-3.5 text-muted-foreground" />
                </div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Paste raw 4-column ESP32 output or replay recorded data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogDrawer(!showLogDrawer)}
                className="mt-3 w-full py-1.5 rounded-lg text-xs font-mono font-bold bg-muted/40 text-foreground border border-border hover:bg-muted cursor-pointer text-center"
              >
                {showLogDrawer ? "Hide Log Editor" : "Open Log Editor & Replay"}
              </button>
            </div>
          </div>
        )}

        {/* LOG INGEST DRAWER (IF OPENED) */}
        {showLogDrawer && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">Paste ESP32 Output (Time \t Voltage \t Load 1 \t Load 2):</span>
              <button
                type="button"
                onClick={() => setCustomLogText(DEFAULT_ESP32_DATASET)}
                className="text-[11px] font-mono text-emerald-500 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="size-3" />
                <span>Reset Default Snippet</span>
              </button>
            </div>
            <textarea
              value={customLogText}
              onChange={(e) => setCustomLogText(e.target.value)}
              rows={5}
              className="w-full rounded-lg bg-black/40 border border-border p-2.5 font-mono text-xs text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">
                {isReplaying ? `Replaying line ${replayLineIndex} at 1Hz...` : "Ready to replay or ingest"}
              </span>
              <button
                type="button"
                onClick={handleStartReplay}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer",
                  isReplaying
                    ? "bg-amber-500 text-neutral-950 border-amber-400"
                    : "bg-emerald-500 text-neutral-950 border-emerald-400 hover:bg-emerald-400"
                )}
              >
                {isReplaying ? "Pause Replay" : "Replay Live Stream (1Hz)"}
              </button>
            </div>
          </div>
        )}

        {/* ── 2. HERO: LIVE REAL-TIME WAVEFORM GRAPH & CHANNEL SELECTOR ── */}
        <div
          ref={chartWrapperRef}
          className={cn(
            "rounded-2xl border border-border/80 bg-card shadow-sm dark:border-white/[0.08] dark:bg-[#0c0d12]/95 backdrop-blur-md transition-all flex flex-col justify-between",
            isFullscreen
              ? "p-6 fixed inset-0 z-50 rounded-none w-screen h-screen overflow-hidden bg-[#08090d]"
              : "p-4 sm:p-5"
          )}
        >
          {/* Top Controls of Chart: Presets + Signal Pills + Fullscreen */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 mb-2 border-b border-border/50">
            {/* Channel Toggle Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-mono text-muted-foreground uppercase mr-1">Signals:</span>
              {SIGNAL_CHANNELS.map((ch) => {
                const isSelected = selectedChannels.has(ch.key);
                let liveVal = "";
                if (ch.key === "voltage") liveVal = `${curVoltage.toFixed(1)}V`;
                else if (ch.key === "load1") liveVal = `${curLoad1.toFixed(3)}A`;
                else if (ch.key === "load2") liveVal = `${curLoad2.toFixed(3)}A`;
                else if (ch.key === "load3") liveVal = `${curLoad3.toFixed(3)}A`;
                else if (ch.key === "load4") liveVal = `${curLoad4.toFixed(3)}A`;
                else if (ch.key === "load5") liveVal = `${curLoad5.toFixed(3)}A`;
                else if (ch.key === "totalCurrent") liveVal = `${curTotalCurrent.toFixed(3)}A`;
                else if (ch.key === "totalPower") liveVal = `${curTotalPower.toFixed(1)}W`;
                else if (ch.key === "burnRate") liveVal = `₹${curBurnRate.toFixed(2)}/hr`;

                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => handleToggleChannel(ch.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono transition-all border cursor-pointer select-none",
                      isSelected
                        ? "bg-card text-foreground font-bold shadow-xs border-current"
                        : "opacity-40 hover:opacity-75 border-border bg-muted/20 text-muted-foreground"
                    )}
                    style={{
                      borderColor: isSelected ? ch.color : undefined,
                    }}
                  >
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: ch.color }}
                    />
                    <span>{ch.shortLabel}</span>
                    <span
                      className="text-[10px] font-semibold opacity-90"
                      style={{ color: isSelected ? ch.color : undefined }}
                    >
                      {liveVal}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Presets & Fullscreen */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedChannels(new Set(["voltage", "load1", "load2"]))}
                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer"
              >
                Default (V+L1+L2)
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannels(new Set(["load1", "load2", "load3", "load4", "load5"]))}
                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer"
              >
                All 5 Breakers
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannels(new Set(["voltage", "totalCurrent", "totalPower", "burnRate"]))}
                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer"
              >
                Power &amp; Rate
              </button>
              <button
                type="button"
                onClick={() => setSelectedChannels(new Set(SIGNAL_CHANNELS.map((c) => c.key)))}
                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer"
              >
                All Signals
              </button>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer ml-1"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
              >
                {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
            </div>
          </div>

          {/* Waveform Canvas */}
          <div className={cn("w-full", isFullscreen ? "h-[calc(100vh-140px)]" : "h-72 sm:h-80")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyBuffer} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                <defs>
                  {SIGNAL_CHANNELS.map((ch) => (
                    <linearGradient key={ch.gradientId} id={ch.gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ch.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={ch.color} stopOpacity={0.0} />
                    </linearGradient>
                  ))}
                </defs>

                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.25}
                />

                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                />

                {hasLeftAxis && (
                  <YAxis
                    yAxisId="y-left"
                    orientation="left"
                    domain={[0, 250]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#0ea5e9" }}
                    unit="V"
                  />
                )}

                {hasRightAxis && (
                  <YAxis
                    yAxisId="y-right"
                    orientation="right"
                    domain={[0, "auto"]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#10b981" }}
                  />
                )}

                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    borderColor: "var(--color-border)",
                    borderRadius: "0.75rem",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                />

                <Legend
                  wrapperStyle={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    paddingTop: "6px",
                  }}
                />

                {activeLeftChannels.map((ch) => (
                  <Area
                    key={ch.key}
                    yAxisId="y-left"
                    type="monotone"
                    dataKey={ch.key}
                    name={`${ch.shortLabel} (${ch.unit})`}
                    stroke={ch.color}
                    strokeWidth={2}
                    fill={`url(#${ch.gradientId})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}

                {activeRightChannels.map((ch) => (
                  <Area
                    key={ch.key}
                    yAxisId="y-right"
                    type="monotone"
                    dataKey={ch.key}
                    name={`${ch.shortLabel} (${ch.unit})`}
                    stroke={ch.color}
                    strokeWidth={2}
                    fill={`url(#${ch.gradientId})`}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── 3. CLEAN METRIC CARDS (REAL-TIME CALCULATED VALUES) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: AC Voltage */}
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/[0.03] p-3.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-sky-600 dark:text-sky-400">
                AC Voltage
              </span>
              <Activity className="size-3.5 text-sky-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-display font-extrabold text-foreground dark:text-white">
                {curVoltage.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">V RMS</span>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              ZMPT101B Sensor · {curFrequency.toFixed(1)} Hz
            </p>
          </div>

          {/* Card 2: Load 1 Current */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-cyan-600 dark:text-cyan-400">
                Load 1 (CT 1 / Breaker 1)
              </span>
              <Zap className="size-3.5 text-cyan-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-2xl font-display font-extrabold", c1?.state === "CLOSED" ? "text-foreground dark:text-white" : "text-neutral-500")}>
                {curLoad1.toFixed(3)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">A</span>
            </div>
            <p className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 mt-0.5 font-semibold">
              {c1?.state === "CLOSED" ? `${curPower1.toFixed(1)} W (V × I₁)` : "Breaker Isolated (0 W)"}
            </p>
          </div>

          {/* Card 3: Load 2 Current */}
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.03] p-3.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-orange-600 dark:text-orange-400">
                Load 2 (CT 2 / Breaker 2)
              </span>
              <Zap className="size-3.5 text-orange-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-2xl font-display font-extrabold", c2?.state === "CLOSED" ? "text-foreground dark:text-white" : "text-neutral-500")}>
                {curLoad2.toFixed(3)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">A</span>
            </div>
            <p className="text-[10px] font-mono text-orange-600 dark:text-orange-400 mt-0.5 font-semibold">
              {c2?.state === "CLOSED" ? `${curPower2.toFixed(1)} W (V × I₂)` : "Breaker Isolated (0 W)"}
            </p>
          </div>

          {/* Card 4: Total Power & Rate */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-3.5 backdrop-blur-md">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
                Total Power &amp; Rate
              </span>
              <Coins className="size-3.5 text-amber-500" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-display font-extrabold text-foreground dark:text-white">
                ₹{curBurnRate.toFixed(2)}
              </span>
              <span className="text-xs font-mono text-muted-foreground">/ hr</span>
            </div>
            <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 font-semibold">
              {curTotalPower.toFixed(1)} W ({curTotalCurrent.toFixed(3)} A Total)
            </p>
          </div>
        </div>

        {/* ── 4. REAL-TIME MATHEMATICAL FORMULA ENGINE ── */}
        <div className="rounded-xl border border-border/80 bg-card p-4 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-emerald-500" />
              <span className="text-xs font-mono font-bold text-foreground dark:text-white">
                Formula Engine:
              </span>
              <span className="font-mono text-xs text-muted-foreground hidden sm:inline">
                P = V × (I₁ + I₂) = {curVoltage.toFixed(1)}V × ({curLoad1.toFixed(3)}A + {curLoad2.toFixed(3)}A) = <strong className="text-foreground dark:text-white">{curTotalPower.toFixed(1)}W</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowFormulaDetails(!showFormulaDetails)}
              className="text-xs font-mono text-emerald-500 hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>{showFormulaDetails ? "Hide Derivations" : "Show Step-by-Step Derivations"}</span>
              {showFormulaDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </button>
          </div>

          {/* Expandable Step-by-Step Breakdown */}
          {showFormulaDetails && (
            <div className="pt-2 border-t border-border/50 grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-muted-foreground text-[10px]">Dual CT Current Sum:</span>
                <p className="font-bold text-foreground mt-0.5">
                  I_total = {curLoad1.toFixed(3)}A + {curLoad2.toFixed(3)}A = <span className="text-amber-500">{curDualCurrent.toFixed(3)} A</span>
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-muted-foreground text-[10px]">Real Power Calculation:</span>
                <p className="font-bold text-foreground mt-0.5">
                  P = {curPower1.toFixed(1)}W + {curPower2.toFixed(1)}W = <span className="text-emerald-500">{curTotalPower.toFixed(1)} W</span>
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-muted-foreground text-[10px]">Indian Rupee Burn Rate:</span>
                <p className="font-bold text-foreground mt-0.5">
                  Rate = ({curTotalPower.toFixed(1)}W / 1000) × ₹{rateInr.toFixed(2)} = <span className="text-amber-500">₹{curBurnRate.toFixed(3)}/hr</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── 5. INTERACTIVE BRANCH CIRCUIT BREAKERS (CONNECTED TO STREAM) ── */}
        <div className="rounded-xl border border-border/80 bg-card p-4 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-foreground dark:text-white uppercase tracking-wider">
                  Branch Circuit Breakers ({circuits.length})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                  {circuits.filter((c) => c.state === "CLOSED").length}/{circuits.length} Active
                </span>
              </div>
              <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                Toggle relay actuation below to see amperage and graph drop or rise in real time.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (overloadState.isOverloaded) {
                    clearTestSpike();
                    toast.info("Overload test spike cleared");
                  } else {
                    triggerTestSpike();
                    toast.warning("Injected load spike on Load 1 (c1)");
                  }
                }}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-mono font-bold transition-all border cursor-pointer flex items-center gap-1",
                  overloadState.isOverloaded
                    ? "bg-red-500/20 text-red-400 border-red-500/40"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
                )}
              >
                <Flame className="size-3" />
                <span>{overloadState.isOverloaded ? "Clear Spike" : "Test Spike (c1)"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  circuits.forEach((c) => {
                    if (c.state !== "CLOSED") {
                      toggleCircuit(c.id, "CLOSED").catch(() => {});
                    }
                  });
                  toast.success("Energized all circuit breakers");
                }}
                className="px-2.5 py-1 rounded text-xs font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all border border-border cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="size-3" />
                <span>Reset All</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            {circuits.map((c) => {
              const isClosed = c.state === "CLOSED";
              const isActuating = Boolean(actuatingCircuitIds[c.id]);
              const effectiveAmps = isClosed ? c.current : 0;
              const powerW = Number((curVoltage * effectiveAmps).toFixed(1));

              return (
                <div
                  key={c.id}
                  className={cn(
                    "p-3 rounded-lg border transition-all flex flex-col justify-between",
                    isClosed
                      ? "border-border/60 bg-muted/20"
                      : "border-rose-500/30 bg-rose-500/[0.04]"
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold truncate text-foreground">{c.name}</span>
                      <span className={cn("size-2 rounded-full", isClosed ? "bg-emerald-500 shadow-[0_0_6px_#10b981]" : "bg-rose-500")} />
                    </div>

                    <div className="flex items-baseline justify-between font-mono my-1">
                      <div>
                        <span className={cn("text-base font-extrabold", isClosed ? "text-foreground" : "text-neutral-500")}>
                          {effectiveAmps.toFixed(3)}
                        </span>
                        <span className="text-muted-foreground ml-0.5 text-[10px]">A</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {c.rated}A Rated
                      </span>
                    </div>

                    <p className="text-[10px] font-mono text-muted-foreground">
                      {isClosed ? `${powerW} W` : "Isolated"}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isActuating}
                    onClick={() => handleToggleBreaker(c.id, c.name, c.state)}
                    className={cn(
                      "mt-2 w-full py-1.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer text-center border flex items-center justify-center gap-1",
                      isActuating
                        ? "opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border"
                        : isClosed
                        ? "bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20"
                        : "bg-emerald-500 text-neutral-950 border-emerald-400 hover:bg-emerald-400 font-extrabold"
                    )}
                  >
                    {isActuating ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>Actuating...</span>
                      </>
                    ) : isClosed ? (
                      <>
                        <Power className="size-3" />
                        <span>Trip Breaker</span>
                      </>
                    ) : (
                      <>
                        <Power className="size-3" />
                        <span>Close Relay</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

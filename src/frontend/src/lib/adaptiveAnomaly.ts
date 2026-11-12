import type { TelemetrySnapshot } from "@/services/esp32Api";
import { circuitWatts, type UsageSource } from "@/lib/usagePatterns";

export type ModelStage = "waiting" | "learning" | "ready";
export type AnomalyKind = "power_high" | "runtime_long";
export type AnomalySeverity = "notice" | "important";

interface OnlineStats {
  count: number;
  mean: number;
  variance: number;
}

interface CircuitModel {
  id: string;
  name: string;
  activePower: OnlineStats;
  standbyPower: OnlineStats;
  runtime: OnlineStats;
  activeSince: number | null;
  candidateSince: number | null;
  candidateSamples: number;
  normalSamples: number;
  powerEventOpen: boolean;
  runtimeEventOpen: boolean;
  lastLearnedAt: number | null;
  currentWatts: number;
  currentScore: number | null;
  currentState: "active" | "standby" | "unknown";
  lastSeen: number;
}

interface PersistedModel {
  version: 1;
  totalSamples: number;
  lastTimestamp: number | null;
  circuits: Record<string, CircuitModel>;
  events: AdaptiveAnomalyEvent[];
}

export interface AdaptiveAnomalyEvent {
  id: string;
  source: UsageSource;
  circuitId: string;
  circuitName: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  timestamp: number;
  observedWatts: number;
  baselineWatts: number | null;
  score: number | null;
  title: string;
  detail: string;
  feedback?: "expected" | "review";
}

export interface AdaptiveCircuitSnapshot {
  id: string;
  name: string;
  stage: ModelStage;
  trainingProgress: number;
  activeSamples: number;
  standbySamples: number;
  completedSessions: number;
  currentWatts: number;
  typicalActiveWatts: number | null;
  typicalRuntimeSeconds: number | null;
  score: number | null;
  state: "active" | "standby" | "unknown";
  status: "learning" | "normal" | "watch";
  lastSeen: number;
}

export interface AdaptiveAnomalySnapshot {
  source: UsageSource;
  stage: ModelStage;
  totalSamples: number;
  readyCircuits: number;
  circuits: AdaptiveCircuitSnapshot[];
  events: AdaptiveAnomalyEvent[];
  updatedAt: number | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MODEL_VERSION = 1 as const;
const ACTIVE_TRAINING_SAMPLES = 60;
const STANDBY_TRAINING_SAMPLES = 90;
const POWER_EVENT_MIN_SECONDS = 5;
const POWER_EVENT_MIN_SAMPLES = 3;
const MAX_EVENTS = 100;

const blankStats = (): OnlineStats => ({ count: 0, mean: 0, variance: 0 });

function blankCircuit(id: string, name: string): CircuitModel {
  return {
    id,
    name,
    activePower: blankStats(),
    standbyPower: blankStats(),
    runtime: blankStats(),
    activeSince: null,
    candidateSince: null,
    candidateSamples: 0,
    normalSamples: 0,
    powerEventOpen: false,
    runtimeEventOpen: false,
    lastLearnedAt: null,
    currentWatts: 0,
    currentScore: null,
    currentState: "unknown",
    lastSeen: 0,
  };
}

function blankModel(): PersistedModel {
  return {
    version: MODEL_VERSION,
    totalSamples: 0,
    lastTimestamp: null,
    circuits: {},
    events: [],
  };
}

function updateStats(stats: OnlineStats, value: number) {
  if (!Number.isFinite(value)) return;
  stats.count += 1;
  if (stats.count === 1) {
    stats.mean = value;
    stats.variance = 0;
    return;
  }
  // A time-decayed online model follows gradual household changes without
  // letting one unusual sample rewrite the baseline.
  const alpha = stats.count <= 40 ? 1 / stats.count : 0.025;
  const delta = value - stats.mean;
  stats.mean += alpha * delta;
  stats.variance = Math.max(0, (1 - alpha) * (stats.variance + alpha * delta * delta));
}

function sigma(stats: OnlineStats) {
  return Math.max(Math.sqrt(Math.max(0, stats.variance)), stats.mean * 0.05, 10);
}

function stageFor(model: CircuitModel): ModelStage {
  const seen = model.activePower.count + model.standbyPower.count;
  if (seen < 10) return "waiting";
  if (
    model.activePower.count >= ACTIVE_TRAINING_SAMPLES ||
    model.standbyPower.count >= STANDBY_TRAINING_SAMPLES
  )
    return "ready";
  return "learning";
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeStats(value: unknown): OnlineStats {
  const data = value && typeof value === "object" ? (value as Partial<OnlineStats>) : {};
  return {
    count: Math.max(0, Math.floor(safeNumber(data.count))),
    mean: Math.max(0, safeNumber(data.mean)),
    variance: Math.max(0, safeNumber(data.variance)),
  };
}

function restoreModel(raw: string | null): PersistedModel {
  if (!raw) return blankModel();
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedModel>;
    if (parsed.version !== MODEL_VERSION || !parsed.circuits || typeof parsed.circuits !== "object")
      return blankModel();
    const circuits: Record<string, CircuitModel> = {};
    for (const [id, value] of Object.entries(parsed.circuits)) {
      if (!value || typeof value !== "object") continue;
      const item = value as Partial<CircuitModel>;
      circuits[id] = {
        ...blankCircuit(id, typeof item.name === "string" ? item.name.slice(0, 80) : id),
        activePower: sanitizeStats(item.activePower),
        standbyPower: sanitizeStats(item.standbyPower),
        runtime: sanitizeStats(item.runtime),
        // In-progress sessions are intentionally discarded across reloads. A
        // browser gap must never be counted as continuous appliance runtime.
        activeSince: null,
        candidateSince: null,
        candidateSamples: 0,
        normalSamples: 0,
        powerEventOpen: false,
        runtimeEventOpen: false,
        lastLearnedAt: typeof item.lastLearnedAt === "number" ? item.lastLearnedAt : null,
        currentWatts: 0,
        currentScore: null,
        currentState: "unknown",
        lastSeen: safeNumber(item.lastSeen),
      };
    }
    const events = Array.isArray(parsed.events)
      ? parsed.events
          .filter((event): event is AdaptiveAnomalyEvent =>
            !!event && typeof event.id === "string" && typeof event.title === "string",
          )
          .slice(0, MAX_EVENTS)
      : [];
    return {
      version: MODEL_VERSION,
      totalSamples: Math.max(0, Math.floor(safeNumber(parsed.totalSamples))),
      lastTimestamp: null,
      circuits,
      events,
    };
  } catch {
    return blankModel();
  }
}

export class AdaptiveAnomalyEngine {
  private models = new Map<UsageSource, PersistedModel>();
  private snapshots = new Map<UsageSource, AdaptiveAnomalySnapshot>();
  private listeners = new Set<() => void>();
  private lastEmitMs = 0;

  constructor(private storage?: StorageLike) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private storageKey(source: UsageSource) {
    return `voltra.adaptive-model.${source}`;
  }

  private model(source: UsageSource) {
    let model = this.models.get(source);
    if (!model) {
      let raw: string | null = null;
      try {
        raw = this.storage?.getItem(this.storageKey(source)) ?? null;
      } catch {
        // Storage denial keeps the model session-only.
      }
      model = restoreModel(raw);
      this.models.set(source, model);
    }
    return model;
  }

  private persist(source: UsageSource, model: PersistedModel) {
    try {
      this.storage?.setItem(this.storageKey(source), JSON.stringify(model));
    } catch {
      // The live model remains useful in memory when storage is unavailable.
    }
  }

  private emit(force = false) {
    const now = Date.now();
    if (!force && now - this.lastEmitMs < 800) return;
    this.lastEmitMs = now;
    for (const listener of this.listeners) listener();
  }

  private addEvent(model: PersistedModel, event: AdaptiveAnomalyEvent) {
    model.events.unshift(event);
    model.events = model.events.slice(0, MAX_EVENTS);
  }

  ingest(
    snapshot: TelemetrySnapshot,
    source: UsageSource,
    thresholds: Record<string, number> = {},
  ) {
    if (snapshot.valid === false || !Number.isFinite(snapshot.timestamp)) return;
    const model = this.model(source);
    const previousTimestamp = model.lastTimestamp;
    if (previousTimestamp !== null && snapshot.timestamp <= previousTimestamp) return;
    const gap = previousTimestamp === null ? 0 : snapshot.timestamp - previousTimestamp;
    const continuous = gap > 0 && gap <= 30;

    if (!continuous && previousTimestamp !== null) {
      for (const circuit of Object.values(model.circuits)) {
        circuit.activeSince = null;
        circuit.candidateSince = null;
        circuit.candidateSamples = 0;
        circuit.normalSamples = 0;
        circuit.powerEventOpen = false;
        circuit.runtimeEventOpen = false;
      }
    }

    for (const reading of snapshot.circuits) {
      const power = circuitWatts(snapshot, reading.id);
      if (!power || !Number.isFinite(power.watts) || power.watts < 0) continue;
      const circuit = model.circuits[reading.id] ?? blankCircuit(reading.id, reading.name);
      model.circuits[reading.id] = circuit;
      circuit.name = reading.name.slice(0, 80);
      circuit.currentWatts = power.watts;
      circuit.lastSeen = snapshot.timestamp;
      const threshold = Math.max(1, thresholds[reading.id] ?? 25);
      const active = power.watts >= threshold;
      circuit.currentState = active ? "active" : "standby";

      if (active) {
        if (circuit.activeSince === null) {
          circuit.activeSince = snapshot.timestamp;
          circuit.runtimeEventOpen = false;
        }
      } else if (circuit.activeSince !== null) {
        const duration = snapshot.timestamp - circuit.activeSince;
        if (continuous && duration >= 30 && duration <= 24 * 3600) updateStats(circuit.runtime, duration);
        circuit.activeSince = null;
        circuit.runtimeEventOpen = false;
      }

      const stats = active ? circuit.activePower : circuit.standbyPower;
      const minimumSamples = active ? ACTIVE_TRAINING_SAMPLES : STANDBY_TRAINING_SAMPLES;
      const deviation = power.watts - stats.mean;
      const deviationSigma = sigma(stats);
      const score = stats.count >= minimumSamples ? deviation / deviationSigma : null;
      const minimumDifference = Math.max(50, stats.mean * 0.3, deviationSigma * 4);
      const candidate = score !== null && deviation > minimumDifference;
      circuit.currentScore = score;

      if (candidate) {
        if (circuit.candidateSince === null) circuit.candidateSince = snapshot.timestamp;
        circuit.candidateSamples += 1;
        circuit.normalSamples = 0;
        const candidateSeconds = snapshot.timestamp - circuit.candidateSince;
        if (
          !circuit.powerEventOpen &&
          circuit.candidateSamples >= POWER_EVENT_MIN_SAMPLES &&
          candidateSeconds >= POWER_EVENT_MIN_SECONDS
        ) {
          const roundedObserved = Math.round(power.watts);
          const roundedBaseline = Math.round(stats.mean);
          const roundedScore = Number((score ?? 0).toFixed(1));
          this.addEvent(model, {
            id: `${source}:${reading.id}:power:${snapshot.timestamp}`,
            source,
            circuitId: reading.id,
            circuitName: reading.name,
            kind: "power_high",
            severity: roundedScore >= 7 ? "important" : "notice",
            timestamp: snapshot.timestamp,
            observedWatts: roundedObserved,
            baselineWatts: roundedBaseline,
            score: roundedScore,
            title: "Sustained draw above the learned range",
            detail: `${reading.name} held near ${roundedObserved} W versus a learned ${active ? "active" : "standby"} level of ${roundedBaseline} W. This is an unusual reading, not a fault diagnosis.`,
          });
          circuit.powerEventOpen = true;
        }
      } else {
        circuit.candidateSince = null;
        circuit.candidateSamples = 0;
        circuit.normalSamples += 1;
        if (circuit.normalSamples >= 3) circuit.powerEventOpen = false;
        // Learn at a fixed cadence so selecting 10 Hz cannot make the model
        // appear trained faster than a 1 Hz or cloud-polled source.
        if (
          circuit.lastLearnedAt === null ||
          snapshot.timestamp - circuit.lastLearnedAt >= 5
        ) {
          updateStats(stats, power.watts);
          circuit.lastLearnedAt = snapshot.timestamp;
        }
      }

      if (active && circuit.activeSince !== null && circuit.runtime.count >= 5) {
        const elapsed = snapshot.timestamp - circuit.activeSince;
        const runtimeLimit = circuit.runtime.mean + Math.max(3 * sigma(circuit.runtime), 900, circuit.runtime.mean * 0.5);
        if (!circuit.runtimeEventOpen && elapsed > runtimeLimit) {
          this.addEvent(model, {
            id: `${source}:${reading.id}:runtime:${snapshot.timestamp}`,
            source,
            circuitId: reading.id,
            circuitName: reading.name,
            kind: "runtime_long",
            severity: elapsed > runtimeLimit * 1.5 ? "important" : "notice",
            timestamp: snapshot.timestamp,
            observedWatts: Math.round(power.watts),
            baselineWatts: circuit.activePower.count ? Math.round(circuit.activePower.mean) : null,
            score: null,
            title: "Longer active session than learned",
            detail: `${reading.name} has remained active for ${Math.round(elapsed / 60)} minutes. Learned sessions average ${Math.round(circuit.runtime.mean / 60)} minutes. Missing telemetry is never counted as continuous runtime.`,
          });
          circuit.runtimeEventOpen = true;
        }
      }
    }

    model.totalSamples += 1;
    model.lastTimestamp = snapshot.timestamp;
    this.snapshots.set(source, this.buildSnapshot(source, model));
    if (model.totalSamples % 20 === 0 || model.events[0]?.timestamp === snapshot.timestamp)
      this.persist(source, model);
    this.emit(!!model.events[0] && model.events[0].timestamp === snapshot.timestamp);
  }

  private buildSnapshot(source: UsageSource, model: PersistedModel): AdaptiveAnomalySnapshot {
    const circuits = Object.values(model.circuits)
      .map((circuit): AdaptiveCircuitSnapshot => {
        const stage = stageFor(circuit);
        const relevantCount =
          circuit.currentState === "active"
            ? circuit.activePower.count
            : circuit.currentState === "standby"
              ? circuit.standbyPower.count
              : Math.max(circuit.activePower.count, circuit.standbyPower.count);
        const target =
          circuit.currentState === "standby"
            ? STANDBY_TRAINING_SAMPLES
            : ACTIVE_TRAINING_SAMPLES;
        const currentStateReady =
          circuit.currentState === "active"
            ? circuit.activePower.count >= ACTIVE_TRAINING_SAMPLES
            : circuit.currentState === "standby"
              ? circuit.standbyPower.count >= STANDBY_TRAINING_SAMPLES
              : false;
        const watch = circuit.powerEventOpen || circuit.runtimeEventOpen;
        return {
          id: circuit.id,
          name: circuit.name,
          stage,
          trainingProgress: Math.min(100, Math.round((relevantCount / target) * 100)),
          activeSamples: circuit.activePower.count,
          standbySamples: circuit.standbyPower.count,
          completedSessions: circuit.runtime.count,
          currentWatts: circuit.currentWatts,
          typicalActiveWatts: circuit.activePower.count >= 10 ? circuit.activePower.mean : null,
          typicalRuntimeSeconds: circuit.runtime.count >= 3 ? circuit.runtime.mean : null,
          score: circuit.currentScore,
          state: circuit.currentState,
          status: watch ? "watch" : currentStateReady ? "normal" : "learning",
          lastSeen: circuit.lastSeen,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const readyCircuits = circuits.filter((circuit) => circuit.stage === "ready").length;
    return {
      source,
      stage: !circuits.length
        ? "waiting"
        : readyCircuits === circuits.length
          ? "ready"
          : circuits.some((circuit) => circuit.stage !== "waiting")
            ? "learning"
            : "waiting",
      totalSamples: model.totalSamples,
      readyCircuits,
      circuits,
      events: model.events.slice(0, 20),
      updatedAt: model.lastTimestamp,
    };
  }

  getSnapshot(source: UsageSource): AdaptiveAnomalySnapshot {
    let snapshot = this.snapshots.get(source);
    if (!snapshot) {
      snapshot = this.buildSnapshot(source, this.model(source));
      this.snapshots.set(source, snapshot);
    }
    return snapshot;
  }

  markEvent(source: UsageSource, eventId: string, feedback: "expected" | "review") {
    const model = this.model(source);
    const event = model.events.find((item) => item.id === eventId);
    if (!event) return;
    event.feedback = feedback;
    this.persist(source, model);
    this.snapshots.set(source, this.buildSnapshot(source, model));
    this.emit(true);
  }

  clearEvents(source: UsageSource) {
    const model = this.model(source);
    model.events = [];
    this.persist(source, model);
    this.snapshots.set(source, this.buildSnapshot(source, model));
    this.emit(true);
  }

  reset(source: UsageSource) {
    this.models.set(source, blankModel());
    this.snapshots.delete(source);
    try {
      this.storage?.removeItem(this.storageKey(source));
    } catch {
      // Model is already reset in memory.
    }
    this.emit(true);
  }
}

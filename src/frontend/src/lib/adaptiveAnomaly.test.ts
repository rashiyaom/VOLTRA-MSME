import { describe, expect, it } from "vitest";
import { AdaptiveAnomalyEngine, type StorageLike } from "./adaptiveAnomaly";
import type { TelemetrySnapshot } from "@/services/esp32Api";

function reading(timestamp: number, watts: number, name = "Kitchen circuit"): TelemetrySnapshot {
  return {
    timestamp,
    voltage_rms: 230,
    current_rms: watts / 230,
    active_power: watts,
    apparent_power: watts,
    power_factor: 1,
    frequency: 50,
    rawTime: "00:00:00",
    load1: watts / 230,
    load2: 0,
    power1: watts,
    power2: 0,
    circuits: [{ id: "c1", name, state: watts > 0 ? "CLOSED" : "OPEN", current: watts / 230, rated: 16 }],
    valid: true,
  };
}

function train(engine: AdaptiveAnomalyEngine, source: "demo" | "hardware" = "hardware") {
  for (let index = 1; index <= 70; index += 1) {
    engine.ingest(reading(index * 5, 500 + ((index % 3) - 1) * 5), source, { c1: 25 });
  }
}

describe("adaptive anomaly engine", () => {
  it("waits for a learned baseline and sustained evidence before raising an event", () => {
    const engine = new AdaptiveAnomalyEngine();
    train(engine);
    expect(engine.getSnapshot("hardware").stage).toBe("ready");

    engine.ingest(reading(355, 1000), "hardware", { c1: 25 });
    engine.ingest(reading(360, 1000), "hardware", { c1: 25 });
    expect(engine.getSnapshot("hardware").events).toHaveLength(0);
    engine.ingest(reading(365, 1000), "hardware", { c1: 25 });

    const [event] = engine.getSnapshot("hardware").events;
    expect(event.kind).toBe("power_high");
    expect(event.observedWatts).toBe(1000);
    expect(event.baselineWatts).toBeCloseTo(500, -1);
    expect(event.detail).toContain("not a fault diagnosis");
  });

  it("does not turn one isolated spike into an anomaly", () => {
    const engine = new AdaptiveAnomalyEngine();
    train(engine);
    engine.ingest(reading(355, 1300), "hardware", { c1: 25 });
    engine.ingest(reading(360, 505), "hardware", { c1: 25 });
    expect(engine.getSnapshot("hardware").events).toHaveLength(0);
  });

  it("does not learn faster when the stream sample rate increases", () => {
    const engine = new AdaptiveAnomalyEngine();
    for (let index = 1; index <= 600; index += 1) {
      engine.ingest(reading(index / 10, 500), "hardware", { c1: 25 });
    }
    const circuit = engine.getSnapshot("hardware").circuits[0];
    expect(circuit.activeSamples).toBeLessThanOrEqual(12);
    expect(circuit.stage).toBe("learning");
  });

  it("does not call an unseen operating state normal", () => {
    const engine = new AdaptiveAnomalyEngine();
    train(engine);
    engine.ingest(reading(355, 0), "hardware", { c1: 25 });
    const circuit = engine.getSnapshot("hardware").circuits[0];
    expect(circuit.stage).toBe("ready");
    expect(circuit.state).toBe("standby");
    expect(circuit.status).toBe("learning");
  });

  it("breaks continuity across missing telemetry", () => {
    const engine = new AdaptiveAnomalyEngine();
    train(engine);
    engine.ingest(reading(355, 1000), "hardware", { c1: 25 });
    engine.ingest(reading(400, 1000), "hardware", { c1: 25 });
    engine.ingest(reading(405, 1000), "hardware", { c1: 25 });
    expect(engine.getSnapshot("hardware").events).toHaveLength(0);
  });

  it("learns completed sessions and identifies unusually long continuous runtime", () => {
    const engine = new AdaptiveAnomalyEngine();
    let timestamp = 0;
    for (let session = 0; session < 5; session += 1) {
      for (let step = 0; step < 4; step += 1) {
        timestamp += 30;
        engine.ingest(reading(timestamp, 450), "hardware", { c1: 25 });
      }
      timestamp += 30;
      engine.ingest(reading(timestamp, 0), "hardware", { c1: 25 });
    }
    timestamp += 30;
    engine.ingest(reading(timestamp, 450), "hardware", { c1: 25 });
    for (let step = 0; step < 36; step += 1) {
      timestamp += 30;
      engine.ingest(reading(timestamp, 450), "hardware", { c1: 25 });
    }
    expect(engine.getSnapshot("hardware").events.some((event) => event.kind === "runtime_long")).toBe(true);
  });

  it("keeps simulated and hardware learning isolated", () => {
    const engine = new AdaptiveAnomalyEngine();
    train(engine, "demo");
    expect(engine.getSnapshot("demo").stage).toBe("ready");
    expect(engine.getSnapshot("hardware").stage).toBe("waiting");
  });

  it("restores learned baselines without treating a browser gap as runtime", () => {
    const values = new Map<string, string>();
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const first = new AdaptiveAnomalyEngine(storage);
    train(first);
    const restored = new AdaptiveAnomalyEngine(storage).getSnapshot("hardware");
    expect(restored.stage).toBe("ready");
    expect(restored.circuits[0].currentWatts).toBe(0);
    expect(restored.circuits[0].state).toBe("unknown");
  });
});

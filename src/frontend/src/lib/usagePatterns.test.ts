import { describe, expect, it } from "vitest";
import {
  analyzeCircuit,
  circuitDefaults,
  dayKey,
  defaultPreferences,
  intervalBuckets,
  scheduledAt,
  type UsageBucket,
} from "./usagePatterns";
import type { TelemetrySnapshot } from "@/services/esp32Api";
const snapshot = (timestamp: number, current = 1): TelemetrySnapshot => ({
  timestamp,
  voltage_rms: 230,
  current_rms: current,
  active_power: 230 * current,
  apparent_power: 230 * current,
  power_factor: 1,
  frequency: 50,
  circuits: [{ id: "c1", name: "Workshop", current, rated: 16, state: "CLOSED" }],
});
const preferences = defaultPreferences();
const time = (day: string, hour = 0) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).getTime() / 1000;
function row(day: string, seconds = 43200, activeSeconds = 3600): UsageBucket {
  const start = time(day);
  return {
    id: day,
    source: "hardware",
    circuitId: "c1",
    name: "Workshop",
    start,
    seconds,
    activeSeconds,
    wh: 230,
    peakW: 230,
    estimated: true,
  };
}
describe("Usage evidence and cold start", () => {
  it("starts without invented observations or baselines", () => {
    const result = analyzeCircuit([], circuitDefaults("A"));
    expect(result.baseline).toBeNull();
    expect(result.validDays).toBe(0);
    expect(result.insights).toEqual([]);
    expect(result.today.seconds).toBe(0);
  });
  it("integrates watts over observed seconds and splits a bucket boundary", () => {
    const values = intervalBuckets(snapshot(299), snapshot(309), "hardware", preferences);
    expect(values).toHaveLength(2);
    expect(values.map((v) => v.seconds)).toEqual([1, 9]);
    expect(values.reduce((s, v) => s + v.wh, 0)).toBeCloseTo((230 * 10) / 3600);
    expect(values.every((v) => v.source === "hardware")).toBe(true);
  });
  it("never turns gaps, invalid samples or duplicate timestamps into observations", () => {
    expect(intervalBuckets(snapshot(0), snapshot(45), "hardware", preferences)).toEqual([]);
    expect(intervalBuckets(snapshot(10), snapshot(10), "hardware", preferences)).toEqual([]);
    expect(
      intervalBuckets(snapshot(10), { ...snapshot(20), valid: false }, "hardware", preferences),
    ).toEqual([]);
  });
  it("detects measured activity, not a closed breaker", () => {
    const values = intervalBuckets(snapshot(0, 0), snapshot(10, 0), "demo", preferences);
    expect(values[0].activeSeconds).toBe(0);
    expect(values[0].seconds).toBe(10);
  });
  it("uses direct power when present and separates source identities", () => {
    const a = { ...snapshot(1), power1: 50 },
      b = { ...snapshot(11), power1: 50 };
    const real = intervalBuckets(a, b, "hardware", preferences)[0],
      demo = intervalBuckets(a, b, "demo", preferences)[0];
    expect(real.wh).toBeCloseTo((50 * 10) / 3600);
    expect(real.estimated).toBe(false);
    expect(real.id).not.toBe(demo.id);
  });
  it("requires coverage and comparable weekdays, not calendar age", () => {
    const rows = [
      row("2026-10-05"),
      row("2026-10-06"),
      row("2026-10-07"),
      row("2026-10-08"),
      row("2026-10-09", 100),
      row("2026-10-10"),
    ];
    const result = analyzeCircuit(rows, circuitDefaults("A"), time("2026-10-14", 12));
    expect(result.validDays).toBe(5);
    expect(result.comparableDays).toBe(4);
    expect(result.baseline).toBeNull();
    rows.push(row("2026-10-12"));
    expect(analyzeCircuit(rows, circuitDefaults("A"), time("2026-10-14", 12)).baseline).toBe(3600);
  });
  it("excludes today from training and labels immediate reminders as rules", () => {
    const r = circuitDefaults("A");
    r.schedule = true;
    r.runtimeHours = 1;
    const result = analyzeCircuit([row("2026-10-14", 50000, 7200)], r, time("2026-10-14", 18));
    expect(result.validDays).toBe(0);
    expect(result.insights).toHaveLength(2);
    expect(result.insights.every((i) => i.kind === "rule")).toBe(true);
  });
  it("assigns overnight shifts to the day they started", () => {
    const r = { ...circuitDefaults("A"), schedule: true, startHour: 22, endHour: 6, days: [5] };
    expect(scheduledAt(time("2026-10-09", 23), r)).toBe(true);
    expect(scheduledAt(time("2026-10-10", 3), r)).toBe(true);
    expect(scheduledAt(time("2026-10-10", 23), r)).toBe(false);
  });
  it("does not apply learned daily-runtime comparisons before sufficient evidence", () => {
    const history = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map(
      (d) => row(d),
    );
    history.push(row("2026-10-14", 20000, 10000));
    const result = analyzeCircuit(history, circuitDefaults("A"), time("2026-10-14", 12));
    expect(result.insights.some((i) => i.kind === "learned")).toBe(true);
    expect(dayKey(time("2026-10-14", 12))).toBe("2026-10-14");
  });
});

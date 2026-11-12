import type { TelemetrySnapshot } from "@/services/esp32Api";

export type UsageSource = "hardware" | "demo";
export interface UsageBucket {
  id: string;
  source: UsageSource;
  circuitId: string;
  name: string;
  start: number;
  seconds: number;
  activeSeconds: number;
  wh: number;
  peakW: number;
  estimated: boolean;
}
export interface CircuitPreference {
  name: string;
  equipment: string;
  schedule: boolean;
  startHour: number;
  endHour: number;
  days: number[];
  thresholdW: number;
  runtimeHours: number;
}
export interface UsagePreferences {
  configured: boolean;
  goal: string;
  retentionDays: number;
  circuits: Record<string, CircuitPreference>;
  feedback: Record<string, "expected" | "investigate">;
}
export const defaultPreferences = (): UsagePreferences => ({
  configured: false,
  goal: "Understand my routine",
  retentionDays: 30,
  circuits: {},
  feedback: {},
});
export const circuitDefaults = (name: string): CircuitPreference => ({
  name,
  equipment: "Mixed / unknown",
  schedule: false,
  startHour: 9,
  endHour: 18,
  days: [1, 2, 3, 4, 5],
  thresholdW: 25,
  runtimeHours: 0,
});
export const BUCKET_SECONDS = 300;
export const MAX_GAP_SECONDS = 30;
export function dayKey(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function scheduledAt(timestamp: number, rule: CircuitPreference) {
  if (!rule.schedule) return true;
  const d = new Date(timestamp * 1000),
    hour = d.getHours() + d.getMinutes() / 60;
  if (rule.startHour === rule.endHour) return rule.days.includes(d.getDay());
  if (rule.startHour < rule.endHour)
    return rule.days.includes(d.getDay()) && hour >= rule.startHour && hour < rule.endHour;
  // After midnight belongs to the previous day's overnight shift.
  return hour >= rule.startHour
    ? rule.days.includes(d.getDay())
    : hour < rule.endHour && rule.days.includes((d.getDay() + 6) % 7);
}
export function circuitWatts(snapshot: TelemetrySnapshot, id: string) {
  const direct = id === "c1" ? snapshot.power1 : id === "c2" ? snapshot.power2 : undefined;
  const circuit = snapshot.circuits.find((c) => c.id === id);
  if (!circuit || !Number.isFinite(circuit.current) || circuit.current < 0) return null;
  if (direct !== undefined && Number.isFinite(direct) && direct >= 0)
    return { watts: direct, estimated: false };
  const watts = snapshot.voltage_rms * circuit.current * snapshot.power_factor;
  return Number.isFinite(watts) && watts >= 0 ? { watts, estimated: true } : null;
}
// Integrate only intervals with two valid, nearby observations; never fill a disconnect gap.
export function intervalBuckets(
  previous: TelemetrySnapshot,
  next: TelemetrySnapshot,
  source: UsageSource,
  preferences: UsagePreferences,
): UsageBucket[] {
  const duration = next.timestamp - previous.timestamp;
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_GAP_SECONDS ||
    previous.valid === false ||
    next.valid === false
  )
    return [];
  const result: UsageBucket[] = [];
  for (const circuit of previous.circuits) {
    const power = circuitWatts(previous, circuit.id),
      nextPower = circuitWatts(next, circuit.id);
    if (!power || !nextPower) continue;
    const watts = (power.watts + nextPower.watts) / 2;
    const threshold = preferences.circuits[circuit.id]?.thresholdW ?? 25;
    let cursor = previous.timestamp;
    while (cursor < next.timestamp) {
      const start = Math.floor(cursor / BUCKET_SECONDS) * BUCKET_SECONDS;
      const end = Math.min(start + BUCKET_SECONDS, next.timestamp),
        seconds = end - cursor;
      result.push({
        id: `${source}:${circuit.id}:${start}`,
        source,
        circuitId: circuit.id,
        name: circuit.name,
        start,
        seconds,
        activeSeconds: watts >= threshold ? seconds : 0,
        wh: (watts * seconds) / 3600,
        peakW: Math.max(power.watts, nextPower.watts),
        estimated: power.estimated || nextPower.estimated,
      });
      cursor = end;
    }
  }
  return result;
}
export interface DayUsage {
  day: string;
  seconds: number;
  activeSeconds: number;
  wh: number;
  outsideSeconds: number;
  firstHour: number | null;
}
export interface UsageInsight {
  id: string;
  kind: "rule" | "learned";
  title: string;
  detail: string;
}
export function analyzeCircuit(
  rows: UsageBucket[],
  rule: CircuitPreference,
  now = Date.now() / 1000,
) {
  const days = new Map<string, DayUsage>();
  for (const row of rows) {
    const day = dayKey(row.start),
      d = days.get(day) ?? {
        day,
        seconds: 0,
        activeSeconds: 0,
        wh: 0,
        outsideSeconds: 0,
        firstHour: null,
      };
    d.seconds += row.seconds;
    d.activeSeconds += row.activeSeconds;
    d.wh += row.wh;
    if (!scheduledAt(row.start, rule)) d.outsideSeconds += row.activeSeconds;
    if (row.activeSeconds > 0) {
      const date = new Date(row.start * 1000);
      const h = date.getHours() + date.getMinutes() / 60;
      d.firstHour = d.firstHour === null ? h : Math.min(h, d.firstHour);
    }
    days.set(day, d);
  }
  const todayKey = dayKey(now);
  const today = days.get(todayKey) ?? {
    day: todayKey,
    seconds: 0,
    activeSeconds: 0,
    wh: 0,
    outsideSeconds: 0,
    firstHour: null,
  };
  const history = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const validDays = history.filter((d) => d.day < todayKey && d.seconds >= 12 * 3600);
  const weekend = (day: string) => [0, 6].includes(new Date(`${day}T12:00:00`).getDay());
  const comparable = validDays.filter((d) => weekend(d.day) === weekend(todayKey));
  const baseline =
    comparable.length >= 5
      ? comparable.reduce((sum, d) => sum + d.activeSeconds, 0) / comparable.length
      : null;
  const insights: UsageInsight[] = [];
  const observedStarts = comparable
    .filter((d) => d.firstHour !== null)
    .map((d) => d.firstHour as number);
  if (
    observedStarts.length >= 5 &&
    Math.max(...observedStarts) - Math.min(...observedStarts) <= 2
  ) {
    const clock = (hour: number) =>
      `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
    insights.push({
      id: `${todayKey}:start-window`,
      kind: "learned",
      title: "A recurring activity window",
      detail: `First observed activity fell between ${clock(Math.min(...observedStarts))} and ${clock(Math.max(...observedStarts))} on ${observedStarts.length} comparable days. This describes the recorded activity, not a confirmed appliance switch-on; gaps may hide an earlier start.`,
    });
  }
  if (rule.schedule && today.outsideSeconds >= 15 * 60)
    insights.push({
      id: `${todayKey}:schedule`,
      kind: "rule",
      title: "Activity outside your schedule",
      detail: `${(today.outsideSeconds / 3600).toFixed(1)} hours of observed activity fell outside your configured hours. This is a schedule check, not a learned habit.`,
    });
  if (rule.runtimeHours > 0 && today.activeSeconds >= rule.runtimeHours * 3600)
    insights.push({
      id: `${todayKey}:runtime`,
      kind: "rule",
      title: "Daily runtime reminder",
      detail: `${(today.activeSeconds / 3600).toFixed(1)} active hours recorded today, reaching your ${rule.runtimeHours}-hour daily limit.`,
    });
  if (
    baseline !== null &&
    baseline > 0 &&
    today.activeSeconds > baseline * 1.5 &&
    today.activeSeconds - baseline > 3600
  )
    insights.push({
      id: `${todayKey}:longer`,
      kind: "learned",
      title: "More active time than usual",
      detail: `Today's observed activity already exceeds the average of ${comparable.length} comparable days by ${((today.activeSeconds - baseline) / 3600).toFixed(1)} hours. Reference days each have at least 12 hours of coverage; totals may be partial.`,
    });
  return {
    today,
    history,
    validDays: validDays.length,
    comparableDays: comparable.length,
    weekdayDays: validDays.filter((d) => !weekend(d.day)).length,
    weekendDays: validDays.filter((d) => weekend(d.day)).length,
    baseline,
    insights,
    stage:
      comparable.length >= 5
        ? "Comparisons available"
        : history.length >= 3
          ? "Early observations"
          : "Collecting your first days",
  };
}
// Explicit sample dataset for preview only; never written into measured history.
export function exampleHistory(now = Date.now() / 1000): UsageBucket[] {
  const rows: UsageBucket[] = [],
    date = new Date(now * 1000);
  date.setHours(0, 0, 0, 0);
  for (let day = 13; day >= 0; day--) {
    const start = new Date(date);
    start.setDate(start.getDate() - day);
    for (let minute = 0; minute < 1440; minute += 5) {
      const time = start.getTime() / 1000 + minute * 60;
      if (time + 300 > now) continue;
      for (const [i, name] of ["Workshop equipment", "Lighting & sockets", "Cooling"].entries()) {
        const hour = minute / 60,
          weekday = ![0, 6].includes(start.getDay());
        const active = weekday
          ? hour >= 9 + (i === 2 ? 1 : 0) && hour < (day === 0 ? 21 : 18) + (i === 1 ? 1 : 0)
          : i === 2 && hour >= 12 && hour < 16;
        const watts = active
          ? [1250, 380, 820][i] * (1 + 0.08 * Math.sin(minute / 30 + day))
          : [8, 12, 20][i];
        rows.push({
          id: `demo:c${i + 1}:${time}`,
          source: "demo",
          circuitId: `c${i + 1}`,
          name,
          start: time,
          seconds: 300,
          activeSeconds: active ? 300 : 0,
          wh: watts / 12,
          peakW: watts,
          estimated: true,
        });
      }
    }
  }
  return rows;
}

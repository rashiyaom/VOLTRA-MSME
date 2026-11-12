import type { UsageBucket } from "@/lib/usagePatterns";

export type ApplianceCategory =
  | "air_conditioner"
  | "washing_machine"
  | "water_heater"
  | "refrigerator"
  | "lighting"
  | "fan"
  | "pump"
  | "cooking"
  | "mixed"
  | "other";

export type PlanConfidence = "measured" | "learning" | "estimated";

export interface ManualAppliance {
  id: string;
  name: string;
  category: ApplianceCategory;
  watts: number;
  quantity: number;
  hoursPerUse: number;
  usesPerWeek: number;
  essential: boolean;
}

export interface BillPlanSettings {
  configured: boolean;
  target: number;
  cycleStart: string;
  cycleEnd: string;
  tariffRate: number;
  fixedCharges: number;
  taxPercent: number;
  manualAppliances: ManualAppliance[];
}

export interface HouseholdLoad {
  id: string;
  name: string;
  category: ApplianceCategory;
  dailyKwh: number;
  hoursPerDay: number;
  monitored: boolean;
  confidence: PlanConfidence;
  coverageDays: number;
  essential: boolean;
}

export interface LoadPlan extends HouseholdLoad {
  monthlyKwh: number;
  monthlyCost: number;
  recommendedDailyKwh: number;
  recommendedHoursPerDay: number;
  reductionKwh: number;
  status: "on-track" | "adjust" | "limited";
  instruction: string;
}

export interface BillForecast {
  target: number;
  billingDays: number;
  daysElapsed: number;
  daysRemaining: number;
  energyBudgetKwh: number;
  dailyEnergyAllowance: number;
  projectedKwh: number;
  projectedBill: number;
  plannedKwh: number;
  plannedBill: number;
  gap: number;
  achievable: boolean;
  loads: LoadPlan[];
}

export const categoryLabels: Record<ApplianceCategory, string> = {
  air_conditioner: "Air conditioner",
  washing_machine: "Washing machine",
  water_heater: "Water heater",
  refrigerator: "Refrigerator",
  lighting: "Lighting",
  fan: "Fan",
  pump: "Water pump",
  cooking: "Cooking appliance",
  mixed: "Mixed circuit",
  other: "Other appliance",
};

const MS_DAY = 86_400_000;

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function defaultBillPlanSettings(now = new Date()): BillPlanSettings {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    configured: false,
    target: 2500,
    cycleStart: isoDate(start),
    cycleEnd: isoDate(end),
    tariffRate: 7.5,
    fixedCharges: 150,
    taxPercent: 5,
    manualAppliances: [],
  };
}

export function inferCategory(value: string): ApplianceCategory {
  const text = value.toLowerCase();
  if (/\b(ac|air conditioner|cooling|hvac)\b/.test(text)) return "air_conditioner";
  if (/wash|laundry/.test(text)) return "washing_machine";
  if (/geyser|water heater|hot water/.test(text)) return "water_heater";
  if (/fridge|refriger/.test(text)) return "refrigerator";
  if (/light|lamp/.test(text)) return "lighting";
  if (/\bfan\b/.test(text)) return "fan";
  if (/pump|motor/.test(text)) return "pump";
  if (/cook|oven|microwave|induction/.test(text)) return "cooking";
  if (/mixed|unknown|socket/.test(text)) return "mixed";
  return "other";
}

export function manualApplianceToLoad(appliance: ManualAppliance): HouseholdLoad {
  const weeklyKwh =
    (appliance.watts * appliance.quantity * appliance.hoursPerUse * appliance.usesPerWeek) / 1000;
  return {
    id: appliance.id,
    name: appliance.name,
    category: appliance.category,
    dailyKwh: weeklyKwh / 7,
    hoursPerDay: (appliance.hoursPerUse * appliance.usesPerWeek) / 7,
    monitored: false,
    confidence: "estimated",
    coverageDays: 0,
    essential: appliance.essential,
  };
}

export function monitoredLoadsFromHistory(
  rows: UsageBucket[],
  circuits: Array<{ id: string; name: string; equipment?: string; watts?: number }>,
): HouseholdLoad[] {
  return circuits.map((circuit) => {
    const circuitRows = rows.filter((row) => row.circuitId === circuit.id);
    const days = new Map<string, { seconds: number; wh: number; active: number }>();
    for (const row of circuitRows) {
      const date = new Date(row.start * 1000);
      const key = isoDate(date);
      const day = days.get(key) ?? { seconds: 0, wh: 0, active: 0 };
      day.seconds += row.seconds;
      day.wh += row.wh;
      day.active += row.activeSeconds;
      days.set(key, day);
    }
    const samples = [...days.values()].filter((day) => day.seconds >= 12 * 3600).slice(-14);
    const partial = [...days.values()].filter((day) => day.seconds > 0).slice(-7);
    const used = samples.length ? samples : partial;
    const dailyKwh = used.length
      ? used.reduce((sum, day) => sum + (day.wh / 1000) * (86400 / day.seconds), 0) /
        used.length
      : Math.max(0, circuit.watts ?? 0) / 1000;
    const hoursPerDay = used.length
      ? used.reduce((sum, day) => sum + (day.active / 3600) * (86400 / day.seconds), 0) /
        used.length
      : circuit.watts && circuit.watts > 25
        ? 1
        : 0;
    const category = inferCategory(`${circuit.equipment || ""} ${circuit.name}`);
    return {
      id: `monitored:${circuit.id}`,
      name: circuit.equipment && !/mixed|unknown/i.test(circuit.equipment)
        ? circuit.equipment
        : circuit.name,
      category,
      dailyKwh,
      hoursPerDay,
      monitored: true,
      confidence: samples.length >= 5 ? "measured" : "learning",
      coverageDays: samples.length,
      essential: category === "refrigerator",
    };
  });
}

function cycleDays(start: string, end: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime())) return 30;
  return Math.max(1, Math.round((last.getTime() - first.getTime()) / MS_DAY) + 1);
}

function minimumFraction(load: HouseholdLoad) {
  if (load.essential) return 0.95;
  const values: Record<ApplianceCategory, number> = {
    air_conditioner: 0.55,
    washing_machine: 0.68,
    water_heater: 0.6,
    refrigerator: 0.95,
    lighting: 0.75,
    fan: 0.8,
    pump: 0.75,
    cooking: 0.82,
    mixed: 0.88,
    other: 0.82,
  };
  return values[load.category];
}

function instructionFor(load: HouseholdLoad, hours: number, dailyKwh: number) {
  const prefix = load.confidence === "estimated" ? "Estimated plan" : "Usage plan";
  switch (load.category) {
    case "air_conditioner":
      return `${prefix}: up to ${hours.toFixed(1)} h/day around 24°C.`;
    case "washing_machine": {
      return `${prefix}: use Eco mode and keep weekly runtime near ${(hours * 7).toFixed(1)} hours.`;
    }
    case "water_heater":
      return `${prefix}: keep combined heating time near ${Math.round(hours * 60)} min/day.`;
    case "refrigerator":
      return "Essential baseline: keep running; check seals and avoid the coldest setting.";
    case "fan":
      return `${prefix}: up to ${hours.toFixed(1)} h/day at the lowest comfortable speed.`;
    case "lighting":
      return `${prefix}: keep active lighting near ${hours.toFixed(1)} h/day.`;
    case "pump":
      return `${prefix}: group pumping into roughly ${Math.round(hours * 60)} min/day.`;
    default:
      return `${prefix}: keep this load near ${dailyKwh.toFixed(2)} kWh/day.`;
  }
}

export function buildBillForecast(
  settings: BillPlanSettings,
  householdLoads: HouseholdLoad[],
  now = new Date(),
): BillForecast {
  const billingDays = cycleDays(settings.cycleStart, settings.cycleEnd);
  const start = new Date(`${settings.cycleStart}T00:00:00`);
  const end = new Date(`${settings.cycleEnd}T23:59:59`);
  const daysElapsed = now < start
    ? 0
    : now > end
      ? billingDays
      : Math.min(billingDays, Math.max(1, Math.floor((now.getTime() - start.getTime()) / MS_DAY) + 1));
  const daysRemaining = Math.max(0, billingDays - daysElapsed);
  const taxMultiplier = 1 + Math.max(0, settings.taxPercent) / 100;
  const rate = Math.max(0.01, settings.tariffRate);
  const energyBudgetKwh = Math.max(
    0,
    (Math.max(0, settings.target) / taxMultiplier - Math.max(0, settings.fixedCharges)) / rate,
  );
  const dailyEnergyAllowance = energyBudgetKwh / billingDays;
  const projectedKwh = householdLoads.reduce((sum, load) => sum + load.dailyKwh, 0) * billingDays;
  const projectedBill = (projectedKwh * rate + settings.fixedCharges) * taxMultiplier;
  const requiredDailyReduction = Math.max(0, projectedKwh / billingDays - dailyEnergyAllowance);
  const availableDailyReduction = householdLoads.reduce(
    (sum, load) => sum + load.dailyKwh * (1 - minimumFraction(load)),
    0,
  );
  const reductionScale = availableDailyReduction
    ? Math.min(1, requiredDailyReduction / availableDailyReduction)
    : 0;
  const loads = householdLoads
    .map((load): LoadPlan => {
      const possibleReduction = load.dailyKwh * (1 - minimumFraction(load));
      const reductionKwh = possibleReduction * reductionScale;
      const recommendedDailyKwh = Math.max(0, load.dailyKwh - reductionKwh);
      const recommendedHoursPerDay = load.dailyKwh > 0
        ? load.hoursPerDay * (recommendedDailyKwh / load.dailyKwh)
        : 0;
      return {
        ...load,
        monthlyKwh: load.dailyKwh * billingDays,
        monthlyCost: load.dailyKwh * billingDays * rate * taxMultiplier,
        recommendedDailyKwh,
        recommendedHoursPerDay,
        reductionKwh: reductionKwh * billingDays,
        status:
          requiredDailyReduction <= 0
            ? "on-track"
            : reductionKwh > 0.01
              ? "adjust"
              : "limited",
        instruction: instructionFor(load, recommendedHoursPerDay, recommendedDailyKwh),
      };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);
  const plannedKwh = loads.reduce(
    (sum, load) => sum + load.recommendedDailyKwh * billingDays,
    0,
  );
  const plannedBill = (plannedKwh * rate + settings.fixedCharges) * taxMultiplier;
  return {
    target: settings.target,
    billingDays,
    daysElapsed,
    daysRemaining,
    energyBudgetKwh,
    dailyEnergyAllowance,
    projectedKwh,
    projectedBill,
    plannedKwh,
    plannedBill,
    gap: projectedBill - settings.target,
    achievable: plannedBill <= settings.target + 1,
    loads,
  };
}

export function budgetStorageKey(source: "hardware" | "demo") {
  return `voltra.bill-plan.${source}`;
}

export function readBillPlanSettings(source: "hardware" | "demo") {
  const fallback = defaultBillPlanSettings();
  if (typeof localStorage === "undefined") return fallback;
  try {
    const stored = JSON.parse(localStorage.getItem(budgetStorageKey(source)) || "null");
    if (!stored || typeof stored !== "object") return fallback;
    return {
      ...fallback,
      ...stored,
      target: Number(stored.target) || fallback.target,
      tariffRate: Number(stored.tariffRate) || fallback.tariffRate,
      fixedCharges: Math.max(0, Number(stored.fixedCharges) || 0),
      taxPercent: Math.max(0, Number(stored.taxPercent) || 0),
      manualAppliances: Array.isArray(stored.manualAppliances) ? stored.manualAppliances : [],
    } as BillPlanSettings;
  } catch {
    return fallback;
  }
}

export function saveBillPlanSettings(
  source: "hardware" | "demo",
  settings: BillPlanSettings,
) {
  localStorage.setItem(budgetStorageKey(source), JSON.stringify(settings));
  window.dispatchEvent(new Event("voltra-bill-plan-change"));
}

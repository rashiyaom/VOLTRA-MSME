import { readApiBase } from "@/lib/apiSettings";
import { authSession } from "@/lib/authSession";
import type { BillForecast, BillPlanSettings } from "@/lib/billPlan";
import { groqRequestHeaders } from "@/lib/groqSettings";
import type { UsageSource } from "@/lib/usagePatterns";

export interface AiLoadTarget {
  loadId: string;
  name: string;
  category: string;
  hours: number;
  timeWindow: string;
  note: string;
  essential: boolean;
}

export interface AiPlanDay {
  date: string;
  focus: string;
  budgetKwh: number;
  estimatedCostInr: number;
  actions: string[];
  loadTargets: AiLoadTarget[];
}

export interface AiPlanWeek {
  week: number;
  startDate: string;
  endDate: string;
  focus: string;
  budgetKwh: number;
  estimatedCostInr: number;
}

export interface AiBillPlan {
  headline: string;
  summary: string;
  priorities: string[];
  expectedMonthlyKwh: number;
  expectedBillInr: number;
  savingsInr: number;
  targetInr: number;
  achievable: boolean;
  source: UsageSource;
  weeks: AiPlanWeek[];
  days: AiPlanDay[];
  generatedAt: string;
  provider: "Groq";
  model: string;
}

export function billPlanFingerprint(
  source: UsageSource,
  settings: BillPlanSettings,
  forecast: BillForecast,
) {
  return JSON.stringify({
    source,
    settings,
    loads: forecast.loads.map((load) => ({
      id: load.id,
      dailyKwh: Number(load.dailyKwh.toFixed(4)),
      recommendedDailyKwh: Number(load.recommendedDailyKwh.toFixed(4)),
      recommendedHoursPerDay: Number(load.recommendedHoursPerDay.toFixed(3)),
    })),
  });
}

function cacheKey(source: UsageSource) {
  return `voltra.bill-plan.ai.${source}`;
}

export function readCachedAiBillPlan(source: UsageSource, fingerprint: string): AiBillPlan | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(source)) || "null");
    return cached?.fingerprint === fingerprint ? (cached.plan as AiBillPlan) : null;
  } catch {
    return null;
  }
}

function cacheAiBillPlan(source: UsageSource, fingerprint: string, plan: AiBillPlan) {
  localStorage.setItem(cacheKey(source), JSON.stringify({ fingerprint, plan }));
}

export async function generateAiBillPlan(
  source: UsageSource,
  settings: BillPlanSettings,
  forecast: BillForecast,
  signal: AbortSignal,
): Promise<AiBillPlan> {
  const token = authSession.getToken();
  let response: Response;
  try {
    response = await fetch(`${readApiBase()}/api/usage/bill-plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...groqRequestHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        source,
        settings: {
          target: settings.target,
          cycleStart: settings.cycleStart,
          cycleEnd: settings.cycleEnd,
          tariffRate: settings.tariffRate,
          fixedCharges: settings.fixedCharges,
          taxPercent: settings.taxPercent,
        },
        forecast: {
          billingDays: forecast.billingDays,
          dailyEnergyAllowance: forecast.dailyEnergyAllowance,
          projectedKwh: forecast.projectedKwh,
          projectedBill: forecast.projectedBill,
          plannedKwh: forecast.plannedKwh,
          plannedBill: forecast.plannedBill,
          achievable: forecast.achievable,
        },
        loads: forecast.loads.map((load) => ({
          id: load.id,
          name: load.name,
          category: load.category,
          dailyKwh: load.dailyKwh,
          hoursPerDay: load.hoursPerDay,
          recommendedDailyKwh: load.recommendedDailyKwh,
          recommendedHoursPerDay: load.recommendedHoursPerDay,
          essential: load.essential,
          confidence: load.confidence,
        })),
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Couldn’t reach VOLTRA to build the plan. Check that the backend is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Groq could not build the monthly plan. Please retry.",
    );
  }
  const plan = data as AiBillPlan;
  cacheAiBillPlan(source, billPlanFingerprint(source, settings, forecast), plan);
  return plan;
}

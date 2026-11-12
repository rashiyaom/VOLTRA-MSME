import { describe, expect, it } from "vitest";
import {
  buildBillForecast,
  defaultBillPlanSettings,
  inferCategory,
  manualApplianceToLoad,
  monitoredLoadsFromHistory,
  type HouseholdLoad,
  type ManualAppliance,
} from "./billPlan";

describe("bill plan", () => {
  it("recognizes known appliance labels without inventing unknown appliances", () => {
    expect(inferCategory("Bedroom AC")).toBe("air_conditioner");
    expect(inferCategory("Load 2 (CT sensor)")).toBe("other");
  });

  it("converts only an explicitly added appliance into estimated usage", () => {
    const appliance: ManualAppliance = {
      id: "manual-1",
      name: "Washing machine",
      category: "washing_machine",
      watts: 500,
      quantity: 1,
      hoursPerUse: 1,
      usesPerWeek: 3,
      essential: false,
    };
    const load = manualApplianceToLoad(appliance);
    expect(load.monitored).toBe(false);
    expect(load.confidence).toBe("estimated");
    expect(load.dailyKwh).toBeCloseTo(1.5 / 7);
  });

  it("uses covered measured days for monitored daily energy", () => {
    const day = new Date("2026-10-01T00:00:00").getTime() / 1000;
    const loads = monitoredLoadsFromHistory(
      Array.from({ length: 5 }, (_, index) => ({
        id: `hardware:c1:${day + index * 86400}`,
        source: "hardware" as const,
        circuitId: "c1",
        name: "Bedroom AC",
        start: day + index * 86400,
        seconds: 12 * 3600,
        activeSeconds: 2 * 3600,
        wh: 1000,
        peakW: 900,
        estimated: false,
      })),
      [{ id: "c1", name: "Circuit 1", equipment: "Bedroom AC" }],
    );
    expect(loads[0].confidence).toBe("measured");
    expect(loads[0].dailyKwh).toBeCloseTo(2);
    expect(loads[0].category).toBe("air_conditioner");
  });

  it("keeps an affordable home on track", () => {
    const settings = {
      ...defaultBillPlanSettings(new Date("2026-10-15")),
      target: 2500,
      fixedCharges: 100,
      taxPercent: 0,
      tariffRate: 8,
      cycleStart: "2026-10-01",
      cycleEnd: "2026-10-30",
    };
    const loads: HouseholdLoad[] = [
      {
        id: "c1",
        name: "Cooling",
        category: "air_conditioner",
        dailyKwh: 4,
        hoursPerDay: 4,
        monitored: true,
        confidence: "measured",
        coverageDays: 7,
        essential: false,
      },
    ];
    const forecast = buildBillForecast(settings, loads, new Date("2026-10-15"));
    expect(forecast.projectedBill).toBe(1060);
    expect(forecast.loads[0].status).toBe("on-track");
    expect(forecast.daysRemaining).toBe(15);
  });

  it("reduces flexible loads and reports when a target is not achievable", () => {
    const settings = {
      ...defaultBillPlanSettings(new Date("2026-10-15")),
      target: 500,
      fixedCharges: 100,
      taxPercent: 0,
      tariffRate: 10,
      cycleStart: "2026-10-01",
      cycleEnd: "2026-10-30",
    };
    const loads: HouseholdLoad[] = [
      {
        id: "fridge",
        name: "Fridge",
        category: "refrigerator",
        dailyKwh: 4,
        hoursPerDay: 24,
        monitored: false,
        confidence: "estimated",
        coverageDays: 0,
        essential: true,
      },
      {
        id: "ac",
        name: "AC",
        category: "air_conditioner",
        dailyKwh: 5,
        hoursPerDay: 5,
        monitored: true,
        confidence: "learning",
        coverageDays: 2,
        essential: false,
      },
    ];
    const forecast = buildBillForecast(settings, loads, new Date("2026-10-15"));
    expect(forecast.loads.find((load) => load.id === "ac")?.recommendedHoursPerDay).toBeLessThan(5);
    expect(forecast.achievable).toBe(false);
    expect(forecast.plannedBill).toBeGreaterThan(settings.target);
  });
});

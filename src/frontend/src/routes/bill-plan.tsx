import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AirVent,
  ArrowRight,
  BadgeIndianRupee,
  CalendarDays,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Fan,
  Gauge,
  Info,
  Lightbulb,
  Loader2,
  Plus,
  Refrigerator,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TriangleAlert,
  WashingMachine,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { circuitWatts, type UsageBucket, type UsageSource } from "@/lib/usagePatterns";
import { readUsagePreferences } from "@/services/usageHistory";
import { usageHistory } from "@/services/usageHistory";
import {
  buildBillForecast,
  categoryLabels,
  defaultBillPlanSettings,
  manualApplianceToLoad,
  monitoredLoadsFromHistory,
  readBillPlanSettings,
  saveBillPlanSettings,
  type ApplianceCategory,
  type BillPlanSettings,
  type LoadPlan,
  type ManualAppliance,
} from "@/lib/billPlan";
import { cn } from "@/lib/utils";
import {
  billPlanFingerprint,
  generateAiBillPlan,
  readCachedAiBillPlan,
  type AiBillPlan,
} from "@/services/billPlanAi";

export const Route = createFileRoute("/bill-plan")({
  head: () => ({
    meta: [
      { title: "Monthly bill planner · VOLTRA" },
      {
        name: "description",
        content:
          "Set a monthly electricity target and turn monitored household loads into a practical appliance plan.",
      },
    ],
  }),
  component: BillPlanPage,
});

const money = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const planDate = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", options).format(new Date(`${value}T12:00:00`));

const emptyManual = (): ManualAppliance => ({
  id: "",
  name: "",
  category: "other",
  watts: 500,
  quantity: 1,
  hoursPerUse: 1,
  usesPerWeek: 7,
  essential: false,
});

function BillPlanPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) {
    return (
      <div className="bill-page">
        <div className="bill-shell bill-loading" role="status">
          <div className="bill-loading-mark">
            <BadgeIndianRupee />
          </div>
          <p>Preparing your monthly plan…</p>
        </div>
      </div>
    );
  }
  return <BillPlanWorkspace />;
}

function BillPlanWorkspace() {
  const { operatingMode, liveReading, tariffRate } = useVoltricsStore();
  const source: UsageSource = operatingMode === "SIMULATED" ? "demo" : "hardware";
  const [settings, setSettings] = useState<BillPlanSettings>(() => readBillPlanSettings(source));
  const [rows, setRows] = useState<UsageBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupOpen, setSetupOpen] = useState(() => !settings.configured);
  const [applianceOpen, setApplianceOpen] = useState(false);
  const [draft, setDraft] = useState(settings);
  const [manualDraft, setManualDraft] = useState<ManualAppliance>(emptyManual);
  const [selectedLoad, setSelectedLoad] = useState<string | null>(null);
  const [aiPlan, setAiPlan] = useState<AiBillPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const planAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const modalOpen = setupOpen || applianceOpen;
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (applianceOpen) setApplianceOpen(false);
      else setSetupOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [setupOpen, applianceOpen]);

  useEffect(() => {
    let active = true;
    const next = readBillPlanSettings(source);
    if (!next.configured) next.tariffRate = tariffRate || next.tariffRate;
    setSettings(next);
    setDraft(next);
    setLoading(true);
    usageHistory
      .read(source)
      .then((history) => active && setRows(history))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    const refresh = () => {
      void usageHistory.read(source).then((history) => active && setRows(history));
    };
    window.addEventListener("voltra-usage-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("voltra-usage-change", refresh);
    };
  }, [source, tariffRate]);

  const preferences = readUsagePreferences(source);
  const monitored = useMemo(
    () =>
      monitoredLoadsFromHistory(
        rows,
        liveReading.circuits.map((circuit) => ({
          id: circuit.id,
          name: preferences.circuits[circuit.id]?.name || circuit.name,
          equipment: preferences.circuits[circuit.id]?.equipment,
          watts: circuitWatts(liveReading, circuit.id)?.watts,
        })),
      ),
    [rows, liveReading, preferences.circuits],
  );
  const manual = useMemo(
    () => settings.manualAppliances.map(manualApplianceToLoad),
    [settings.manualAppliances],
  );
  const allLoads = useMemo(() => [...monitored, ...manual], [monitored, manual]);
  const forecast = useMemo(() => buildBillForecast(settings, allLoads), [settings, allLoads]);
  const planFingerprint = useMemo(
    () => billPlanFingerprint(source, settings, forecast),
    [source, settings, forecast],
  );
  useEffect(() => {
    const cached = readCachedAiBillPlan(source, planFingerprint);
    setAiPlan(cached);
    setAiError("");
    if (cached?.days.length) {
      const today = new Date().toLocaleDateString("en-CA");
      setSelectedPlanDate(
        cached.days.some((day) => day.date === today) ? today : cached.days[0].date,
      );
    } else {
      setSelectedPlanDate("");
    }
  }, [source, planFingerprint]);

  useEffect(() => () => planAbort.current?.abort(), []);
  const projectedRatio = settings.target > 0 ? forecast.projectedBill / settings.target : 0;
  const plannedRatio = settings.target > 0 ? forecast.plannedBill / settings.target : 0;
  const averageConfidence = monitored.some((load) => load.confidence === "measured")
    ? "Measured history"
    : rows.length
      ? "Still learning"
      : "Starting estimate";
  const cycleStart = new Date(`${settings.cycleStart}T00:00:00`).getTime() / 1000;
  const cycleEnd = new Date(`${settings.cycleEnd}T23:59:59`).getTime() / 1000;
  const recordedKwh = rows
    .filter((row) => row.start >= cycleStart && row.start <= cycleEnd)
    .reduce((sum, row) => sum + row.wh / 1000, 0);
  const activePlanDay =
    aiPlan?.days.find((day) => day.date === selectedPlanDate) ?? aiPlan?.days[0];

  const persist = (next: BillPlanSettings, message?: string) => {
    saveBillPlanSettings(source, next);
    setSettings(next);
    setDraft(next);
    if (message) toast.success(message);
  };

  const buildWithGroq = async (nextSettings = settings, nextForecast = forecast) => {
    if (!nextForecast.loads.length) {
      setAiError("Add an appliance or connect circuit data before generating a plan.");
      return;
    }
    planAbort.current?.abort();
    const controller = new AbortController();
    planAbort.current = controller;
    setAiLoading(true);
    setAiError("");
    try {
      const plan = await generateAiBillPlan(source, nextSettings, nextForecast, controller.signal);
      setAiPlan(plan);
      const today = new Date().toLocaleDateString("en-CA");
      setSelectedPlanDate(
        plan.days.some((day) => day.date === today) ? today : plan.days[0]?.date || "",
      );
      toast.success("Your Groq monthly plan is ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "The plan could not be generated.";
      setAiError(message);
      toast.error(message);
    } finally {
      if (planAbort.current === controller) {
        planAbort.current = null;
        setAiLoading(false);
      }
    }
  };

  const saveGoal = () => {
    if (draft.target <= 0 || draft.tariffRate <= 0 || !draft.cycleStart || !draft.cycleEnd) {
      toast.error("Add a valid target, tariff, and billing period.");
      return;
    }
    if (draft.cycleEnd < draft.cycleStart) {
      toast.error("Billing cycle end must be after its start.");
      return;
    }
    const next = { ...draft, configured: true };
    persist(next, "Monthly bill settings saved");
    setSetupOpen(false);
    void buildWithGroq(next, buildBillForecast(next, allLoads));
  };

  const addAppliance = () => {
    if (!manualDraft.name.trim() || manualDraft.watts <= 0 || manualDraft.quantity <= 0) {
      toast.error("Add an appliance name, power, and quantity.");
      return;
    }
    const appliance = {
      ...manualDraft,
      id: `manual-${Date.now()}`,
      name: manualDraft.name.trim(),
    };
    persist(
      { ...settings, manualAppliances: [...settings.manualAppliances, appliance] },
      `${appliance.name} added to this plan`,
    );
    setManualDraft(emptyManual());
    setApplianceOpen(false);
  };

  const removeAppliance = (id: string) => {
    const appliance = settings.manualAppliances.find((item) => item.id === id);
    persist(
      {
        ...settings,
        manualAppliances: settings.manualAppliances.filter((item) => item.id !== id),
      },
      `${appliance?.name || "Appliance"} removed`,
    );
    setSelectedLoad(null);
  };

  return (
    <div className="bill-page">
      <div className="bill-orb bill-orb-one" aria-hidden="true" />
      <div className="bill-orb bill-orb-two" aria-hidden="true" />
      <main className="bill-shell">
        <header className="bill-hero">
          <div className="bill-hero-copy">
            <p className="bill-kicker">
              <span /> VOLTRA / BILL INTELLIGENCE
            </p>
            <h1>
              Give every rupee
              <br />
              <em>a job.</em>
            </h1>
            <p className="bill-intro">
              Set the bill you want. VOLTRA turns your detected circuits and declared appliances
              into a plan your household can actually follow.
            </p>
            <div className="bill-source-note">
              <ShieldCheck />
              <span>
                Planning with <strong>{monitored.length} detected</strong> and{" "}
                <strong>{manual.length} added</strong>{" "}
                {manual.length === 1 ? "appliance" : "appliances"}.
              </span>
            </div>
          </div>

          <div className="bill-goal-card">
            <div className="bill-goal-top">
              <span>MONTHLY TARGET</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(settings);
                  setSetupOpen(true);
                }}
              >
                Edit plan
              </button>
            </div>
            <div className="bill-ring-wrap">
              <BudgetRing value={Math.min(1.35, plannedRatio)} warning={plannedRatio > 1} />
              <div className="bill-ring-label">
                <small>PLAN LANDS AT</small>
                <strong>{money(forecast.plannedBill)}</strong>
                <span>of {money(settings.target)}</span>
              </div>
            </div>
            <div className={cn("bill-verdict", forecast.achievable ? "is-good" : "is-warning")}>
              {forecast.achievable ? <CheckCircle2 /> : <TriangleAlert />}
              <div>
                <strong>
                  {forecast.achievable ? "Target is workable" : "Target needs another decision"}
                </strong>
                <span>
                  {forecast.achievable
                    ? `${money(Math.max(0, settings.target - forecast.plannedBill))} breathing room after the plan.`
                    : `Known essential use still lands ${money(forecast.plannedBill - settings.target)} over target.`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {!settings.configured && (
          <button type="button" className="bill-start-banner" onClick={() => setSetupOpen(true)}>
            <span className="bill-start-icon">
              <Sparkles />
            </span>
            <span>
              <strong>Start with your bill target</strong>
              <small>It takes about a minute. You can revise it at any time.</small>
            </span>
            <ArrowRight />
          </button>
        )}

        <section className="bill-stat-grid" aria-label="Budget summary">
          <StatCard
            icon={<CircleGauge />}
            label="Without changes"
            value={money(forecast.projectedBill)}
            note={
              projectedRatio > 1 ? `${money(forecast.gap)} over target` : "Already within target"
            }
            tone={projectedRatio > 1 ? "coral" : "green"}
          />
          <StatCard
            icon={<CalendarDays />}
            label="Daily allowance"
            value={`${forecast.dailyEnergyAllowance.toFixed(1)} kWh`}
            note={`${forecast.billingDays}-day billing cycle`}
            tone="blue"
          />
          <StatCard
            icon={<Zap />}
            label="Recorded this cycle"
            value={`${recordedKwh.toFixed(1)} kWh`}
            note={averageConfidence}
            tone="lime"
          />
          <StatCard
            icon={<Clock3 />}
            label="Time remaining"
            value={`${forecast.daysRemaining} days`}
            note={`${forecast.daysElapsed} days into this cycle`}
            tone="violet"
          />
        </section>

        <section className="bill-trajectory-card">
          <div className="bill-section-heading">
            <div>
              <p className="bill-eyebrow">MONTH-END TRAJECTORY</p>
              <h2>Your target has a path.</h2>
              <p>The solid line is the plan. The dotted line shows where current habits lead.</p>
            </div>
            <div className="bill-chart-legend" aria-label="Chart legend">
              <span>
                <i className="plan" /> Planned
              </span>
              <span>
                <i className="current" /> Current pace
              </span>
              <span>
                <i className="target" /> Target
              </span>
            </div>
          </div>
          <TrajectoryChart
            days={forecast.billingDays}
            target={settings.target}
            projected={forecast.projectedBill}
            planned={forecast.plannedBill}
          />
          <div className="bill-chart-callout">
            <TrendingDown />
            <span>
              Following the plan removes{" "}
              <strong>{money(Math.max(0, forecast.projectedBill - forecast.plannedBill))}</strong>{" "}
              from the current projection.
            </span>
          </div>
        </section>

        <section className="bill-ai-plan" aria-labelledby="bill-ai-plan-title">
          <div className="bill-ai-head">
            <div className="bill-ai-mark" aria-hidden="true">
              <Sparkles />
            </div>
            <div>
              <p className="bill-eyebrow">GROQ MONTHLY PLANNER</p>
              <h2 id="bill-ai-plan-title">
                {aiPlan?.headline || "A calendar built around your actual loads."}
              </h2>
              <p>
                {aiPlan?.summary ||
                  "Generate a dated, appliance-level plan from your target, tariff, billing cycle, and VOLTRA usage evidence."}
              </p>
            </div>
            <button
              type="button"
              className="bill-ai-generate"
              disabled={aiLoading || !allLoads.length}
              onClick={() => void buildWithGroq()}
            >
              {aiLoading ? (
                <Loader2 className="animate-spin" />
              ) : aiPlan ? (
                <RefreshCw />
              ) : (
                <Sparkles />
              )}
              {aiLoading
                ? "Building every day…"
                : aiPlan
                  ? "Regenerate plan"
                  : "Generate with Groq"}
            </button>
          </div>

          {aiError && (
            <div className="bill-ai-error" role="alert">
              <TriangleAlert /> <span>{aiError}</span>
            </div>
          )}

          {aiLoading ? (
            <div className="bill-ai-building" role="status">
              <span className="bill-ai-loader">
                <Sparkles />
                <i />
              </span>
              <div>
                <strong>Groq is allocating {forecast.billingDays} days</strong>
                <p>
                  Balancing essential loads, flexible runtime, tariff, taxes, and the{" "}
                  {money(settings.target)} ceiling.
                </p>
              </div>
            </div>
          ) : aiPlan && activePlanDay ? (
            <>
              <div className="bill-ai-metrics">
                <span>
                  <small>Planned bill</small>
                  <strong>{money(aiPlan.expectedBillInr)}</strong>
                </span>
                <span>
                  <small>Energy envelope</small>
                  <strong>{aiPlan.expectedMonthlyKwh.toFixed(1)} kWh</strong>
                </span>
                <span>
                  <small>Projected saving</small>
                  <strong>{money(aiPlan.savingsInr)}</strong>
                </span>
                <span>
                  <small>Plan source</small>
                  <strong>{aiPlan.source === "demo" ? "Demo evidence" : "Live history"}</strong>
                </span>
              </div>

              <div className="bill-week-strip" aria-label="Weekly plan summary">
                {aiPlan.weeks.map((week) => (
                  <button
                    type="button"
                    key={week.week}
                    className={cn(
                      selectedPlanDate >= week.startDate &&
                        selectedPlanDate <= week.endDate &&
                        "active",
                    )}
                    onClick={() => setSelectedPlanDate(week.startDate)}
                  >
                    <span>WEEK {week.week}</span>
                    <strong>{week.budgetKwh.toFixed(1)} kWh</strong>
                    <small>
                      {planDate(week.startDate, { day: "numeric", month: "short" })}–
                      {planDate(week.endDate, { day: "numeric", month: "short" })}
                    </small>
                  </button>
                ))}
              </div>

              <div className="bill-calendar-strip" aria-label="Select a day in the billing plan">
                {aiPlan.days.map((day) => (
                  <button
                    type="button"
                    key={day.date}
                    className={cn(day.date === activePlanDay.date && "active")}
                    onClick={() => setSelectedPlanDate(day.date)}
                    aria-pressed={day.date === activePlanDay.date}
                  >
                    <span>{planDate(day.date, { weekday: "short" })}</span>
                    <strong>{planDate(day.date, { day: "2-digit" })}</strong>
                    <small>{day.budgetKwh.toFixed(1)} kWh</small>
                  </button>
                ))}
              </div>

              <article className="bill-day-card">
                <div className="bill-day-date">
                  <CalendarCheck2 />
                  <div>
                    <span>
                      {planDate(activePlanDay.date, {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </span>
                    <h3>{activePlanDay.focus}</h3>
                  </div>
                  <div className="bill-day-budget">
                    <small>DAY ENVELOPE</small>
                    <strong>{activePlanDay.budgetKwh.toFixed(2)} kWh</strong>
                    <span>≈ {money(activePlanDay.estimatedCostInr)}</span>
                  </div>
                </div>
                <div className="bill-day-grid">
                  <div className="bill-day-actions">
                    <p className="bill-eyebrow">TODAY'S CHECKLIST</p>
                    {activePlanDay.actions.map((action) => (
                      <div key={action}>
                        <Check />
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                  <div className="bill-day-targets">
                    <p className="bill-eyebrow">APPLIANCE WINDOWS</p>
                    {activePlanDay.loadTargets.length ? (
                      activePlanDay.loadTargets.map((target) => (
                        <div key={target.loadId}>
                          <span className="bill-target-icon">
                            {categoryIcon(target.category as ApplianceCategory)}
                          </span>
                          <span>
                            <strong>{target.name}</strong>
                            <small>{target.note}</small>
                          </span>
                          <span className="bill-target-time">
                            <b>{target.hours.toFixed(1)} h</b>
                            <small>{target.timeWindow}</small>
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="bill-no-targets">
                        <Info /> No special appliance window today; follow the checklist and daily
                        envelope.
                      </div>
                    )}
                  </div>
                </div>
              </article>

              <div className="bill-priority-row">
                {aiPlan.priorities.map((priority, index) => (
                  <span key={priority}>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                    {priority}
                  </span>
                ))}
              </div>
              <p className="bill-ai-footnote">
                Generated by {aiPlan.provider} · Cost remains an estimate; your utility meter and
                tariff bill are authoritative.
              </p>
            </>
          ) : (
            <div className="bill-ai-empty">
              <div>
                <CalendarCheck2 />
              </div>
              <strong>Ready for a real day-by-day plan</strong>
              <p>
                Each billing date gets a kWh envelope, concrete actions, and appliance windows
                grounded in the loads shown below.
              </p>
            </div>
          )}
        </section>

        <section className="bill-plan-section">
          <div className="bill-section-heading bill-plan-heading">
            <div>
              <p className="bill-eyebrow">YOUR HOUSEHOLD PLAN</p>
              <h2>Small instructions. Clear impact.</h2>
              <p>Recommendations appear only for detected circuits and appliances you add.</p>
            </div>
            <button
              type="button"
              className="bill-add-button"
              onClick={() => setApplianceOpen(true)}
            >
              <Plus /> Add appliance
            </button>
          </div>

          {loading ? (
            <div className="bill-load-state">
              <Loader2 className="animate-spin" /> Reading circuit history…
            </div>
          ) : allLoads.length ? (
            <div className="bill-load-list">
              {forecast.loads.map((load, index) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  index={index}
                  maxCost={Math.max(...forecast.loads.map((item) => item.monthlyCost), 1)}
                  expanded={selectedLoad === load.id}
                  onToggle={() => setSelectedLoad(selectedLoad === load.id ? null : load.id)}
                  onRemove={load.monitored ? undefined : () => removeAppliance(load.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bill-empty">
              <div>
                <Gauge />
              </div>
              <h3>No household loads yet</h3>
              <p>Connect your VOLTRA device or add an unmonitored appliance to begin the plan.</p>
              <button type="button" onClick={() => setApplianceOpen(true)}>
                <Plus /> Add appliance
              </button>
            </div>
          )}
        </section>

        <section className="bill-coverage">
          <div className="bill-coverage-icon">
            <Waves />
          </div>
          <div>
            <p className="bill-eyebrow">WHAT THIS PLAN KNOWS</p>
            <h2>
              {monitored.length} monitored circuits + {manual.length} household estimates
            </h2>
            <p>
              Unknown appliances are excluded until you add them. Missing monitoring time remains
              unknown, and the forecast becomes more reliable as VOLTRA records more complete days.
            </p>
          </div>
          <Link to="/patterns" className="bill-text-link">
            Review detected patterns <ChevronRight />
          </Link>
        </section>
      </main>

      {setupOpen && (
        <div
          className="bill-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSetupOpen(false)}
        >
          <section
            className="bill-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-goal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bill-drawer-head">
              <div>
                <span>01 / SET YOUR LIMIT</span>
                <h2 id="bill-goal-title">What should this month cost?</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setSetupOpen(false)}>
                <X />
              </button>
            </div>
            <div className="bill-target-input">
              <span>₹</span>
              <input
                type="number"
                min="1"
                inputMode="decimal"
                aria-label="Monthly bill target"
                value={draft.target}
                onChange={(event) => setDraft({ ...draft, target: Number(event.target.value) })}
              />
              <small>monthly maximum</small>
            </div>
            <div className="bill-quick-targets">
              {[1500, 2500, 4000, 6000].map((target) => (
                <button
                  type="button"
                  key={target}
                  className={draft.target === target ? "active" : ""}
                  onClick={() => setDraft({ ...draft, target })}
                >
                  {money(target)}
                </button>
              ))}
            </div>
            <div className="bill-form-grid">
              <label>
                <span>Cycle starts</span>
                <input
                  type="date"
                  value={draft.cycleStart}
                  onChange={(e) => setDraft({ ...draft, cycleStart: e.target.value })}
                />
              </label>
              <label>
                <span>Cycle ends</span>
                <input
                  type="date"
                  value={draft.cycleEnd}
                  onChange={(e) => setDraft({ ...draft, cycleEnd: e.target.value })}
                />
              </label>
              <label>
                <span>Tariff per kWh</span>
                <div className="bill-input-affix">
                  <b>₹</b>
                  <input
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={draft.tariffRate}
                    onChange={(e) => setDraft({ ...draft, tariffRate: Number(e.target.value) })}
                  />
                </div>
              </label>
              <label>
                <span>Fixed charges</span>
                <div className="bill-input-affix">
                  <b>₹</b>
                  <input
                    type="number"
                    min="0"
                    value={draft.fixedCharges}
                    onChange={(e) => setDraft({ ...draft, fixedCharges: Number(e.target.value) })}
                  />
                </div>
              </label>
              <label>
                <span>Taxes and duty</span>
                <div className="bill-input-affix">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draft.taxPercent}
                    onChange={(e) => setDraft({ ...draft, taxPercent: Number(e.target.value) })}
                  />
                  <b>%</b>
                </div>
              </label>
            </div>
            <div className="bill-form-note">
              <Info /> Use the rate on your latest utility bill. Slab tariffs can be represented
              with their effective average rate.
            </div>
            <button type="button" className="bill-primary-button" onClick={saveGoal}>
              Build my plan <ArrowRight />
            </button>
          </section>
        </div>
      )}

      {applianceOpen && (
        <div
          className="bill-modal-backdrop"
          role="presentation"
          onMouseDown={() => setApplianceOpen(false)}
        >
          <section
            className="bill-drawer bill-appliance-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-appliance-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="bill-drawer-head">
              <div>
                <span>ADD ONLY WHAT VOLTRA CANNOT SEE</span>
                <h2 id="bill-appliance-title">Add an unmonitored appliance</h2>
              </div>
              <button type="button" aria-label="Close" onClick={() => setApplianceOpen(false)}>
                <X />
              </button>
            </div>
            <div className="bill-form-grid bill-appliance-form">
              <label className="wide">
                <span>Appliance name</span>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. Bedroom air conditioner"
                  value={manualDraft.name}
                  onChange={(e) => setManualDraft({ ...manualDraft, name: e.target.value })}
                />
              </label>
              <label className="wide">
                <span>Appliance type</span>
                <select
                  value={manualDraft.category}
                  onChange={(e) =>
                    setManualDraft({
                      ...manualDraft,
                      category: e.target.value as ApplianceCategory,
                    })
                  }
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Rated power</span>
                <div className="bill-input-affix">
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={manualDraft.watts}
                    onChange={(e) =>
                      setManualDraft({ ...manualDraft, watts: Number(e.target.value) })
                    }
                  />
                  <b>W</b>
                </div>
              </label>
              <label>
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={manualDraft.quantity}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>Hours each use</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  inputMode="decimal"
                  value={manualDraft.hoursPerUse}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, hoursPerUse: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>Uses per week</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  inputMode="decimal"
                  value={manualDraft.usesPerWeek}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, usesPerWeek: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="bill-check-row">
              <input
                type="checkbox"
                checked={manualDraft.essential}
                onChange={(e) => setManualDraft({ ...manualDraft, essential: e.target.checked })}
              />
              <span>
                <strong>Treat as essential</strong>
                <small>The planner will preserve at least 95% of its expected use.</small>
              </span>
              <Check />
            </label>
            <div className="bill-form-note">
              <Info /> This estimate is used only after you save it. You can remove it from the plan
              at any time.
            </div>
            <button type="button" className="bill-primary-button" onClick={addAppliance}>
              Add to household plan <Plus />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function BudgetRing({ value, warning }: { value: number; warning: boolean }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const dash = Math.min(1, value) * circumference;
  return (
    <svg
      className="bill-ring"
      viewBox="0 0 184 184"
      role="img"
      aria-label={`${Math.round(value * 100)} percent of target`}
    >
      <circle className="bill-ring-track" cx="92" cy="92" r={radius} />
      <circle
        className={cn("bill-ring-progress", warning && "warning")}
        cx="92"
        cy="92"
        r={radius}
        strokeDasharray={`${dash} ${circumference}`}
      />
      <circle className="bill-ring-dot" cx="92" cy="14" r="4" />
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`bill-stat bill-stat-${tone}`}>
      <div className="bill-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function TrajectoryChart({
  days,
  target,
  projected,
  planned,
}: {
  days: number;
  target: number;
  projected: number;
  planned: number;
}) {
  const width = 900;
  const height = 270;
  const padX = 34;
  const padY = 22;
  const maximum = Math.max(target, projected, planned, 1) * 1.12;
  const y = (value: number) => height - padY - (value / maximum) * (height - padY * 2);
  const points = (end: number) =>
    Array.from({ length: 13 }, (_, index) => {
      const fraction = index / 12;
      const curve = fraction < 0.15 ? fraction * 0.86 : fraction * (0.92 + fraction * 0.08);
      return `${padX + fraction * (width - padX * 2)},${y(end * curve)}`;
    }).join(" ");
  return (
    <div className="bill-chart-scroll">
      <svg
        className="bill-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Projected and planned monthly bill trajectory"
      >
        <defs>
          <linearGradient id="billArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c7ef37" stopOpacity=".24" />
            <stop offset="100%" stopColor="#c7ef37" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padX}
            x2={width - padX}
            y1={y(maximum * fraction)}
            y2={y(maximum * fraction)}
            className="bill-grid-line"
          />
        ))}
        <line
          x1={padX}
          x2={width - padX}
          y1={y(target)}
          y2={y(target)}
          className="bill-target-line"
        />
        <polyline points={points(projected)} className="bill-current-line" />
        <polygon
          points={`${padX},${height - padY} ${points(planned)} ${width - padX},${height - padY}`}
          fill="url(#billArea)"
        />
        <polyline points={points(planned)} className="bill-plan-line" />
        <circle cx={width - padX} cy={y(planned)} r="6" className="bill-end-dot" />
        <text x={padX} y={height - 2} className="bill-axis-text">
          DAY 1
        </text>
        <text x={width / 2} y={height - 2} textAnchor="middle" className="bill-axis-text">
          DAY {Math.ceil(days / 2)}
        </text>
        <text x={width - padX} y={height - 2} textAnchor="end" className="bill-axis-text">
          DAY {days}
        </text>
        <text
          x={width - padX - 8}
          y={Math.max(14, y(target) - 8)}
          textAnchor="end"
          className="bill-target-text"
        >
          {money(target)} TARGET
        </text>
      </svg>
    </div>
  );
}

function categoryIcon(category: ApplianceCategory) {
  switch (category) {
    case "air_conditioner":
      return <AirVent />;
    case "washing_machine":
      return <WashingMachine />;
    case "refrigerator":
      return <Refrigerator />;
    case "fan":
      return <Fan />;
    case "lighting":
      return <Lightbulb />;
    default:
      return <Zap />;
  }
}

function LoadRow({
  load,
  index,
  maxCost,
  expanded,
  onToggle,
  onRemove,
}: {
  load: LoadPlan;
  index: number;
  maxCost: number;
  expanded: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const impact = Math.max(4, (load.monthlyCost / maxCost) * 100);
  return (
    <article
      className={cn("bill-load-row", expanded && "expanded")}
      style={{ "--bill-index": index } as CSSProperties}
    >
      <button type="button" className="bill-load-main" onClick={onToggle} aria-expanded={expanded}>
        <span className="bill-load-icon">{categoryIcon(load.category)}</span>
        <span className="bill-load-name">
          <strong>{load.name}</strong>
          <small>
            {load.monitored ? "Detected circuit" : "Added estimate"} ·{" "}
            {categoryLabels[load.category]}
          </small>
        </span>
        <span className="bill-load-impact">
          <i>
            <b style={{ width: `${impact}%` }} />
          </i>
          <small>{money(load.monthlyCost)}/cycle</small>
        </span>
        <span className={cn("bill-load-status", `is-${load.status}`)}>
          {load.status === "on-track" ? (
            <Check />
          ) : load.status === "adjust" ? (
            <TrendingDown />
          ) : (
            <Info />
          )}
          {load.status === "on-track"
            ? "On track"
            : load.status === "adjust"
              ? "Adjust"
              : "Protected"}
        </span>
        <ChevronRight className="bill-load-chevron" />
      </button>
      {expanded && (
        <div className="bill-load-detail">
          <div className="bill-instruction">
            <CheckCircle2 />
            <p>
              <span>Recommended action</span>
              <strong>{load.instruction}</strong>
            </p>
          </div>
          <div className="bill-load-numbers">
            <span>
              <small>Current estimate</small>
              <b>{load.dailyKwh.toFixed(2)} kWh/day</b>
            </span>
            <span>
              <small>Planned use</small>
              <b>{load.recommendedDailyKwh.toFixed(2)} kWh/day</b>
            </span>
            <span>
              <small>Plan confidence</small>
              <b>
                {load.confidence === "measured"
                  ? `${load.coverageDays} measured days`
                  : load.confidence === "learning"
                    ? "Still learning"
                    : "User estimate"}
              </b>
            </span>
          </div>
          {onRemove && (
            <button type="button" className="bill-remove" onClick={onRemove}>
              <Trash2 /> Remove this estimate
            </button>
          )}
        </div>
      )}
    </article>
  );
}

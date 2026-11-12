import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Database,
  Fingerprint,
  Info,
  Leaf,
  Radio,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { UsageAssistant } from "@/components/UsageAssistant";
import { AdaptiveAnomalyPanel } from "@/components/AdaptiveAnomalyPanel";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import {
  analyzeCircuit,
  circuitDefaults,
  dayKey,
  defaultPreferences,
  exampleHistory,
  type CircuitPreference,
  type UsageBucket,
  type UsagePreferences,
  type UsageSource,
} from "@/lib/usagePatterns";
import { readUsagePreferences, saveUsagePreferences, usageHistory } from "@/services/usageHistory";
import { useAdaptiveAnomaly } from "@/services/adaptiveAnomaly";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patterns")({
  head: () => ({
    meta: [
      { title: "Usage patterns · VOLTRA" },
      {
        name: "description",
        content:
          "Understand your daily energy routine, learn from circuit activity, and ask your usage assistant for evidence-based suggestions.",
      },
    ],
  }),
  component: PatternsPage,
});
const hours = (seconds: number) => `${(seconds / 3600).toFixed(1)} h`;
const dateLabel = (key: string) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

function PatternsPage() {
  // Device state and local-time history differ from the server's initial snapshot.
  // Mount the workspace after hydration rather than rendering invented server data.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready)
    return (
      <div className="patterns-page">
        <div
          className="patterns-wrap patterns-skeleton"
          role="status"
          aria-label="Loading usage patterns"
        >
          <p className="patterns-overline">VOLTRA / USAGE INTELLIGENCE</p>
          <div />
          <div />
          <span>Loading your usage workspace…</span>
        </div>
      </div>
    );
  return <PatternsWorkspace />;
}

function PatternsWorkspace() {
  const { operatingMode, liveReading, connectionState } = useVoltricsStore();
  const source: UsageSource = operatingMode === "SIMULATED" ? "demo" : "hardware";
  const adaptiveModel = useAdaptiveAnomaly(source);
  const [rows, setRows] = useState<UsageBucket[]>([]),
    [preferences, setPreferences] = useState<UsagePreferences>(defaultPreferences);
  const [example, setExample] = useState(false),
    [selected, setSelected] = useState("");
  const [date, setDate] = useState(() => dayKey(Date.now() / 1000)),
    [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [setup, setSetup] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [sampleRows] = useState(() => exampleHistory());
  useEffect(() => {
    let active = true;
    setLoading(true);
    setExample(false);
    setRows([]);
    setPreferences(readUsagePreferences(source));
    const refresh = async () => {
      try {
        const records = await usageHistory.read(source);
        if (active) {
          setRows(records);
          setPreferences(readUsagePreferences(source));
          setError(usageHistory.error || "");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "History unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("voltra-usage-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("voltra-usage-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [source]);
  const history = example ? sampleRows : rows;
  const circuits = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of history) map.set(row.circuitId, row.name);
    if (!example) for (const c of liveReading.circuits) map.set(c.id, c.name);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [history, liveReading.circuits, example]);
  const circuitId = circuits.some((c) => c.id === selected) ? selected : circuits[0]?.id || "";
  const originalName = circuits.find((c) => c.id === circuitId)?.name || "Your circuit";
  const rule = example
    ? { ...circuitDefaults(originalName), schedule: true, runtimeHours: 4 }
    : preferences.circuits[circuitId] || circuitDefaults(originalName);
  const circuitRows = useMemo(
    () => history.filter((row) => row.circuitId === circuitId),
    [history, circuitId],
  );
  const analysis = useMemo(() => analyzeCircuit(circuitRows, rule), [circuitRows, rule]);
  const dayRows = useMemo(
    () => circuitRows.filter((row) => dayKey(row.start) === date),
    [circuitRows, date],
  );
  const selectedDay = analysis.history.find((day) => day.day === date);
  const hourRows = useMemo(
    () =>
      Array.from({ length: 24 }, (_, hour) => {
        const entries = dayRows.filter((row) => new Date(row.start * 1000).getHours() === hour);
        const seconds = entries.reduce((s, r) => s + r.seconds, 0),
          wh = entries.reduce((s, r) => s + r.wh, 0);
        return {
          hour,
          seconds,
          wh,
          active: entries.reduce((s, r) => s + r.activeSeconds, 0),
          watts: seconds ? (wh * 3600) / seconds : null,
        };
      }),
    [dayRows],
  );
  const maxWatts = Math.max(1, ...hourRows.map((h) => h.watts || 0));
  const heatDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 6 + i);
        return dayKey(d.getTime() / 1000);
      }),
    [],
  );
  const heat = useMemo(() => {
    const map = new Map<string, { seconds: number; active: number }>();
    for (const row of circuitRows) {
      const key = `${dayKey(row.start)}:${new Date(row.start * 1000).getHours()}`,
        value = map.get(key) || { seconds: 0, active: 0 };
      value.seconds += row.seconds;
      value.active += row.activeSeconds;
      map.set(key, value);
    }
    return map;
  }, [circuitRows]);
  const now = dayKey(Date.now() / 1000);
  const sourceLabel = example
    ? "Illustrative example"
    : source === "demo"
      ? "Simulated readings"
      : "Hardware readings";
  const context = {
    source: example ? "example" : source,
    asOf: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    circuit: rule.name,
    goal: preferences.goal,
    configuredRule: rule,
    learning: {
      stage: analysis.stage,
      eligibleDays: analysis.validDays,
      comparableDays: analysis.comparableDays,
      minimumRecordedHoursPerEligibleDay: 12,
      minimumComparableDays: 5,
    },
    selectedDay: selectedDay || { day: date, seconds: 0, activeSeconds: 0, wh: 0 },
    recentDays: analysis.history.slice(-14),
    insights: analysis.insights.map((item) => ({
      ...item,
      feedback: preferences.feedback[`${circuitId}:${item.id}`] || null,
    })),
    powerEstimated: circuitRows.some((r) => r.estimated),
    adaptiveModel: example
      ? null
      : {
          stage: adaptiveModel.stage,
          totalValidReadings: adaptiveModel.totalSamples,
          circuits: adaptiveModel.circuits.map((item) => ({
            id: item.id,
            name: preferences.circuits[item.id]?.name || item.name,
            stage: item.stage,
            currentWatts: Math.round(item.currentWatts),
            typicalActiveWatts:
              item.typicalActiveWatts === null ? null : Math.round(item.typicalActiveWatts),
            typicalRuntimeMinutes:
              item.typicalRuntimeSeconds === null
                ? null
                : Math.round(item.typicalRuntimeSeconds / 60),
            status: item.status,
          })),
          recentObservations: adaptiveModel.events.slice(0, 5).map((event) => ({
            kind: event.kind,
            circuit: preferences.circuits[event.circuitId]?.name || event.circuitName,
            title: event.title,
            detail: event.detail,
            timestamp: new Date(event.timestamp * 1000).toISOString(),
            feedback: event.feedback || null,
          })),
          safeguards: [
            "The adaptive model is observational and cannot actuate breakers.",
            "An anomaly is a sustained statistical deviation, not a fault diagnosis.",
            "Telemetry gaps over 30 seconds break runtime continuity.",
          ],
        },
    limitations: [
      "Only records while this app is open and receiving telemetry.",
      "Missing intervals are unknown; daily totals are partial.",
      "Circuit identity comes from user labels, not appliance disaggregation.",
    ],
  };
  const save = (next: UsagePreferences) => {
    try {
      saveUsagePreferences(source, next);
      setPreferences(next);
      setNotice("Preferences saved. Rules apply to future readings.");
      return true;
    } catch {
      setError("Preferences could not be saved. Check browser storage permissions.");
      return false;
    }
  };
  const mark = (id: string, value: "expected" | "investigate") =>
    save({ ...preferences, feedback: { ...preferences.feedback, [`${circuitId}:${id}`]: value } });
  const exportSummary = () => {
    const blob = new Blob([JSON.stringify(context, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `voltra-usage-${example ? "example" : source}-${date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Usage summary downloaded.");
  };
  return (
    <div className="patterns-page">
      <div className="patterns-wrap">
        <header className="patterns-header">
          <div>
            <p className="patterns-overline">
              <span /> VOLTRA / USAGE INTELLIGENCE
            </p>
            <h1>Every day has a pattern.</h1>
            <p>Understand your energy routine. Find the moments that matter.</p>
          </div>
          <div className="patterns-header-actions">
            <button
              className="patterns-button secondary"
              onClick={() => {
                setExample(!example);
                setSelected("");
                setSelectedHour(null);
              }}
            >
              {example ? <X size={15} /> : <Activity size={15} />}{" "}
              {example ? "Back to my data" : "Explore an example"}
            </button>
            <button
              className="patterns-button"
              disabled={!circuitId || example}
              onClick={() => setSetup(true)}
            >
              <SlidersHorizontal size={15} />
              Personalize
            </button>
          </div>
        </header>
        <div className={cn("patterns-source", example && "example")}>
          <Radio size={15} />
          <strong>{sourceLabel}</strong>
          <span>
            {example
              ? "A fictional 14-day workspace. This never enters your recorded history."
              : source === "demo"
                ? "Demo history stays separate from hardware learning."
                : connectionState.startsWith("CONNECTED_")
                  ? "Recording while the app receives device telemetry."
                  : "Connect a device to start collecting your real usage."}
          </span>
          {source === "hardware" && !connectionState.startsWith("CONNECTED_") && !example && (
            <Link to="/settings">
              Connect device <ArrowRight size={14} />
            </Link>
          )}
        </div>
        {error && (
          <p className="patterns-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="patterns-notice" role="status">
            <Check size={14} />
            {notice}
            <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
              <X size={14} />
            </button>
          </p>
        )}
        <div className="patterns-grid">
          <div className="patterns-main">
            <section className="patterns-learning">
              <div className="learning-top">
                <div className="learning-icon">
                  <Fingerprint size={28} />
                </div>
                <span className="patterns-tag">
                  {example ? "EXAMPLE PREVIEW" : analysis.stage.toUpperCase()}
                </span>
                <span className="learning-counter">
                  {Math.min(analysis.comparableDays, 5)}
                  <small> / 5 days</small>
                </span>
              </div>
              <h2>
                {analysis.comparableDays >= 5
                  ? "Your routine is coming into focus."
                  : "Good insights begin with a little context."}
              </h2>
              <p>
                {analysis.comparableDays >= 5
                  ? "Comparable days now support runtime comparisons. Each observation includes its evidence, so you can decide what matters."
                  : "Start with your own schedule. We’ll turn recorded activity into useful observations as the evidence grows."}
              </p>
              <div className="learning-track">
                {[
                  { label: "Your preferences", done: !!preferences.circuits[circuitId] || example },
                  { label: "Recorded activity", done: circuitRows.length > 0 },
                  { label: "Early observations", done: analysis.history.length >= 3 },
                  { label: "Learned comparisons", done: analysis.comparableDays >= 5 },
                ].map((step, i) => (
                  <div key={step.label} className={cn(step.done && "done")}>
                    <span>{step.done ? <Check size={12} /> : i + 1}</span>
                    <p>{step.label}</p>
                  </div>
                ))}
              </div>
              <div className="learning-bottom">
                <span>
                  <Info size={13} /> {analysis.weekdayDays} weekdays · {analysis.weekendDays}{" "}
                  weekend days with ≥12h coverage
                </span>
                {!preferences.circuits[circuitId] && !example && (
                  <button disabled={!circuitId} onClick={() => setSetup(true)}>
                    Set my preferences <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </section>
            {!example && (
              <AdaptiveAnomalyPanel
                source={source}
                labels={Object.fromEntries(
                  circuits.map((circuit) => [
                    circuit.id,
                    preferences.circuits[circuit.id]?.name || circuit.name,
                  ]),
                )}
              />
            )}
            <div className="patterns-toolbar">
              <div>
                <label htmlFor="pattern-circuit">Monitored circuit</label>
                <select
                  id="pattern-circuit"
                  value={circuitId}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setSelectedHour(null);
                  }}
                >
                  {circuits.length === 0 && <option value="">Waiting for circuit data</option>}
                  {circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {!example ? preferences.circuits[c.id]?.name || c.name : c.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="patterns-date">
                <Clock3 size={15} />
                <input
                  aria-label="Activity date"
                  type="date"
                  value={date}
                  max={now}
                  onChange={(e) => {
                    if (e.target.value) setDate(e.target.value);
                    setSelectedHour(null);
                  }}
                />
              </label>
            </div>
            <div className="patterns-metrics">
              {[
                {
                  label: "Active time",
                  value: selectedDay ? hours(selectedDay.activeSeconds) : "—",
                  unit: `Active above ${rule.thresholdW} W`,
                  icon: Clock3,
                },
                {
                  label: "Observed energy",
                  value: selectedDay ? `${(selectedDay.wh / 1000).toFixed(2)} kWh` : "—",
                  unit: !circuitRows.length
                    ? "Awaiting circuit readings"
                    : circuitRows.some((r) => r.estimated)
                      ? "Estimated circuit power"
                      : "From circuit power readings",
                  icon: Zap,
                },
                {
                  label: "Recorded coverage",
                  value: selectedDay ? hours(selectedDay.seconds) : "—",
                  unit: `${date === now ? "Today" : dateLabel(date)} · gaps excluded`,
                  icon: Database,
                },
              ].map((item) => (
                <div key={item.label}>
                  <span>
                    {item.label}
                    <item.icon size={15} />
                  </span>
                  <strong>{item.value}</strong>
                  <p>{item.unit}</p>
                </div>
              ))}
            </div>
            <section className="patterns-card">
              <div className="patterns-section-head">
                <div>
                  <p className="patterns-overline">THE SHAPE OF YOUR DAY</p>
                  <h2>Activity, hour by hour.</h2>
                </div>
                <span className="patterns-tag">{date === now ? "TODAY" : dateLabel(date)}</span>
              </div>
              {loading && !example ? (
                <div className="patterns-empty">
                  <div className="patterns-loading" />
                  <p>Loading your recorded history…</p>
                </div>
              ) : dayRows.length === 0 ? (
                <div className="patterns-empty">
                  <div className="empty-signal">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <h3>Your first readings belong here.</h3>
                  <p>
                    {date === now
                      ? "Keep VOLTRA open with a data source running. Activity will appear after readings are saved, usually within 15 seconds."
                      : "No readings were recorded on this day. Choose another date to explore."}
                  </p>
                  {!example && (
                    <button className="patterns-text-button" onClick={() => setExample(true)}>
                      See how a recorded day looks <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="patterns-chart" aria-label="Average power per recorded hour">
                    {hourRows.map((h) => (
                      <button
                        key={h.hour}
                        type="button"
                        aria-label={`${h.hour}:00, ${h.watts === null ? "no data" : `${Math.round(h.watts)} watts average, ${Math.round(h.seconds / 60)} minutes recorded`}`}
                        className={cn(
                          h.watts === null && "missing",
                          selectedHour === h.hour && "selected",
                        )}
                        onClick={() => setSelectedHour(h.hour)}
                        style={
                          {
                            "--bar-height": `${h.watts === null ? 0 : Math.max(3, (h.watts / maxWatts) * 100)}%`,
                          } as CSSProperties
                        }
                      >
                        <span />
                        <small>
                          {h.hour % 4 === 0 ? `${String(h.hour).padStart(2, "0")}:00` : ""}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="patterns-chart-note">
                    <span>
                      <i /> Average power during recorded intervals
                    </span>
                    <span>Dashed = no data</span>
                  </div>
                  {selectedHour !== null && (
                    <p className="patterns-hour-detail" role="status">
                      <strong>
                        {String(selectedHour).padStart(2, "0")}:00 –{" "}
                        {String(selectedHour + 1).padStart(2, "0")}:00
                      </strong>
                      {hourRows[selectedHour].watts === null
                        ? "No readings. This interval is unknown."
                        : `${Math.round(hourRows[selectedHour].watts!)} W average · ${Math.round(hourRows[selectedHour].active / 60)} active minutes · ${Math.round(hourRows[selectedHour].seconds / 60)} minutes recorded`}
                    </p>
                  )}
                </>
              )}
            </section>
            <section className="patterns-card">
              <div className="patterns-section-head">
                <div>
                  <p className="patterns-overline">ZOOM OUT A LITTLE</p>
                  <h2>A week at a glance.</h2>
                </div>
                <span className="patterns-tag">7 DAYS</span>
              </div>
              <p className="patterns-subtext">
                Activity within each recorded hour. Select a cell to inspect that day.
              </p>
              <div className="patterns-heat-scroll">
                <div className="patterns-heat">
                  <div className="heat-axis">
                    <span />
                    {Array.from({ length: 24 }, (_, i) => (
                      <span key={i}>{i % 6 === 0 ? `${String(i).padStart(2, "0")}:00` : ""}</span>
                    ))}
                  </div>
                  {heatDays.map((day) => (
                    <div className="heat-row" key={day}>
                      <span>
                        {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: "short",
                        })}
                      </span>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const cell = heat.get(`${day}:${hour}`);
                        return (
                          <button
                            key={hour}
                            aria-label={`${dateLabel(day)} ${hour}:00: ${cell ? `${Math.round(cell.active / 60)} active minutes of ${Math.round(cell.seconds / 60)} recorded` : "no data"}`}
                            title={`${dateLabel(day)} ${hour}:00 · ${cell ? `${Math.round(cell.active / 60)} min active / ${Math.round(cell.seconds / 60)} min recorded` : "No data"}`}
                            className={cn(
                              cell
                                ? cell.active / cell.seconds > 0.6
                                  ? "high"
                                  : cell.active > 0
                                    ? "medium"
                                    : "low"
                                : "unknown",
                              date === day && selectedHour === hour && "selected",
                            )}
                            onClick={() => {
                              setDate(day);
                              setSelectedHour(hour);
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="heat-legend">
                <span>
                  <i className="unknown" />
                  No data
                </span>
                <span>
                  <i className="low" />
                  Recorded idle
                </span>
                <span>
                  <i className="high" />
                  Mostly active
                </span>
              </div>
            </section>
            <section className="patterns-card patterns-insights">
              <div className="patterns-section-head">
                <div>
                  <p className="patterns-overline">EVIDENCE BEFORE ASSUMPTIONS</p>
                  <h2>Today’s observations.</h2>
                </div>
                <Leaf size={20} />
              </div>
              {analysis.insights.length ? (
                analysis.insights.map((insight) => (
                  <article key={insight.id}>
                    <span className="patterns-tag">
                      {insight.kind === "rule" ? "YOUR RULE" : "LEARNED COMPARISON"}
                    </span>
                    <h3>{insight.title}</h3>
                    <p>{insight.detail}</p>
                    {!example && (
                      <div className="insight-actions">
                        <button
                          aria-pressed={
                            preferences.feedback[`${circuitId}:${insight.id}`] === "expected"
                          }
                          onClick={() => mark(insight.id, "expected")}
                        >
                          <Check size={13} /> Expected
                        </button>
                        <button
                          aria-pressed={
                            preferences.feedback[`${circuitId}:${insight.id}`] === "investigate"
                          }
                          onClick={() => mark(insight.id, "investigate")}
                        >
                          Review later <ArrowRight size={13} />
                        </button>
                      </div>
                    )}
                    {preferences.feedback[`${circuitId}:${insight.id}`] && !example && (
                      <small>
                        Marked{" "}
                        {preferences.feedback[`${circuitId}:${insight.id}`] === "expected"
                          ? "as expected"
                          : "for review"}
                        . This feedback is saved with the observation.
                      </small>
                    )}
                  </article>
                ))
              ) : (
                <div className="patterns-no-insights">
                  <ShieldCheck size={26} />
                  <div>
                    <h3>
                      {circuitRows.length
                        ? "Nothing to flag from the available data."
                        : "A fresh start, without the guesswork."}
                    </h3>
                    <p>
                      {analysis.comparableDays < 5
                        ? "Schedule checks work as soon as you configure them. Learned comparisons need five comparable days with at least 12 recorded hours each."
                        : "No runtime or schedule rule has been exceeded in the recorded activity today. Gaps in coverage are still unknown."}
                    </p>
                  </div>
                </div>
              )}
              <div className="patterns-rule-summary">
                <Settings2 size={15} />
                <span>
                  {rule.schedule
                    ? `Your schedule: ${String(rule.startHour).padStart(2, "0")}:00–${String(rule.endHour).padStart(2, "0")}:00 · ${rule.days.length} days/week`
                    : "No configured schedule"}{" "}
                  ·{" "}
                  {rule.runtimeHours > 0
                    ? `${rule.runtimeHours}h daily reminder`
                    : "Runtime reminder off"}
                </span>
                <button disabled={example || !circuitId} onClick={() => setSetup(true)}>
                  Edit
                </button>
              </div>
            </section>
            <details className="patterns-data">
              <summary>
                <Database size={16} />
                Your data, your call.
                <ChevronRight size={16} />
              </summary>
              <div>
                <p>
                  History stays in this browser and records only while VOLTRA is open and receiving
                  telemetry. Clearing site data removes it. Keep this workspace associated with one
                  physical panel; clear its history before reusing it for a different installation.
                </p>
                <div className="patterns-data-controls">
                  <label>
                    Keep history for{" "}
                    <select
                      value={preferences.retentionDays}
                      disabled={example}
                      onChange={(e) =>
                        save({ ...preferences, retentionDays: Number(e.target.value) })
                      }
                    >
                      <option value={7}>7 days</option>
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                    </select>
                  </label>
                  <button className="patterns-button secondary" onClick={exportSummary}>
                    <ArrowDownToLine size={14} />
                    Export summary
                  </button>
                  <button
                    className="patterns-delete"
                    disabled={example}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={14} />
                    Delete {source} history
                  </button>
                </div>
                <p className="patterns-subtext">
                  Changing retention hides older data immediately and prunes it on the next write.
                  Activity detection uses your threshold at recording time. Rules are in-page
                  observations, not background push notifications.
                </p>
              </div>
            </details>
          </div>
          <UsageAssistant
            key={`${example ? "example" : source}:${circuitId}`}
            context={context}
            sourceLabel={sourceLabel}
          />
        </div>
        <footer className="patterns-footer">
          <Fingerprint size={15} />
          <span>PERSONALIZED BY EVIDENCE. ALWAYS IN YOUR CONTROL.</span>
          <Link to="/guide">
            Read the field guide <ArrowRight size={14} />
          </Link>
        </footer>
      </div>
      <SetupDialog
        key={`${source}:${circuitId}:${setup}`}
        open={setup}
        onOpenChange={setSetup}
        initial={rule}
        goal={preferences.goal}
        onSave={(next, goal) => {
          if (
            save({
              ...preferences,
              configured: true,
              goal,
              circuits: { ...preferences.circuits, [circuitId]: next },
            })
          )
            setSetup(false);
        }}
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="patterns-dialog">
          <DialogHeader>
            <DialogTitle>Delete {source} usage history?</DialogTitle>
            <DialogDescription>
              This removes recorded usage patterns for all circuits in this data source. Your
              connection settings, breaker audit logs, and the other data source are kept. New
              readings will start a fresh history.
            </DialogDescription>
          </DialogHeader>
          <div className="patterns-dialog-actions">
            <button
              className="patterns-button secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Keep history
            </button>
            <button
              className="patterns-button"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await usageHistory.clear(source);
                  save({ ...preferences, feedback: {} });
                  setRows([]);
                  setDeleteOpen(false);
                  setNotice("Usage history deleted. New readings will start a fresh record.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unable to delete history");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete history"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetupDialog({
  open,
  onOpenChange,
  initial,
  goal: initialGoal,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CircuitPreference;
  goal: string;
  onSave: (rule: CircuitPreference, goal: string) => void;
}) {
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState(initial),
    [goal, setGoal] = useState(initialGoal);
  const update = (value: Partial<CircuitPreference>) =>
    setDraft((current) => ({ ...current, ...value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="patterns-dialog">
        <DialogHeader>
          <p className="patterns-overline">A LITTLE CONTEXT GOES A LONG WAY</p>
          <DialogTitle>Make this your workspace.</DialogTitle>
          <DialogDescription>
            These are your preferences, not a learned routine. You can change them anytime.
          </DialogDescription>
        </DialogHeader>
        <div className="setup-progress">
          {["Name it", "Set a rhythm", "Choose reminders"].map((label, i) => (
            <span key={label} className={cn(i <= step && "active")}>
              <b>{i < step ? <Check size={12} /> : i + 1}</b>
              {label}
            </span>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) setStep(step + 1);
            else onSave(draft, goal);
          }}
        >
          {step === 0 && (
            <div className="setup-fields">
              <label>
                Circuit name
                <input
                  value={draft.name}
                  required
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                What does it supply?
                <select
                  value={draft.equipment}
                  onChange={(e) => update({ equipment: e.target.value })}
                >
                  {[
                    "Mixed / unknown",
                    "Machinery",
                    "Lighting",
                    "Cooling / AC",
                    "Heating",
                    "Charging",
                    "Always-on equipment",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                What would you like to understand?
                <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                  {[
                    "Understand my routine",
                    "Spot equipment left running",
                    "Reduce overlapping loads",
                    "Track standby consumption",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="setup-fields">
              <div className="setup-choice">
                <button
                  type="button"
                  aria-pressed={!draft.schedule}
                  onClick={() => update({ schedule: false })}
                >
                  No fixed schedule
                </button>
                <button
                  type="button"
                  aria-pressed={draft.schedule}
                  onClick={() => update({ schedule: true })}
                >
                  Set expected hours
                </button>
              </div>
              {draft.schedule ? (
                <>
                  <div className="setup-field-pair">
                    <label>
                      Usually starts
                      <select
                        value={draft.startHour}
                        onChange={(e) => update({ startHour: Number(e.target.value) })}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Usually ends
                      <select
                        value={draft.endHour}
                        onChange={(e) => update({ endHour: Number(e.target.value) })}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {String(i).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="patterns-subtext">
                    An end time before the start continues into the next day. Equal times mean 24
                    hours on selected days.
                  </p>
                  <div className="setup-days" role="group" aria-label="Expected operating days">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
                      <button
                        type="button"
                        key={day}
                        aria-pressed={draft.days.includes(i)}
                        onClick={() =>
                          update({
                            days: draft.days.includes(i)
                              ? draft.days.filter((d) => d !== i)
                              : [...draft.days, i],
                          })
                        }
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                  {!draft.days.length && (
                    <p className="patterns-error">Select at least one operating day.</p>
                  )}
                </>
              ) : (
                <p className="setup-note">
                  No assumptions needed. We’ll show recorded activity and wait for enough history
                  before making comparisons.
                </p>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="setup-fields">
              <label>
                Daily active-time reminder (hours)
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  value={draft.runtimeHours}
                  required
                  onChange={(e) => update({ runtimeHours: Number(e.target.value) })}
                />
                <small>
                  Show an observation after this much cumulative activity in a day. Set 0 to turn it
                  off.
                </small>
              </label>
              <label>
                Count as active above (watts)
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={draft.thresholdW}
                  required
                  onChange={(e) => update({ thresholdW: Number(e.target.value) })}
                />
                <small>
                  Choose a threshold above this circuit’s normal standby draw. It applies to future
                  recorded readings.
                </small>
              </label>
              <p className="setup-note">
                <ShieldCheck size={16} />
                These preferences create observations only. They never switch a breaker or change
                electrical protection.
              </p>
            </div>
          )}
          <div className="patterns-dialog-actions">
            <button
              type="button"
              className="patterns-text-button"
              onClick={() => (step ? setStep(step - 1) : onOpenChange(false))}
            >
              {step ? "Back" : "Do this later"}
            </button>
            <button
              type="submit"
              className="patterns-button"
              disabled={step === 1 && draft.schedule && !draft.days.length}
            >
              {step === 2 ? "Save preferences" : "Continue"}
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

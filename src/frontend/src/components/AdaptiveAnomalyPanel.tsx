import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Check,
  CircleGauge,
  Clock3,
  Database,
  Info,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { adaptiveAnomaly, useAdaptiveAnomaly } from "@/services/adaptiveAnomaly";
import type { UsageSource } from "@/lib/usagePatterns";
import { cn } from "@/lib/utils";

interface AdaptiveAnomalyPanelProps {
  source: UsageSource;
  selectedCircuitId?: string;
  compact?: boolean;
  labels?: Record<string, string>;
}

function duration(seconds: number | null) {
  if (seconds === null) return "Learning";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.round(seconds / 60)} min`;
}

export function AdaptiveAnomalyPanel({
  source,
  selectedCircuitId,
  compact = false,
  labels = {},
}: AdaptiveAnomalyPanelProps) {
  const model = useAdaptiveAnomaly(source);
  const circuits = selectedCircuitId
    ? model.circuits.filter((circuit) => circuit.id === selectedCircuitId)
    : model.circuits;
  const events = selectedCircuitId
    ? model.events.filter((event) => event.circuitId === selectedCircuitId)
    : model.events;
  const latestEvent = events[0];
  const stageCopy =
    model.stage === "ready"
      ? "The observed circuit states now have enough samples for live power comparisons."
      : model.stage === "learning"
        ? "Building separate active and standby signatures from valid consecutive readings."
        : "Waiting for enough valid consecutive readings to begin comparison.";

  if (compact) {
    return (
      <section className="adaptive-panel adaptive-compact" aria-label="Adaptive anomaly model">
        <div className="adaptive-compact-head">
          <span className={cn("adaptive-model-icon", model.stage === "ready" && "ready")}>
            <BrainCircuit />
          </span>
          <div>
            <p>ADAPTIVE CIRCUIT MODEL</p>
            <h2>
              {latestEvent
                ? latestEvent.title
                : model.stage === "ready"
                  ? "Live readings are within learned ranges."
                  : "Learning how these circuits normally behave."}
            </h2>
          </div>
          <span className={cn("adaptive-stage-pill", model.stage)}>
            <i /> {model.stage === "ready" ? "MODEL READY" : `${model.totalSamples} READINGS`}
          </span>
        </div>
        <div className="adaptive-compact-circuits">
          {circuits.length ? (
            circuits.map((circuit) => (
              <div key={circuit.id}>
                <span className={cn("adaptive-live-dot", circuit.status)} />
                <p><strong>{labels[circuit.id] || circuit.name}</strong><small>{Math.round(circuit.currentWatts)} W now</small></p>
                <b>{circuit.status === "watch" ? "Review" : circuit.status === "normal" ? "In range" : `${circuit.trainingProgress}% learned`}</b>
              </div>
            ))
          ) : (
            <p className="adaptive-compact-empty">Circuit model will begin when valid telemetry arrives.</p>
          )}
        </div>
        <div className="adaptive-compact-foot">
          <span><ShieldCheck /> ML observes only. Deterministic breaker protection remains independent.</span>
          <Link to="/patterns">Open evidence <ArrowRight /></Link>
        </div>
      </section>
    );
  }

  return (
    <section className="patterns-card adaptive-panel">
      <div className="adaptive-head">
        <div className="adaptive-title">
          <span className={cn("adaptive-model-icon", model.stage === "ready" && "ready")}>
            <BrainCircuit />
          </span>
          <div>
            <p className="patterns-overline">LIVE, EXPLAINABLE MODEL</p>
            <h2>Adaptive circuit intelligence.</h2>
            <p>{stageCopy}</p>
          </div>
        </div>
        <span className={cn("adaptive-stage-pill", model.stage)}>
          <i /> {model.stage === "ready" ? "MODEL READY" : model.stage.toUpperCase()}
        </span>
      </div>

      <div className="adaptive-pipeline" aria-label="Model processing steps">
        <div><Activity /><span><b>1</b> Validate readings</span></div>
        <ArrowRight />
        <div><CircleGauge /><span><b>2</b> Learn each state</span></div>
        <ArrowRight />
        <div><Sparkles /><span><b>3</b> Gate sustained changes</span></div>
      </div>

      <div className="adaptive-summary">
        <div><span>Valid readings</span><strong>{model.totalSamples.toLocaleString()}</strong><small>Demo and hardware stay separate</small></div>
        <div><span>Ready circuits</span><strong>{model.readyCircuits} / {model.circuits.length}</strong><small>For states seen often enough</small></div>
        <div><span>Observations</span><strong>{events.length}</strong><small>Single spikes are ignored</small></div>
      </div>

      <div className="adaptive-circuits">
        {circuits.length ? (
          circuits.map((circuit) => (
            <article key={circuit.id} className={cn("adaptive-circuit", circuit.status === "watch" && "watch")}>
              <div className="adaptive-circuit-top">
                <span className={cn("adaptive-live-dot", circuit.status)} />
                <div>
                  <h3>{labels[circuit.id] || circuit.name}</h3>
                  <p>{circuit.state === "active" ? "Active state" : circuit.state === "standby" ? "Standby state" : "Waiting for state"}</p>
                </div>
                <strong>{Math.round(circuit.currentWatts)} <small>W</small></strong>
              </div>
              <div className="adaptive-progress">
                <span style={{ width: `${circuit.trainingProgress}%` }} />
              </div>
              <div className="adaptive-circuit-meta">
                <span><b>{circuit.trainingProgress}%</b> training evidence</span>
                <span><b>{circuit.typicalActiveWatts === null ? "—" : `${Math.round(circuit.typicalActiveWatts)} W`}</b> typical active</span>
                <span><b>{duration(circuit.typicalRuntimeSeconds)}</b> typical session</span>
              </div>
              <div className={cn("adaptive-circuit-verdict", circuit.status)}>
                {circuit.status === "watch" ? <TriangleAlert /> : circuit.stage === "ready" ? <Check /> : <Database />}
                <span>
                  {circuit.status === "watch"
                    ? "Sustained change needs review"
                    : circuit.status === "normal"
                      ? "Current reading is within the learned range"
                      : circuit.state === "standby"
                        ? `${Math.max(0, 90 - circuit.standbySamples)} more standby samples before standby-power comparison`
                        : `${Math.max(0, 60 - circuit.activeSamples)} more active samples before active-power comparison`}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="adaptive-empty">
            <BrainCircuit />
            <div><h3>No model input yet.</h3><p>Keep a valid data source running. Disconnected and invalid readings are excluded.</p></div>
          </div>
        )}
      </div>

      <div className="adaptive-events">
        <div className="adaptive-events-head">
          <div><p className="patterns-overline">MODEL OBSERVATIONS</p><h3>Changes that passed the evidence gate.</h3></div>
          {events.length > 0 && <button type="button" onClick={() => adaptiveAnomaly.clearEvents(source)}>Clear observations</button>}
        </div>
        {events.length ? (
          events.slice(0, 5).map((event) => (
            <article key={event.id} className={cn(event.severity === "important" && "important")}>
              <span className="adaptive-event-icon">{event.kind === "runtime_long" ? <Clock3 /> : <Zap />}</span>
              <div>
                <span className="patterns-tag">{event.kind === "runtime_long" ? "RUNTIME" : "POWER SIGNATURE"}</span>
                <h4>{event.title}</h4>
                <p>{event.detail}</p>
                <small>{new Date(event.timestamp * 1000).toLocaleString()} · {labels[event.circuitId] || event.circuitName}</small>
                <div className="adaptive-feedback">
                  <button type="button" aria-pressed={event.feedback === "expected"} onClick={() => adaptiveAnomaly.markEvent(source, event.id, "expected")}><Check /> Expected</button>
                  <button type="button" aria-pressed={event.feedback === "review"} onClick={() => adaptiveAnomaly.markEvent(source, event.id, "review")}><Info /> Review later</button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="adaptive-no-events"><ShieldCheck /><div><h4>No sustained anomaly recorded.</h4><p>This means no change has passed the current evidence gate. It does not prove that every appliance or electrical condition is normal.</p></div></div>
        )}
      </div>

      <details className="adaptive-details">
        <summary><Info /> How this model makes a decision <ArrowRight /></summary>
        <div>
          <p>Each circuit learns separate active and standby power distributions using a time-decayed online model. Training accepts one baseline sample every five seconds, regardless of stream rate. A power observation needs at least 60 active samples or 90 standby samples, a deviation of at least four learned standard deviations and 30%, and three consecutive samples spanning five seconds.</p>
          <p>Runtime observations require five completed sessions and at least 15 minutes beyond the learned range. Telemetry gaps over 30 seconds break continuity. Feedback labels an observation but does not silently retrain the model.</p>
          <p><strong>Safety boundary:</strong> the model cannot open or close a breaker. Installed protection and deterministic rated-current thresholds remain responsible for trips.</p>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Reset all ${source} learning and observations? This cannot be undone.`)) adaptiveAnomaly.reset(source);
            }}
          ><RotateCcw /> Reset {source} learning</button>
        </div>
      </details>
    </section>
  );
}

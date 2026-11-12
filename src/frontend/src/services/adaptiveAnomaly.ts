import { useSyncExternalStore } from "react";
import {
  AdaptiveAnomalyEngine,
  type AdaptiveAnomalySnapshot,
} from "@/lib/adaptiveAnomaly";
import type { UsageSource } from "@/lib/usagePatterns";

const storage = typeof window === "undefined" ? undefined : window.localStorage;

export const adaptiveAnomaly = new AdaptiveAnomalyEngine(storage);

const serverSnapshots: Record<UsageSource, AdaptiveAnomalySnapshot> = {
  hardware: {
    source: "hardware",
    stage: "waiting",
    totalSamples: 0,
    readyCircuits: 0,
    circuits: [],
    events: [],
    updatedAt: null,
  },
  demo: {
    source: "demo",
    stage: "waiting",
    totalSamples: 0,
    readyCircuits: 0,
    circuits: [],
    events: [],
    updatedAt: null,
  },
};

export function useAdaptiveAnomaly(source: UsageSource) {
  return useSyncExternalStore(
    adaptiveAnomaly.subscribe,
    () => adaptiveAnomaly.getSnapshot(source),
    () => serverSnapshots[source],
  );
}

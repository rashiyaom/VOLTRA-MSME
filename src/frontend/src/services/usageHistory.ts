import { z } from "zod";
import type { TelemetrySnapshot } from "./esp32Api";
import {
  defaultPreferences,
  intervalBuckets,
  type UsageBucket,
  type UsagePreferences,
  type UsageSource,
} from "@/lib/usagePatterns";

const preferenceSchema = z.object({
  configured: z.boolean(),
  goal: z.string().max(100),
  retentionDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  circuits: z.record(
    z.object({
      name: z.string().max(80),
      equipment: z.string().max(50),
      schedule: z.boolean(),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(0).max(23),
      days: z.array(z.number().int().min(0).max(6)).max(7),
      thresholdW: z.number().min(1).max(100000),
      runtimeHours: z.number().min(0).max(24),
    }),
  ),
  feedback: z.record(z.enum(["expected", "investigate"])),
});
export function readUsagePreferences(source: UsageSource): UsagePreferences {
  try {
    return preferenceSchema.parse(
      JSON.parse(localStorage.getItem(`voltra.usage.${source}`) || "null"),
    );
  } catch {
    return defaultPreferences();
  }
}
export function saveUsagePreferences(source: UsageSource, preferences: UsagePreferences) {
  localStorage.setItem(
    `voltra.usage.${source}`,
    JSON.stringify(preferenceSchema.parse(preferences)),
  );
  usageHistory.resetInterval();
  window.dispatchEvent(new Event("voltra-usage-change"));
}
function merge(a: UsageBucket, b: UsageBucket): UsageBucket {
  return {
    ...a,
    seconds: a.seconds + b.seconds,
    activeSeconds: a.activeSeconds + b.activeSeconds,
    wh: a.wh + b.wh,
    peakW: Math.max(a.peakW, b.peakW),
    estimated: a.estimated || b.estimated,
  };
}
class UsageHistory {
  private db: Promise<IDBDatabase> | null = null;
  private previous: { source: UsageSource; snapshot: TelemetrySnapshot } | null = null;
  private pending = new Map<string, UsageBucket>();
  private queue: Promise<void> = Promise.resolve();
  private writer = false;
  private started = false;
  error: string | null = null;
  private open() {
    if (!this.db)
      this.db = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("History storage is unavailable in this browser."));
          return;
        }
        const request = indexedDB.open("voltra_usage_patterns", 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("buckets", { keyPath: "id" });
          store.createIndex("sourceTime", ["source", "start"]);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(new Error("Unable to open usage history. Check browser storage permissions."));
      });
    return this.db;
  }
  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    // One collector per origin prevents duplicate energy totals across browser tabs.
    if (navigator.locks) {
      navigator.locks
        .request("voltra-usage-collector", async () => {
          this.writer = true;
          await new Promise<void>((resolve) =>
            window.addEventListener(
              "pagehide",
              () => {
                this.writer = false;
                void this.flush();
                resolve();
              },
              { once: true },
            ),
          );
        })
        .catch(() => {
          this.error = "Usage recording needs browser storage access.";
        });
    } else
      this.error =
        "Usage recording requires a browser with Web Locks support on HTTPS or localhost.";
    window.setInterval(() => {
      void this.flush();
    }, 15000);
  }
  resetInterval() {
    this.previous = null;
  }
  ingest(snapshot: TelemetrySnapshot, source: UsageSource) {
    this.start();
    if (
      !this.writer ||
      snapshot.valid === false ||
      !Number.isFinite(snapshot.timestamp) ||
      Math.abs(Date.now() / 1000 - snapshot.timestamp) > 60
    ) {
      this.previous = null;
      return;
    }
    if (this.previous?.source === source) {
      for (const row of intervalBuckets(
        this.previous.snapshot,
        snapshot,
        source,
        readUsagePreferences(source),
      )) {
        const existing = this.pending.get(row.id);
        this.pending.set(row.id, existing ? merge(existing, row) : row);
      }
    }
    this.previous = { source, snapshot };
  }
  flush() {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.pending.size) return;
        const batch = this.pending;
        this.pending = new Map();
        try {
          const db = await this.open();
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("buckets", "readwrite"),
              store = tx.objectStore("buckets");
            for (const row of batch.values()) {
              const request = store.get(row.id);
              request.onsuccess = () =>
                store.put(request.result ? merge(request.result, row) : row);
            }
            for (const source of ["demo", "hardware"] as const) {
              const cutoff = Date.now() / 1000 - readUsagePreferences(source).retentionDays * 86400;
              const request = store
                .index("sourceTime")
                .openCursor(IDBKeyRange.bound([source, 0], [source, cutoff]));
              request.onsuccess = () => {
                const cursor = request.result;
                if (cursor) {
                  cursor.delete();
                  cursor.continue();
                }
              };
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () =>
              reject(new Error("Usage history could not be saved. Storage may be full."));
            tx.onabort = () => reject(new Error("Usage history save was interrupted."));
          });
          this.error = null;
          window.dispatchEvent(new Event("voltra-usage-change"));
        } catch (error) {
          for (const row of batch.values()) {
            const current = this.pending.get(row.id);
            this.pending.set(row.id, current ? merge(row, current) : row);
          }
          this.error = error instanceof Error ? error.message : "History unavailable";
        }
      });
    return this.queue;
  }
  async read(source: UsageSource) {
    await this.flush();
    const db = await this.open();
    const cutoff = Date.now() / 1000 - readUsagePreferences(source).retentionDays * 86400;
    return new Promise<UsageBucket[]>((resolve, reject) => {
      const tx = db.transaction("buckets", "readonly");
      const req = tx
        .objectStore("buckets")
        .index("sourceTime")
        .getAll(IDBKeyRange.bound([source, cutoff], [source, Infinity]));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error("Usage history could not be loaded."));
    });
  }
  async clear(source: UsageSource) {
    this.resetInterval();
    await this.flush();
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("buckets", "readwrite"),
        req = tx
          .objectStore("buckets")
          .index("sourceTime")
          .openCursor(IDBKeyRange.bound([source, 0], [source, Infinity]));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error("History could not be deleted."));
    });
    for (const [id, row] of this.pending) if (row.source === source) this.pending.delete(id);
    this.resetInterval();
    window.dispatchEvent(new Event("voltra-usage-change"));
  }
}
export const usageHistory = new UsageHistory();

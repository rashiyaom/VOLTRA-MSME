/**
 * storage.ts
 * Client-side IndexedDB persistence & audit export engine for Voltrics.
 * Persists high-density electrical telemetry logs, trip event audit records,
 * custom circuit breaker labels, and tariff configurations.
 * Generates standards-compliant CSV and JSON audit reports for compliance.
 */

import type { TelemetrySnapshot } from './esp32Api';

export interface TripAuditRecord {
  id: string;
  timestamp: number;
  isoDate: string;
  circuitId: string;
  circuitName: string;
  reason: string;
  currentAtTrip: number;
  ratedCapacity: number;
  triggeredBy: 'OVERLOAD_GUARDIAN' | 'MANUAL_OVERRIDE' | 'HARDWARE_TRIP';
  resolvedAt?: string;
}

export interface CircuitMetadataRecord {
  id: string;
  name: string;
  room?: string;
  ratedAmps: number;
  priority: 'CRITICAL' | 'HIGH' | 'STANDARD';
}

export interface TariffRecord {
  key: string;
  ratePerKwh: number;
  currency: 'USD' | 'INR';
  peakRatePerKwh?: number;
}

const DB_NAME = 'voltrics_db';
const DB_VERSION = 1;

class VoltricsStorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.initDb();
    }
  }

  private initDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
          const db: IDBDatabase = event.target.result;

          // Telemetry history store
          if (!db.objectStoreNames.contains('telemetry_logs')) {
            const telemetryStore = db.createObjectStore('telemetry_logs', {
              keyPath: 'id',
              autoIncrement: true,
            });
            telemetryStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // Trip & actuation audit events store
          if (!db.objectStoreNames.contains('trip_events')) {
            const tripStore = db.createObjectStore('trip_events', { keyPath: 'id' });
            tripStore.createIndex('timestamp', 'timestamp', { unique: false });
            tripStore.createIndex('circuitId', 'circuitId', { unique: false });
          }

          // Circuit metadata & thresholds store
          if (!db.objectStoreNames.contains('circuit_metadata')) {
            db.createObjectStore('circuit_metadata', { keyPath: 'id' });
          }

          // Energy tariff settings store
          if (!db.objectStoreNames.contains('tariff_config')) {
            db.createObjectStore('tariff_config', { keyPath: 'key' });
          }
        };

        request.onsuccess = (event: any) => {
          resolve(event.target.result);
        };

        request.onerror = (err) => {
          console.warn('IndexedDB opening error in Voltrics:', err);
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB unavailable or blocked:', e);
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Save a single telemetry snapshot to IndexedDB
   */
  public async logTelemetry(snapshot: TelemetrySnapshot): Promise<void> {
    const db = await this.initDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('telemetry_logs', 'readwrite');
        const store = tx.objectStore('telemetry_logs');
        store.add({
          timestamp: snapshot.timestamp,
          voltage_rms: snapshot.voltage_rms,
          current_rms: snapshot.current_rms,
          active_power: snapshot.active_power,
          apparent_power: snapshot.apparent_power,
          power_factor: snapshot.power_factor,
          frequency: snapshot.frequency,
          circuits: snapshot.circuits,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Record a breaker trip or overcurrent incident to the audit ledger
   */
  public async recordTripEvent(event: TripAuditRecord): Promise<void> {
    const db = await this.initDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('trip_events', 'readwrite');
        const store = tx.objectStore('trip_events');
        store.put(event);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Retrieve all trip events from the audit log
   */
  public async getTripEvents(): Promise<TripAuditRecord[]> {
    const db = await this.initDb();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('trip_events', 'readonly');
        const store = tx.objectStore('trip_events');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  /**
   * Fetch recent telemetry records within a time range
   */
  public async getTelemetryHistory(limit = 200): Promise<TelemetrySnapshot[]> {
    const db = await this.initDb();
    if (!db) return [];

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('telemetry_logs', 'readonly');
        const store = tx.objectStore('telemetry_logs');
        const req = store.openCursor(null, 'prev');
        const results: TelemetrySnapshot[] = [];

        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor && results.length < limit) {
            results.push(cursor.value);
            cursor.continue();
          } else {
            resolve(results.reverse());
          }
        };
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  /**
   * Save custom circuit label and threshold overrides
   */
  public async saveCircuitMetadata(record: CircuitMetadataRecord): Promise<void> {
    const db = await this.initDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('circuit_metadata', 'readwrite');
        tx.objectStore('circuit_metadata').put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Save energy tariff parameters
   */
  public async saveTariffConfig(config: TariffRecord): Promise<void> {
    const db = await this.initDb();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tariff_config', 'readwrite');
        tx.objectStore('tariff_config').put(config);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Export telemetry snapshots to CSV file download
   */
  public exportTelemetryCsv(snapshots: TelemetrySnapshot[], filename?: string): void {
    if (typeof window === 'undefined') return;

    const headers = [
      'Timestamp_Epoch',
      'Date_UTC',
      'Voltage_RMS_V',
      'Total_Current_RMS_A',
      'Active_Power_W',
      'Apparent_Power_VA',
      'Power_Factor',
      'Frequency_Hz',
      'Circuit_States_JSON',
    ];

    const rows = snapshots.map((s) => [
      s.timestamp,
      new Date(s.timestamp * 1000).toISOString(),
      s.voltage_rms.toFixed(2),
      s.current_rms.toFixed(2),
      s.active_power.toFixed(1),
      s.apparent_power.toFixed(1),
      s.power_factor.toFixed(3),
      s.frequency.toFixed(2),
      `"${JSON.stringify(s.circuits).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const name = filename || `voltrics_telemetry_${this.getTimestampSuffix()}.csv`;

    this.triggerDownload(blob, name);
  }

  /**
   * Export JSON Audit Log of breaker operations and trips
   */
  public exportAuditJson(events: TripAuditRecord[], systemMetadata?: Record<string, any>): void {
    if (typeof window === 'undefined') return;

    const payload = {
      system: 'VOLTRA Smart Electrical Telemetry & Circuit Automation',
      version: '2.4.0',
      exportedAt: new Date().toISOString(),
      metadata: systemMetadata || {},
      totalIncidents: events.length,
      auditLedger: events,
    };

    const jsonContent = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const name = `voltrics_audit_log_${this.getTimestampSuffix()}.json`;

    this.triggerDownload(blob, name);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private getTimestampSuffix(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
}

export const voltricsStorage = new VoltricsStorageService();

/**
 * useVoltricsStore.ts
 * Global Reactive Telemetry Store, Hardware Pipeline & Overload Guardian for Voltrics.
 * Manages Web Bluetooth, ESP32 REST/WebSocket streaming, offline deterministic simulation,
 * optimistic circuit breaker actuation with auto-revert, and threshold overload safety.
 */

import { useSyncExternalStore } from 'react';
import { readUsagePreferences, usageHistory } from '../services/usageHistory';
import { adaptiveAnomaly } from '../services/adaptiveAnomaly';
import { voltricsBle, type ProvisioningFeedback } from '../services/bluetooth';
import {
  esp32Api,
  blynkApi,
  type TelemetrySnapshot,
  type CircuitTelemetry,
  type DeviceStatus,
  type RawEsp32Reading,
  parseEsp32RawLine,
  rawReadingToTelemetrySnapshot,
  parseEsp32Payload,
} from '../services/esp32Api';
import { voltricsSimulator } from '../services/simulator';
import { voltricsStorage, type TripAuditRecord } from '../services/storage';
import {
  voltraLanGateway,
  normalizeGatewayEndpoint,
  lanReadingToTelemetrySnapshot,
  type VoltraLanReading,
  type VoltraLanStatus,
} from '../services/websiteLanGateway';

export type OperatingMode = 'SIMULATED' | 'REALTIME';

export type ConnectionState =
  | 'DISCONNECTED'
  | 'SCANNING'
  | 'CONNECTING'
  | 'CONNECTED_BLE'
  | 'CONNECTED_WIFI'
  | 'CONNECTED_BLYNK'
  | 'CONNECTED_SERIAL'
  | 'SIMULATION';

export const isHardwareConnected = (state: ConnectionState): boolean =>
  state.startsWith('CONNECTED');

export type ConnectionType = 'SIMULATION' | 'BLE' | 'WIFI_LAN' | 'BLYNK_CLOUD' | 'USB_SERIAL' | 'NONE';

export interface DeviceMetadata {
  ip: string;
  bleName: string;
  rssi: number;
  firmware: string;
  uptime: number;
  freeHeap: number;
  lastPingMs: number;
}

export interface OverloadState {
  isOverloaded: boolean;
  consecutiveTicks: Record<string, number>;
  criticalCircuits: string[];
  alertMessage: string | null;
}

export interface VoltricsState {
  operatingMode: OperatingMode;
  connectionState: ConnectionState;
  connectionType: ConnectionType;
  deviceMetadata: DeviceMetadata;
  liveReading: TelemetrySnapshot;
  recentHistory: TelemetrySnapshot[]; // rolling buffer of 120 points
  actuatingCircuitIds: Record<string, boolean>; // optimistic loading state per circuit
  overloadState: OverloadState;
  provisioning: ProvisioningFeedback;
  tariffRate: number; // $ or ₹ per kWh
  tariffCurrency: 'USD' | 'INR';
}

export const DISCONNECTED_SNAPSHOT: TelemetrySnapshot = {
  timestamp: Math.floor(Date.now() / 1000),
  voltage_rms: 0.0,
  current_rms: 0.0,
  active_power: 0.0,
  apparent_power: 0.0,
  power_factor: 0.0,
  frequency: 0.0,
  rawTime: '--:--:--',
  load1: 0.0,
  load2: 0.0,
  power1: 0.0,
  power2: 0.0,
  circuits: [
    { id: 'c1', name: 'Load 1 (CT Sensor 1)', state: 'OPEN', current: 0.0, rated: 16.0 },
    { id: 'c2', name: 'Load 2 (CT Sensor 2)', state: 'OPEN', current: 0.0, rated: 16.0 },
  ],
};

const INITIAL_SNAPSHOT: TelemetrySnapshot = {
  timestamp: Math.floor(Date.now() / 1000),
  voltage_rms: 197.35,
  current_rms: 0.281,
  active_power: 55.45,
  apparent_power: 55.45,
  power_factor: 0.98,
  frequency: 50.01,
  rawTime: '20:19:27.881',
  load1: 0.029,
  load2: 0.252,
  power1: 5.72,
  power2: 49.73,
  circuits: [
    { id: 'c1', name: 'Load 1 (CT Sensor 1)', state: 'CLOSED', current: 0.029, rated: 16.0 },
    { id: 'c2', name: 'Load 2 (CT Sensor 2)', state: 'CLOSED', current: 0.252, rated: 16.0 },
  ],
};

const INITIAL_STATE: VoltricsState = {
  operatingMode: 'SIMULATED',
  connectionState: 'SIMULATION', // start in simulation for immediate live telemetry
  connectionType: 'SIMULATION',
  deviceMetadata: {
    ip: 'http://voltra.local',
    bleName: 'VOLTRA ESP32-S3',
    rssi: -58,
    firmware: 'v2.4.1-esp32-s3-ct',
    uptime: 362400,
    freeHeap: 184320,
    lastPingMs: 22,
  },
  liveReading: INITIAL_SNAPSHOT,
  recentHistory: [INITIAL_SNAPSHOT],
  actuatingCircuitIds: {},
  overloadState: {
    isOverloaded: false,
    consecutiveTicks: {},
    criticalCircuits: [],
    alertMessage: null,
  },
  provisioning: {
    status: 'IDLE',
    message: 'Ready to pair via BLE',
  },
  tariffRate: 7.50,
  tariffCurrency: 'INR',
};

class VoltricsStoreCore {
  private state: VoltricsState = INITIAL_STATE;
  private listeners: Set<() => void> = new Set();
  private dbLoggingCounter: number = 0;
  private serialPort: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Load saved settings if any
      const savedIp = localStorage.getItem('voltrics_esp32_base_url');
      if (savedIp) {
        this.state.deviceMetadata.ip = savedIp;
      }

      const savedRate = localStorage.getItem('voltrics-utility-rate');
      if (savedRate) {
        this.state.tariffRate = parseFloat(savedRate);
      }

      // Check persisted operating mode
      const savedMode = localStorage.getItem('voltrics_operating_mode') as OperatingMode | null;
      if (savedMode === 'REALTIME') {
        this.state.operatingMode = 'REALTIME';
        this.state.connectionState = 'DISCONNECTED';
        this.state.connectionType = 'NONE';
        this.state.liveReading = DISCONNECTED_SNAPSHOT;
        this.state.recentHistory = [DISCONNECTED_SNAPSHOT];
        // Do NOT start simulation in real-time mode!
      } else {
        this.state.operatingMode = 'SIMULATED';
        this.state.connectionState = 'SIMULATION';
        this.state.connectionType = 'SIMULATION';
        this.initSimulation();
      }
    }
  }

  public getState(): VoltricsState {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Process an incoming telemetry snapshot from any transport
   */
  public ingestTelemetry(snapshot: TelemetrySnapshot): void {
    let usageSource: 'demo' | 'hardware' | null = null;
    if (this.state.operatingMode === 'SIMULATED') {
      usageSource = 'demo';
      usageHistory.ingest(snapshot, 'demo');
    } else if (this.state.connectionState.startsWith('CONNECTED_')) {
      usageSource = 'hardware';
      usageHistory.ingest(snapshot, 'hardware');
    } else {
      usageHistory.resetInterval();
    }
    if (usageSource) {
      const preferences = readUsagePreferences(usageSource);
      adaptiveAnomaly.ingest(
        snapshot,
        usageSource,
        Object.fromEntries(
          Object.entries(preferences.circuits).map(([id, circuit]) => [id, circuit.thresholdW]),
        ),
      );
    }
    // 1. Maintain rolling history buffer (last 120 data points)
    const newHistory = [...this.state.recentHistory, snapshot];
    if (newHistory.length > 120) {
      newHistory.shift();
    }

    // 2. Evaluate Overload & Threshold Guardian
    const nextOverload = this.evaluateThresholds(snapshot);

    this.state = {
      ...this.state,
      liveReading: snapshot,
      recentHistory: newHistory,
      overloadState: nextOverload,
    };

    this.emit();

    // Periodically log to IndexedDB every 5 snapshots to avoid excessive writes
    this.dbLoggingCounter++;
    if (this.dbLoggingCounter % 5 === 0) {
      voltricsStorage.logTelemetry(snapshot).catch(() => {});
    }
  }

  /**
   * Parse and ingest a raw text line from ESP32 serial or WebSocket
   * e.g. "20:19:27.881\t197.35\t0.029\t0.252"
   */
  public ingestRawEsp32Line(line: string): boolean {
    const parsed = parseEsp32RawLine(line, this.state.tariffRate);
    if (!parsed) return false;
    const snapshot = rawReadingToTelemetrySnapshot(parsed);
    this.ingestTelemetry(snapshot);
    return true;
  }

  /**
   * Ingest a batch or multi-line string of ESP32 log output
   */
  public ingestRawEsp32Batch(rawText: string): number {
    const lines = rawText.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      if (this.ingestRawEsp32Line(line)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Overload & Threshold Guardian logic:
   * Checks branch currents against rated capacities.
   * If current > rated for > 3 consecutive ticks, triggers CRITICAL_OVERLOAD,
   * fires audio/haptic alarm, triggers Web Notification, and auto-trips breaker.
   */
  private evaluateThresholds(snapshot: TelemetrySnapshot): OverloadState {
    const consecutive = { ...this.state.overloadState.consecutiveTicks };
    const criticalCircuits: string[] = [];
    let isOverload = false;
    let alertMsg: string | null = null;

    for (const circuit of snapshot.circuits) {
      const isExceeded = circuit.current > circuit.rated;
      const count = isExceeded ? (consecutive[circuit.id] || 0) + 1 : 0;
      consecutive[circuit.id] = count;

      if (count > 3) {
        isOverload = true;
        criticalCircuits.push(circuit.id);
        alertMsg = `CRITICAL OVERLOAD: ${circuit.name} running at ${circuit.current}A (Rated ${circuit.rated}A) for ${count} ticks!`;

        // Auto-trip circuit for safety if not already tripped
        if (circuit.state === 'CLOSED') {
          this.triggerOverloadTrip(circuit);
        }
      }
    }

    // Overall current check (e.g. main incoming > 63A)
    if (snapshot.current_rms > 63.0) {
      const mainCount = (consecutive['MAIN_INCOMING'] || 0) + 1;
      consecutive['MAIN_INCOMING'] = mainCount;
      if (mainCount > 3) {
        isOverload = true;
        alertMsg = `CRITICAL MAIN OVERLOAD: Total Current ${snapshot.current_rms}A exceeds 63A Service Capacity!`;
        this.triggerAlarm();
      }
    } else {
      consecutive['MAIN_INCOMING'] = 0;
    }

    return {
      isOverloaded: isOverload,
      consecutiveTicks: consecutive,
      criticalCircuits,
      alertMessage: alertMsg,
    };
  }

  private triggerOverloadTrip(circuit: CircuitTelemetry): void {
    // 1. Audio and haptic pulse
    this.triggerAlarm();

    // 2. Browser Web Notification
    this.sendNotification(
      '🚨 VOLTRA Overload Alert: Circuit Tripped',
      `${circuit.name} exceeded capacity (${circuit.current}A / ${circuit.rated}A). Breaker tripped automatically to protect wiring and appliances.`
    );

    // 3. Actuate hardware or simulation to trip
    this.toggleCircuit(circuit.id, 'OPEN', true);

    // 4. Record in IndexedDB Audit Log
    const record: TripAuditRecord = {
      id: `trip-${Date.now()}-${circuit.id}`,
      timestamp: Math.floor(Date.now() / 1000),
      isoDate: new Date().toISOString(),
      circuitId: circuit.id,
      circuitName: circuit.name,
      reason: `Overload Guardian: ${circuit.current}A > ${circuit.rated}A capacity sustained for >3 ticks`,
      currentAtTrip: circuit.current,
      ratedCapacity: circuit.rated,
      triggeredBy: 'OVERLOAD_GUARDIAN',
    };
    voltricsStorage.recordTripEvent(record).catch(() => {});
  }

  /**
   * Sound & Haptic pulse for trip / alert
   */
  public triggerAlarm(): void {
    if (typeof window === 'undefined') return;

    // Haptic vibration
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }

    // Web Audio API beep synthesizer
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 alert
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (e) {
      // Audio context might be restricted before user interaction
    }
  }

  /**
   * Browser Notification API
   */
  public sendNotification(title: string, body: string): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        }
      });
    }
  }

  /**
   * Actuate Circuit Breaker with Optimistic UI Update and strict <=2000ms rollback
   */
  public async toggleCircuit(
    circuitId: string,
    explicitTargetState?: 'OPEN' | 'CLOSED',
    isSafetyTrip = false
  ): Promise<boolean> {
    const circuits = this.state.liveReading.circuits;
    const targetIdx = circuits.findIndex((c) => c.id === circuitId);
    if (targetIdx === -1) return false;

    const currentCircuit = circuits[targetIdx];
    const previousState = currentCircuit.state;
    const nextState = explicitTargetState || (previousState === 'CLOSED' ? 'OPEN' : 'CLOSED');

    // 1. Optimistic UI update
    const updatedCircuits = [...circuits];
    const baseAmps = currentCircuit.current > 0
      ? currentCircuit.current
      : (targetIdx === 0 ? 0.029 : targetIdx === 1 ? 0.252 : 0.1);
    const newCurrent = nextState === 'CLOSED' ? baseAmps : 0.0;

    updatedCircuits[targetIdx] = {
      ...currentCircuit,
      state: nextState,
      current: newCurrent,
    };

    const newLoad1 = updatedCircuits[0]?.state === 'CLOSED' ? updatedCircuits[0].current : 0;
    const newLoad2 = updatedCircuits[1]?.state === 'CLOSED' ? updatedCircuits[1].current : 0;
    const newTotalCurrent = Number((newLoad1 + newLoad2).toFixed(3));
    const volt = this.state.liveReading.voltage_rms || 197.35;
    const newActivePower = Number((volt * newTotalCurrent).toFixed(2));

    this.state = {
      ...this.state,
      liveReading: {
        ...this.state.liveReading,
        circuits: updatedCircuits,
        load1: newLoad1,
        load2: newLoad2,
        current_rms: newTotalCurrent,
        active_power: newActivePower,
      },
      actuatingCircuitIds: {
        ...this.state.actuatingCircuitIds,
        [circuitId]: true,
      },
    };
    this.emit();

    // Trigger haptic click feedback
    if (typeof window !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }

    try {
      // 2. Dispatch command to active transport
      if (this.state.connectionState === 'SIMULATION') {
        voltricsSimulator.toggleCircuit(circuitId, nextState);
      } else if (this.state.connectionState === 'CONNECTED_BLE') {
        await voltricsBle.toggleCircuit(circuitId, nextState);
      } else if (this.state.connectionState === 'CONNECTED_WIFI') {
        await esp32Api.toggleCircuit(circuitId, nextState);
      } else if (this.state.connectionState === 'CONNECTED_BLYNK') {
        const pin = circuitId === 'c1' ? 'v3' : circuitId === 'c2' ? 'v4' : null;
        if (!pin) {
          throw new Error(`No physical Blynk relay is configured for ${circuitId}. This firmware exposes Load 1 on V3 and Load 2 on V4.`);
        }
        const accepted = await blynkApi.setVirtualPin(pin, nextState === 'CLOSED' ? 1 : 0);
        if (!accepted) {
          throw new Error(`Blynk rejected the ${nextState === 'CLOSED' ? 'ON' : 'OFF'} command for ${currentCircuit.name}.`);
        }
      } else if (this.state.operatingMode === 'REALTIME' && this.state.connectionState === 'DISCONNECTED') {
        throw new Error('Cannot actuate circuit breaker: Physical ESP32 is not connected in Real-Time mode.');
      }

      // Record in audit log if manual override
      if (!isSafetyTrip) {
        const record: TripAuditRecord = {
          id: `audit-${Date.now()}-${circuitId}`,
          timestamp: Math.floor(Date.now() / 1000),
          isoDate: new Date().toISOString(),
          circuitId,
          circuitName: currentCircuit.name,
          reason: `Manual breaker flip to ${nextState}`,
          currentAtTrip: currentCircuit.current,
          ratedCapacity: currentCircuit.rated,
          triggeredBy: 'MANUAL_OVERRIDE',
        };
        voltricsStorage.recordTripEvent(record).catch(() => {});
      }

      // Remove loading indicator
      const nextActuating = { ...this.state.actuatingCircuitIds };
      delete nextActuating[circuitId];
      this.state = {
        ...this.state,
        actuatingCircuitIds: nextActuating,
      };
      this.emit();

      return true;
    } catch (err: any) {
      console.error(`Actuation failed for circuit ${circuitId}:`, err);

      // Revert optimistic update
      const revertedCircuits = [...this.state.liveReading.circuits];
      revertedCircuits[targetIdx] = {
        ...currentCircuit,
        state: previousState,
      };

      const revLoad1 = revertedCircuits[0]?.state === 'CLOSED' ? revertedCircuits[0].current : 0;
      const revLoad2 = revertedCircuits[1]?.state === 'CLOSED' ? revertedCircuits[1].current : 0;
      const revTotalCurrent = Number((revLoad1 + revLoad2).toFixed(3));
      const volt = this.state.liveReading.voltage_rms || 197.35;
      const revActivePower = Number((volt * revTotalCurrent).toFixed(2));

      const nextActuating = { ...this.state.actuatingCircuitIds };
      delete nextActuating[circuitId];

      this.state = {
        ...this.state,
        liveReading: {
          ...this.state.liveReading,
          circuits: revertedCircuits,
          load1: revLoad1,
          load2: revLoad2,
          current_rms: revTotalCurrent,
          active_power: revActivePower,
        },
        actuatingCircuitIds: nextActuating,
      };
      this.emit();

      // Trigger error sound
      this.triggerAlarm();

      throw new Error((err as Error)?.message || `Actuation timeout or hardware failure on ${currentCircuit.name}. Reverted.`);
    }
  }

  /**
   * Set Operating Mode: 'SIMULATED' (demo data) or 'REALTIME' (physical hardware only)
   * Persisted across the entire website.
   */
  public setOperatingMode(mode: OperatingMode): void {
    usageHistory.resetInterval();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('voltrics_operating_mode', mode);
      } catch {
        // ignore
      }
    }

    if (mode === 'SIMULATED') {
      this.initSimulation();
    } else {
      this.stopHardwareStreams();
      this.state = {
        ...this.state,
        operatingMode: 'REALTIME',
        connectionState: 'DISCONNECTED',
        connectionType: 'NONE',
        liveReading: DISCONNECTED_SNAPSHOT,
        recentHistory: [DISCONNECTED_SNAPSHOT],
      };
      this.emit();
    }
  }

  /**
   * Mode switcher: SIMULATION mode
   */
  public initSimulation(): void {
    this.stopHardwareStreams();
    this.state = {
      ...this.state,
      operatingMode: 'SIMULATED',
      connectionState: 'SIMULATION',
      connectionType: 'SIMULATION',
    };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('voltrics_operating_mode', 'SIMULATED');
      } catch {
        // ignore
      }
    }
    voltricsSimulator.start(500, (snapshot) => {
      this.ingestTelemetry(snapshot);
    });
    this.emit();
  }

  /**
   * Mode switcher: Connect via Web Bluetooth / BLE
   */
  public async connectBle(): Promise<boolean> {
    this.stopHardwareStreams();
    this.state = {
      ...this.state,
      connectionState: 'CONNECTING',
    };
    this.emit();

    try {
      await voltricsBle.connect();

      this.state = {
        ...this.state,
        operatingMode: 'REALTIME',
        connectionState: 'CONNECTED_BLE',
        connectionType: 'BLE',
        deviceMetadata: {
          ...this.state.deviceMetadata,
          bleName: voltricsBle.getDeviceName(),
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('voltrics_operating_mode', 'REALTIME');
      }

      voltricsBle.onTelemetry((payload) => {
        this.ingestTelemetry(payload as TelemetrySnapshot);
      });

      voltricsBle.onDisconnect(() => {
        console.warn('BLE disconnected.');
        if (this.state.operatingMode === 'REALTIME') {
          this.state = {
            ...this.state,
            connectionState: 'DISCONNECTED',
            connectionType: 'NONE',
            liveReading: DISCONNECTED_SNAPSHOT,
          };
          this.emit();
        } else {
          this.initSimulation();
        }
      });

      voltricsBle.onProvisioning((feedback) => {
        this.state = {
          ...this.state,
          provisioning: feedback,
        };
        this.emit();
      });

      this.emit();
      return true;
    } catch (e) {
      console.error('BLE connection failed:', e);
      if (this.state.operatingMode === 'REALTIME') {
        this.state = {
          ...this.state,
          connectionState: 'DISCONNECTED',
          liveReading: DISCONNECTED_SNAPSHOT,
        };
        this.emit();
      } else {
        this.initSimulation();
      }
      throw e;
    }
  }

  /**
   * Mode switcher: Connect via Local Wi-Fi / REST LAN Gateway
   * Strictly uses firmware endpoints:
   *   GET /api/ping (Ping / connect health check)
   *   GET /api/readings (Cached graph measurements & estimated energy/cost)
   */
  public async connectWifi(customIp?: string): Promise<boolean> {
    this.stopHardwareStreams();

    let targetUrl = customIp;
    if (!targetUrl) {
      if (typeof localStorage !== 'undefined') {
        targetUrl =
          localStorage.getItem('voltra.gateway.endpoint') ||
          localStorage.getItem('voltrics_esp32_base_url') ||
          this.state.deviceMetadata.ip;
      } else {
        targetUrl = this.state.deviceMetadata.ip;
      }
    }
    targetUrl = (targetUrl || 'http://voltra.local').trim();

    let normalized = targetUrl;
    try {
      normalized = normalizeGatewayEndpoint(targetUrl);
    } catch (err: any) {
      if (!/^https?:\/\//i.test(targetUrl)) {
        try {
          normalized = normalizeGatewayEndpoint('http://' + targetUrl);
        } catch {
          throw err;
        }
      } else {
        throw err;
      }
    }

    esp32Api.setBaseUrl(normalized);
    this.state.deviceMetadata.ip = normalized;

    this.state = {
      ...this.state,
      connectionState: 'CONNECTING',
    };
    this.emit();

    // Hook callbacks onto VoltraLanGateway adapter
    voltraLanGateway.onData = (data: VoltraLanReading) => {
      // Per firmware spec: plot voltage/current only when valid is true
      if (!data.valid) {
        return;
      }
      const snapshot = lanReadingToTelemetrySnapshot(data, this.state.tariffRate);
      this.ingestTelemetry(snapshot);
    };

    voltraLanGateway.onStatus = (status: VoltraLanStatus) => {
      if (status.connected) {
        this.state = {
          ...this.state,
          operatingMode: 'REALTIME',
          connectionState: 'CONNECTED_WIFI',
          connectionType: 'WIFI_LAN',
          deviceMetadata: {
            ...this.state.deviceMetadata,
            ip: voltraLanGateway.endpoint,
            lastPingMs: status.health?.latency_ms ?? this.state.deviceMetadata.lastPingMs,
            rssi: status.health?.wifi?.rssi ?? -54,
            firmware: `v${status.health?.api_version ?? 1}.0`,
            uptime: status.health?.uptime_ms ? Math.floor(status.health.uptime_ms / 1000) : 3600,
          },
        };
        this.emit();
      } else if (status.state === 'disconnected') {
        if (this.state.operatingMode === 'REALTIME') {
          this.state = {
            ...this.state,
            connectionState: 'DISCONNECTED',
            connectionType: 'NONE',
            liveReading: DISCONNECTED_SNAPSHOT,
          };
          this.emit();
        }
      }
    };

    try {
      // Request GET /api/ping and initiate polling GET /api/readings
      const health = await voltraLanGateway.connect(normalized);

      if (typeof window !== 'undefined') {
        localStorage.setItem('voltrics_operating_mode', 'REALTIME');
        localStorage.setItem('voltra.gateway.endpoint', voltraLanGateway.endpoint);
        localStorage.setItem('voltrics_esp32_base_url', voltraLanGateway.endpoint);
      }

      this.state = {
        ...this.state,
        operatingMode: 'REALTIME',
        connectionState: 'CONNECTED_WIFI',
        connectionType: 'WIFI_LAN',
        deviceMetadata: {
          ...this.state.deviceMetadata,
          ip: voltraLanGateway.endpoint,
          lastPingMs: health?.latency_ms ?? 12,
          rssi: health?.wifi?.rssi ?? -54,
          firmware: `v${health?.api_version ?? 1}.0`,
          uptime: health?.uptime_ms ? Math.floor(health.uptime_ms / 1000) : 3600,
        },
      };
      this.emit();
      return true;
    } catch (e: any) {
      console.warn('Wi-Fi gateway connect failed:', e);
      if (this.state.operatingMode === 'REALTIME') {
        this.state = {
          ...this.state,
          connectionState: 'DISCONNECTED',
          connectionType: 'NONE',
          liveReading: DISCONNECTED_SNAPSHOT,
        };
        this.emit();
      } else {
        this.initSimulation();
      }
      throw e;
    }
  }

  /**
   * Disconnect ESP32 Wi-Fi LAN Gateway
   */
  public disconnectWifi(): void {
    voltraLanGateway.stop();
    esp32Api.stopStreaming();
    if (this.state.connectionState === 'CONNECTED_WIFI') {
      this.state = {
        ...this.state,
        connectionState: 'DISCONNECTED',
        connectionType: 'NONE',
        liveReading: DISCONNECTED_SNAPSHOT,
      };
      this.emit();
    }
  }

  /**
   * Wi-Fi Provisioning over BLE
   */
  public async provisionWifiViaBle(ssid: string, pass: string): Promise<void> {
    if (!voltricsBle.isConnected()) {
      await this.connectBle();
    }
    await voltricsBle.provisionWifi({ ssid, password: pass });
  }

  /**
   * Update Tariff Config
   */
  public setTariff(rate: number, currency: 'USD' | 'INR' = 'INR'): void {
    this.state = {
      ...this.state,
      tariffRate: rate,
      tariffCurrency: currency,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('voltrics-utility-rate', rate.toString());
      localStorage.setItem('voltrics-tariff-currency', currency);
    }
    voltricsStorage.saveTariffConfig({
      key: 'default',
      ratePerKwh: rate,
      currency,
    }).catch(() => {});
    this.emit();
  }

  /**
   * Mode switcher: Connect via Blynk IoT Cloud (Virtual Pin V0 = Current, V1 = Voltage)
   * Only activates if the ESP32 hardware is verified to be online on Blynk Cloud!
   */
  public async connectBlynk(token = ''): Promise<boolean> {
    this.stopHardwareStreams();
    this.state = {
      ...this.state,
      connectionState: 'CONNECTING',
    };
    this.emit();

    try {
      if (token.trim()) {
        blynkApi.setActiveToken(token);
      } else if (!blynkApi.hasActiveToken()) {
        throw new Error('Enter the Blynk device auth token in Settings.');
      }
      // 1. Verify if the physical ESP32 is REALLY online on Blynk Cloud
      const isOnline = await blynkApi.isHardwareConnected();
      if (!isOnline) {
        throw new Error('ESP32 device is OFFLINE on Blynk Cloud. Ensure your ESP32 board is powered on, flashed with Blynk firmware, and connected to Wi-Fi.');
      }

      this.state = {
        ...this.state,
        operatingMode: 'REALTIME',
        connectionState: 'CONNECTED_BLYNK',
        connectionType: 'BLYNK_CLOUD',
        deviceMetadata: {
          ...this.state.deviceMetadata,
          bleName: 'ESP32 Blynk Cloud',
          firmware: 'Blynk IoT v1.3.0',
          ip: 'https://blynk.cloud',
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('voltrics_operating_mode', 'REALTIME');
      }
      this.emit();

      blynkApi.startPolling((snapshot) => {
        this.ingestTelemetry(snapshot);
      }, undefined, 2000);

      return true;
    } catch (e) {
      console.warn('Blynk connection failed:', e);
      if (this.state.operatingMode === 'REALTIME') {
        this.state = {
          ...this.state,
          connectionState: 'DISCONNECTED',
          connectionType: 'NONE',
          liveReading: DISCONNECTED_SNAPSHOT,
        };
        this.emit();
      } else {
        this.initSimulation();
      }
      throw e;
    }
  }

  public disconnectBlynk(): void {
    blynkApi.stopPolling();
    if (this.state.operatingMode === 'REALTIME') {
      this.state = {
        ...this.state,
        connectionState: 'DISCONNECTED',
        connectionType: 'NONE',
        liveReading: DISCONNECTED_SNAPSHOT,
      };
      this.emit();
    } else {
      this.initSimulation();
    }
  }

  /**
   * Mode switcher: Connect via WebSerial (USB COM port at 115200 baud)
   */
  public async connectSerial(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const nav = navigator as any;
    if (!nav.serial) {
      throw new Error('WebSerial is not supported in this browser. Please use Chrome or Edge.');
    }

    this.stopHardwareStreams();
    this.state = {
      ...this.state,
      connectionState: 'CONNECTING',
    };
    this.emit();

    try {
      const port = await nav.serial.requestPort();
      await port.open({ baudRate: 115200 });
      this.serialPort = port;

      this.state = {
        ...this.state,
        operatingMode: 'REALTIME',
        connectionState: 'CONNECTED_SERIAL',
        connectionType: 'USB_SERIAL',
        deviceMetadata: {
          ...this.state.deviceMetadata,
          bleName: 'ESP32 USB Serial',
          firmware: 'UART 115200 baud',
          ip: 'USB Serial COM',
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('voltrics_operating_mode', 'REALTIME');
      }
      this.emit();

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = '';
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.trim()) {
                this.ingestRawEsp32Line(line);
              }
            }
          }
        } catch {
          // Closed
        } finally {
          this.disconnectSerial();
        }
      })();

      return true;
    } catch (e) {
      console.warn('Serial connection failed:', e);
      if (this.state.operatingMode === 'REALTIME') {
        this.state = {
          ...this.state,
          connectionState: 'DISCONNECTED',
          connectionType: 'NONE',
          liveReading: DISCONNECTED_SNAPSHOT,
        };
        this.emit();
      }
      throw e;
    }
  }

  public disconnectSerial(): void {
    if (this.serialPort) {
      try {
        this.serialPort.close();
      } catch {}
      this.serialPort = null;
    }
    if (this.state.connectionState === 'CONNECTED_SERIAL') {
      if (this.state.operatingMode === 'REALTIME') {
        this.state = {
          ...this.state,
          connectionState: 'DISCONNECTED',
          connectionType: 'NONE',
          liveReading: DISCONNECTED_SNAPSHOT,
        };
      } else {
        this.initSimulation();
      }
      this.emit();
    }
  }

  public setSimulationSpeed(intervalMs: number): void {
    voltricsSimulator.setSpeed(intervalMs);
  }

  /**
   * Stop active streaming services
   */
  private stopHardwareStreams(): void {
    usageHistory.resetInterval();
    voltraLanGateway.stop();
    voltricsSimulator.stop();
    esp32Api.stopStreaming();
    blynkApi.stopPolling();
    if (this.serialPort) {
      try {
        this.serialPort.close();
      } catch {}
      this.serialPort = null;
    }
    if (voltricsBle.isConnected()) {
      voltricsBle.disconnect();
    }
  }
}

// Global Singleton Core
export const voltricsStoreCore = new VoltricsStoreCore();

/**
 * React Hook for binding any Voltrics component to real-time telemetry state
 */
export function useVoltricsStore(): VoltricsState & {
  setOperatingMode: (mode: OperatingMode) => void;
  toggleCircuit: (circuitId: string, targetState?: 'OPEN' | 'CLOSED') => Promise<boolean>;
  initSimulation: () => void;
  setSimulationSpeed: (intervalMs: number) => void;
  connectBle: () => Promise<boolean>;
  connectWifi: (ip?: string) => Promise<boolean>;
  disconnectWifi: () => void;
  connectBlynk: (token?: string) => Promise<boolean>;
  disconnectBlynk: () => void;
  connectSerial: () => Promise<boolean>;
  disconnectSerial: () => void;
  provisionWifiViaBle: (ssid: string, pass: string) => Promise<void>;
  setTariff: (rate: number, currency?: 'USD' | 'INR') => void;
  exportCsv: () => void;
  exportAuditJson: () => Promise<void>;
  triggerTestSpike: () => void;
  clearTestSpike: () => void;
  ingestTelemetry: (snapshot: TelemetrySnapshot) => void;
  ingestRawEsp32Line: (line: string) => boolean;
  ingestRawEsp32Batch: (rawText: string) => number;
} {
  const state = useSyncExternalStore(
    (onStoreChange) => voltricsStoreCore.subscribe(onStoreChange),
    () => voltricsStoreCore.getState(),
    () => voltricsStoreCore.getState() // SSR snapshot
  );

  return {
    ...state,
    setOperatingMode: (mode: OperatingMode) => voltricsStoreCore.setOperatingMode(mode),
    toggleCircuit: (circuitId: string, targetState?: 'OPEN' | 'CLOSED') =>
      voltricsStoreCore.toggleCircuit(circuitId, targetState),
    initSimulation: () => voltricsStoreCore.initSimulation(),
    setSimulationSpeed: (intervalMs: number) =>
      voltricsStoreCore.setSimulationSpeed(intervalMs),
    connectBle: () => voltricsStoreCore.connectBle(),
    connectWifi: (ip?: string) => voltricsStoreCore.connectWifi(ip),
    disconnectWifi: () => voltricsStoreCore.disconnectWifi(),
    connectBlynk: (token?: string) => voltricsStoreCore.connectBlynk(token),
    disconnectBlynk: () => voltricsStoreCore.disconnectBlynk(),
    connectSerial: () => voltricsStoreCore.connectSerial(),
    disconnectSerial: () => voltricsStoreCore.disconnectSerial(),
    provisionWifiViaBle: (ssid: string, pass: string) =>
      voltricsStoreCore.provisionWifiViaBle(ssid, pass),
    setTariff: (rate: number, currency?: 'USD' | 'INR') =>
      voltricsStoreCore.setTariff(rate, currency),
    exportCsv: () => {
      voltricsStorage.exportTelemetryCsv(state.recentHistory);
    },
    exportAuditJson: async () => {
      const events = await voltricsStorage.getTripEvents();
      voltricsStorage.exportAuditJson(events, {
        connectionState: state.connectionState,
        deviceMetadata: state.deviceMetadata,
      });
    },
    triggerTestSpike: () => {
      voltricsSimulator.injectOverloadSpike('c1', 2.5);
    },
    clearTestSpike: () => {
      voltricsSimulator.clearOverloadSpike();
    },
    ingestTelemetry: (snapshot: TelemetrySnapshot) => {
      voltricsStoreCore.ingestTelemetry(snapshot);
    },
    ingestRawEsp32Line: (line: string) =>
      voltricsStoreCore.ingestRawEsp32Line(line),
    ingestRawEsp32Batch: (rawText: string) =>
      voltricsStoreCore.ingestRawEsp32Batch(rawText),
  };
}

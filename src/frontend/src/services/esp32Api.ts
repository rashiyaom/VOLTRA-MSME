/**
 * esp32Api.ts
 * High-performance REST and WebSocket Client for Voltrics ESP32 Energy Monitor.
 * Provides dynamic mDNS / IP discovery, high-frequency 5Hz-10Hz telemetry streaming,
 * graceful fallback to HTTP polling (1-3s), and strict <=2000ms timeout circuit actuation.
 */

import { normalizeGatewayEndpoint } from './websiteLanGateway';
import { readBlynkToken } from '@/lib/blynkSettings';

export interface CircuitTelemetry {
  id: string;
  name: string;
  state: 'OPEN' | 'CLOSED' | 'TRIPPED';
  current: number;
  rated: number;
}

export interface RawEsp32Reading {
  timeStr: string;
  voltage: number;
  loads?: number[];
  load1: number;
  load2: number;
  totalCurrent: number;
  power1Watts: number;
  power2Watts: number;
  totalPowerWatts: number;
  totalPowerKw: number;
  costPerHourInr: number;
}

export interface TelemetrySnapshot {
  timestamp: number;
  voltage_rms: number;
  current_rms: number;
  active_power: number;
  apparent_power: number;
  power_factor: number;
  frequency: number;
  rawTime?: string;
  load1?: number;
  load2?: number;
  power1?: number;
  power2?: number;
  energy1?: number;
  energy2?: number;
  total_energy?: number;
  cost1?: number;
  cost2?: number;
  total_cost?: number;
  power_mode?: string;
  valid?: boolean;
  circuits: CircuitTelemetry[];
}

/**
 * Parses raw text lines emitted by ESP32 via Serial (UART), WebSocket, or HTTP.
 * Matches format:
 * Time           Voltage (V)    Load 1 (A)    Load 2 (A)
 * 20:19:27.881   197.35         0.029         0.252
 * 20:19:45.003   1.41           0.005         0.005
 * Also gracefully handles calibration/empty lines like "20:19:26.204* — — —"
 */
export function parseEsp32RawLine(line: string, tariffRate = 7.5): RawEsp32Reading | null {
  if (!line) return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Support "Voltage: 197.4 V" and "Current: 0.28 A"
  const voltMatch = trimmed.match(/Voltage:\s*([\d.]+)/i);
  const currMatch = trimmed.match(/Current:\s*([\d.]+)/i);
  if (voltMatch || currMatch) {
    const voltage = voltMatch ? parseFloat(voltMatch[1]) : 0;
    const current = currMatch ? parseFloat(currMatch[1]) : 0;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const totalCurrent = current;
    const power1Watts = Number((voltage * current).toFixed(2));
    const power2Watts = 0;
    const totalPowerWatts = power1Watts;
    const totalPowerKw = Number((totalPowerWatts / 1000).toFixed(4));
    const costPerHourInr = Number((totalPowerKw * tariffRate).toFixed(3));
    return {
      timeStr,
      voltage,
      loads: [current],
      load1: current,
      load2: 0,
      totalCurrent,
      power1Watts,
      power2Watts,
      totalPowerWatts,
      totalPowerKw,
      costPerHourInr,
    };
  }

  // Skip pure headers or comments
  if (/^(Time\t|Voltage\t|Load\t|#|\/\/)/i.test(trimmed)) {
    return null;
  }

  // Tokenize by tabs, commas, or whitespace
  let tokens: string[] = [];
  if (trimmed.includes('\t')) {
    tokens = trimmed.split('\t').map((s) => s.trim()).filter(Boolean);
  } else if (trimmed.includes(',')) {
    tokens = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    tokens = trimmed.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  }

  if (tokens.length < 3) return null;

  let timeStr = '';
  let vStr = '';
  let loadTokens: string[] = [];

  // Check if first token is a timestamp (contains ':' or ends with '*')
  if (tokens[0].includes(':') || tokens[0].includes('*')) {
    timeStr = tokens[0].replace('*', '');
    vStr = tokens[1] ?? '';
    loadTokens = tokens.slice(2);
  } else {
    const now = new Date();
    timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    vStr = tokens[0] ?? '';
    loadTokens = tokens.slice(1);
  }

  const cleanNum = (val: string): number => {
    if (!val || val === '—' || val === '-' || val === '–' || val.toLowerCase() === 'nan' || val.toLowerCase() === 'null') {
      return 0;
    }
    const parsed = parseFloat(val.replace(/[^\d.-]/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  };

  const voltage = cleanNum(vStr);
  const loads = loadTokens.map(cleanNum);
  const load1 = loads[0] ?? 0;
  const load2 = loads[1] ?? 0;

  const totalCurrent = Number(loads.reduce((acc, curr) => acc + curr, 0).toFixed(4));
  const power1Watts = Number((voltage * load1).toFixed(2));
  const power2Watts = Number((voltage * load2).toFixed(2));
  const powers = loads.map((l) => Number((voltage * l).toFixed(2)));
  const totalPowerWatts = Number(powers.reduce((acc, p) => acc + p, 0).toFixed(2));
  const totalPowerKw = Number((totalPowerWatts / 1000).toFixed(4));
  const costPerHourInr = Number((totalPowerKw * tariffRate).toFixed(3));

  return {
    timeStr,
    voltage,
    loads,
    load1,
    load2,
    totalCurrent,
    power1Watts,
    power2Watts,
    totalPowerWatts,
    totalPowerKw,
    costPerHourInr,
  };
}

export function rawReadingToTelemetrySnapshot(reading: RawEsp32Reading): TelemetrySnapshot {
  const dynamicLoads = reading.loads && reading.loads.length > 0
    ? reading.loads
    : reading.load2 !== undefined && reading.load2 > 0
    ? [reading.load1, reading.load2]
    : [reading.load1];

  const circuits: CircuitTelemetry[] = dynamicLoads.map((current, idx) => ({
    id: `c${idx + 1}`,
    name: `Load ${idx + 1} (CT Sensor ${idx + 1})`,
    state: current > 0 ? 'CLOSED' : 'OPEN',
    current,
    rated: 16.0,
  }));

  return {
    timestamp: Math.floor(Date.now() / 1000),
    voltage_rms: reading.voltage,
    current_rms: reading.totalCurrent,
    active_power: reading.totalPowerWatts,
    apparent_power: reading.totalPowerWatts > 0 ? Number((reading.voltage * reading.totalCurrent).toFixed(2)) : 0,
    power_factor: 0.98,
    frequency: 50.0,
    rawTime: reading.timeStr,
    load1: reading.load1,
    load2: reading.load2,
    power1: reading.power1Watts,
    power2: reading.power2Watts,
    circuits,
  };
}

/**
 * Universal ESP32 Telemetry Parser
 * Accepts string (raw lines, JSON, CSV) or JS object and normalizes to TelemetrySnapshot
 */
export function parseEsp32Payload(payload: any, tariffRate = 7.5): TelemetrySnapshot | null {
  if (!payload) return null;

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;

    // Try parsing as JSON first
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const obj = JSON.parse(trimmed);
        return parseEsp32Payload(obj, tariffRate);
      } catch {
        // Fall back to line parser
      }
    }

    // Parse as raw line
    const reading = parseEsp32RawLine(trimmed, tariffRate);
    return reading ? rawReadingToTelemetrySnapshot(reading) : null;
  }

  if (typeof payload === 'object') {
    // Check if it's already a full TelemetrySnapshot
    if ('circuits' in payload && 'voltage_rms' in payload) {
      const snap = { ...payload } as TelemetrySnapshot;
      if (snap.load1 === undefined && snap.circuits?.[0]) {
        snap.load1 = snap.circuits[0].current;
      }
      if (snap.load2 === undefined && snap.circuits?.[1]) {
        snap.load2 = snap.circuits[1].current;
      }
      if (snap.power1 === undefined && snap.load1 !== undefined) {
        snap.power1 = Number(((snap.voltage_rms || 0) * snap.load1).toFixed(2));
      }
      if (snap.power2 === undefined && snap.load2 !== undefined) {
        snap.power2 = Number(((snap.voltage_rms || 0) * snap.load2).toFixed(2));
      }
      return snap;
    }

    // Support Blynk IoT Cloud multi-pin JSON: { v0: 0.199, v1: 2.268 }
    const blynkCurrent = payload.v0 ?? payload.V0 ?? null;
    const blynkVoltage = payload.v1 ?? payload.V1 ?? null;
    const blynkLoad2 = payload.v2 ?? payload.V2 ?? null;
    const blynkRelay1 = payload.v3 ?? payload.V3 ?? null;
    const blynkRelay2 = payload.v4 ?? payload.V4 ?? null;

    const voltage = Number(
      payload.voltage ??
      blynkVoltage ??
      payload.voltage_rms ??
      payload['Voltage (V)'] ??
      payload['Voltage'] ??
      payload.V ??
      0
    );

    const load1 = Number(
      payload.current1 ??
      blynkCurrent ??
      payload.load1 ??
      payload['Load 1 (A)'] ??
      payload['Load 1'] ??
      payload.load_1 ??
      payload.load_1_a ??
      (payload.circuits?.[0]?.current ?? 0)
    );

    const load2 = Number(
      payload.current2 ??
      blynkLoad2 ??
      payload.load2 ??
      payload['Load 2 (A)'] ??
      payload['Load 2'] ??
      payload.load_2 ??
      payload.load_2_a ??
      (payload.circuits?.[1]?.current ?? 0)
    );

    const timeStr = String(payload.time ?? payload.Time ?? payload.timeStr ?? '');

    const hasExplicitLoad2 =
      payload.current2 !== undefined ||
      blynkLoad2 !== null && blynkLoad2 !== undefined ||
      payload.load2 !== undefined ||
      payload['Load 2 (A)'] !== undefined ||
      payload['Load 2'] !== undefined ||
      payload.load_2 !== undefined ||
      payload.load_2_a !== undefined ||
      Boolean(payload.circuits && payload.circuits.length > 1);

    const incomingLoads: number[] = Array.isArray(payload.loads) && payload.loads.length > 0
      ? payload.loads.map(Number)
      : hasExplicitLoad2
      ? [load1, load2]
      : [load1];

    const explicitRelayStates = [blynkRelay1, blynkRelay2];
    const effectiveLoads = incomingLoads.map((curr, idx) => {
      const relayValue = explicitRelayStates[idx];
      return relayValue !== null && relayValue !== undefined && relayValue !== '' && Number(relayValue) !== 1
        ? 0
        : curr;
    });
    const dynamicCircuits: CircuitTelemetry[] = effectiveLoads.map((curr, idx) => {
      const relayValue = explicitRelayStates[idx];
      const hasRelayState = relayValue !== null && relayValue !== undefined && relayValue !== '';
      const relayIsOn = hasRelayState ? Number(relayValue) === 1 : curr > 0;
      return {
        id: `c${idx + 1}`,
        name: `Load ${idx + 1} (CT Sensor ${idx + 1})`,
        state: relayIsOn ? 'CLOSED' : 'OPEN',
        current: relayIsOn ? curr : 0,
        rated: 16.0,
      };
    });

    const effectiveLoad1 = effectiveLoads[0] ?? 0;
    const effectiveLoad2 = effectiveLoads[1] ?? 0;
    const hasExplicitRelayState = explicitRelayStates.some(
      (value) => value !== null && value !== undefined && value !== '',
    );
    const totalCurrent = Number(effectiveLoads.reduce((acc, curr) => acc + curr, 0).toFixed(4));
    const power1 = !hasExplicitRelayState && payload.power1 !== undefined
      ? Number(payload.power1)
      : Number((voltage * effectiveLoad1).toFixed(2));
    const power2 = hasExplicitLoad2
      ? (!hasExplicitRelayState && payload.power2 !== undefined
        ? Number(payload.power2)
        : Number((voltage * effectiveLoad2).toFixed(2)))
      : 0;
    const activePower = !hasExplicitRelayState && payload.total_power !== undefined
      ? Number(payload.total_power)
      : Number(effectiveLoads.map((curr) => Number((voltage * curr).toFixed(2))).reduce((a, b) => a + b, 0).toFixed(2));

    const apparent1 = !hasExplicitRelayState && payload.apparent_power1_va !== undefined ? Number(payload.apparent_power1_va) : Number((voltage * effectiveLoad1).toFixed(2));
    const apparent2 = !hasExplicitRelayState && payload.apparent_power2_va !== undefined ? Number(payload.apparent_power2_va) : Number((voltage * effectiveLoad2).toFixed(2));
    const apparentPower = !hasExplicitRelayState && payload.apparent_power !== undefined
      ? Number(payload.apparent_power)
      : Number((apparent1 + (hasExplicitLoad2 ? apparent2 : 0)).toFixed(2));

    return {
      timestamp: Math.floor(Date.now() / 1000),
      voltage_rms: voltage,
      current_rms: totalCurrent > 0 ? totalCurrent : Number(payload.current_rms ?? 0),
      active_power: activePower > 0 ? activePower : Number(payload.active_power ?? 0),
      apparent_power: apparentPower,
      power_factor: Number(payload.power_factor ?? (apparentPower > 0 ? Math.min(1.0, activePower / apparentPower).toFixed(2) : 0.98)),
      frequency: Number(payload.frequency ?? 50.0),
      rawTime: timeStr || undefined,
      load1: effectiveLoad1,
      load2: hasExplicitLoad2 ? effectiveLoad2 : undefined,
      power1,
      power2: hasExplicitLoad2 ? power2 : undefined,
      energy1: payload.energy1,
      energy2: payload.energy2,
      total_energy: payload.total_energy,
      cost1: payload.cost1,
      cost2: payload.cost2,
      total_cost: payload.total_cost,
      power_mode: payload.power_mode,
      valid: payload.valid,
      circuits: payload.circuits || dynamicCircuits,
    };
  }

  return null;
}

/**
 * Blynk IoT Cloud REST API Client
 * Directly streams telemetry from ESP32 via Blynk Cloud virtual pins V0 (Current) & V1 (Voltage)
 */
export class BlynkApiClient {
  private activeToken: string = '';
  private pollTimer: any = null;
  private isPolling: boolean = false;

  constructor(token?: string) {
    if (token) {
      this.activeToken = token;
    }
  }

  public setActiveToken(token: string): void {
    this.activeToken = token.trim();
  }

  public clearActiveToken(): void {
    this.activeToken = '';
  }

  public hasActiveToken(): boolean {
    return this.activeToken.length > 0;
  }

  private requireToken(token?: string): string {
    const resolved = (token || this.activeToken).trim();
    if (!resolved) throw new Error('Enter the Blynk device auth token in Settings.');
    return resolved;
  }

  public async isHardwareConnected(token?: string): Promise<boolean> {
    try {
      const resolvedToken = this.requireToken(token);
      const res = await fetch(`https://blynk.cloud/external/api/isHardwareConnected?token=${encodeURIComponent(resolvedToken)}`);
      if (!res.ok) return false;
      const text = await res.text();
      return text.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  public async setVirtualPin(pin: string, value: any, token?: string): Promise<boolean> {
    try {
      const resolvedToken = this.requireToken(token);
      const cleanPin = pin.toLowerCase().startsWith('v') ? pin.toLowerCase() : `v${pin}`;
      const res = await fetch(`https://blynk.cloud/external/api/update?token=${encodeURIComponent(resolvedToken)}&${cleanPin}=${encodeURIComponent(value)}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async fetchTelemetry(token?: string): Promise<{
    voltage: number;
    current: number;
    load2?: number;
    relay1?: number;
    relay2?: number;
  } | null> {
    try {
      const resolvedToken = this.requireToken(token);
      const res = await fetch(`https://blynk.cloud/external/api/get?token=${encodeURIComponent(resolvedToken)}&v0&v1&v2&v3&v4`);
      if (!res.ok) {
        // Older templates may expose telemetry only. Relay controls require V3 and V4.
        const resBasic = await fetch(`https://blynk.cloud/external/api/get?token=${encodeURIComponent(resolvedToken)}&v0&v1&v2`);
        if (!resBasic.ok) return null;
        const dataBasic = await resBasic.json();
        const current = typeof dataBasic.v0 === 'number' ? dataBasic.v0 : parseFloat(dataBasic.v0 || '0');
        const voltage = typeof dataBasic.v1 === 'number' ? dataBasic.v1 : parseFloat(dataBasic.v1 || '0');
        return { voltage, current };
      }
      const data = await res.json();
      const current = typeof data.v0 === 'number' ? data.v0 : parseFloat(data.v0 || '0');
      const voltage = typeof data.v1 === 'number' ? data.v1 : parseFloat(data.v1 || '0');
      const hasV2 = data.v2 !== undefined && data.v2 !== null && data.v2 !== '';
      const load2 = hasV2 ? (typeof data.v2 === 'number' ? data.v2 : parseFloat(data.v2)) : undefined;
      const relay1 = data.v3 !== undefined && data.v3 !== null && data.v3 !== '' ? Number(data.v3) : undefined;
      const relay2 = data.v4 !== undefined && data.v4 !== null && data.v4 !== '' ? Number(data.v4) : undefined;
      return { voltage, current, load2, relay1, relay2 };
    } catch {
      return null;
    }
  }

  public startPolling(
    onReading: (snapshot: TelemetrySnapshot) => void,
    token?: string,
    intervalMs = 2000
  ): void {
    this.stopPolling();
    this.isPolling = true;

    const tick = async () => {
      const data = await this.fetchTelemetry(token);
      if (data) {
        const payloadObj: any = {
          v0: data.current,
          v1: data.voltage,
        };
        if (data.load2 !== undefined) {
          payloadObj.v2 = data.load2;
        }
        if (data.relay1 !== undefined) payloadObj.v3 = data.relay1;
        if (data.relay2 !== undefined) payloadObj.v4 = data.relay2;
        const snap = parseEsp32Payload(payloadObj);
        if (snap) onReading(snap);
      }
    };

    tick();
    this.pollTimer = setInterval(tick, intervalMs);
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
  }

  public getIsPolling(): boolean {
    return this.isPolling;
  }
}

export const blynkApi = new BlynkApiClient(readBlynkToken());

export interface DeviceStatus {
  status: 'ONLINE' | 'DEGRADED' | 'OVERLOAD' | 'OFFLINE';
  rssi: number; // dBm
  free_heap: number; // bytes
  uptime: number; // seconds
  firmware: string;
}

export interface CircuitTogglePayload {
  circuitId: string;
  targetState: 'OPEN' | 'CLOSED';
}

export interface CircuitToggleResponse {
  success: boolean;
  circuitId: string;
  state: 'OPEN' | 'CLOSED' | 'TRIPPED';
  message?: string;
}

export class Esp32ApiClient {
  private baseUrl: string = 'http://voltra.local';
  private ws: WebSocket | null = null;
  private wsConnected: boolean = false;
  private pollingTimer: any = null;
  private wsReconnectTimer: any = null;
  private pollingIntervalMs: number = 1000;
  private onTelemetryCallback: ((data: TelemetrySnapshot) => void) | null = null;
  private onStatusChangeCallback: ((connected: boolean, transport: 'WS' | 'HTTP' | 'NONE') => void) | null = null;

  constructor(initialBaseUrl?: string) {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('voltrics_esp32_base_url');
      if (saved) {
        this.baseUrl = this.normalizeUrl(saved);
      } else if (initialBaseUrl) {
        this.baseUrl = this.normalizeUrl(initialBaseUrl);
      }
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string): void {
    try {
      this.baseUrl = normalizeGatewayEndpoint(url);
    } catch {
      this.baseUrl = this.normalizeUrl(url);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('voltrics_esp32_base_url', this.baseUrl);
      localStorage.setItem('voltra.gateway.endpoint', this.baseUrl);
    }
    // If active, reconnect streaming with new address
    if (this.onTelemetryCallback) {
      this.reconnect();
    }
  }

  private normalizeUrl(url: string): string {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, '');
  }

  private getWsUrl(): string {
    const wsProto = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    return `${wsProto}://${host}/api/v1/stream`;
  }

  /**
   * Helper fetch with timeout and browser local network permission support
   */
  private async fetchWithTimeout(endpoint: string, options: RequestInit = {}, timeoutMs = 2500): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions: any = {
        ...options,
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        targetAddressSpace: 'local',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      };
      const res = await (fetch as any)(`${this.baseUrl}${endpoint}`, fetchOptions);
      clearTimeout(timeoutId);
      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request to ${endpoint} timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  /**
   * GET /api/readings
   * Instant snapshot of grid readings as per VOLTRA firmware spec
   */
  public async getTelemetry(): Promise<TelemetrySnapshot> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout('/api/readings', { method: 'GET' }, 2500);
    } catch {
      try {
        response = await this.fetchWithTimeout('/api/data', { method: 'GET' }, 2500);
      } catch {
        response = await this.fetchWithTimeout('/readings', { method: 'GET' }, 2500);
      }
    }
    if (!response.ok) {
      throw new Error(`Telemetry request failed: HTTP ${response.status}`);
    }
    const json = await response.json();
    const snap = parseEsp32Payload(json);
    if (!snap) {
      throw new Error('Could not parse telemetry payload from /api/readings');
    }
    return snap;
  }

  /**
   * POST /api/v1/circuits/toggle
   * Strict 2000ms max timeout for actuation
   */
  public async toggleCircuit(circuitId: string, targetState: 'OPEN' | 'CLOSED'): Promise<CircuitToggleResponse> {
    const payload: CircuitTogglePayload = { circuitId, targetState };
    const response = await this.fetchWithTimeout(
      '/api/v1/circuits/toggle',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      2000
    );

    if (!response.ok) {
      throw new Error(`Actuation failed on circuit ${circuitId}: HTTP ${response.status}`);
    }

    return (await response.json()) as CircuitToggleResponse;
  }

  /**
   * GET /api/ping
   * Ping / connect check to test connection latency & device identification
   */
  public async getStatus(): Promise<DeviceStatus> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout('/api/ping', { method: 'GET' }, 2500);
    } catch {
      try {
        response = await this.fetchWithTimeout('/ping', { method: 'GET' }, 2500);
      } catch {
        response = await this.fetchWithTimeout('/health', { method: 'GET' }, 2500);
      }
    }
    if (!response.ok) {
      throw new Error(`Device ping check failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.device !== 'VOLTRA' || data.api_version !== 1 || data.ok !== true) {
      throw new Error('Endpoint does not expose the VOLTRA gateway API v1.');
    }
    return {
      status: 'ONLINE',
      rssi: data.wifi?.rssi ?? -54,
      free_heap: data.free_heap ?? 184320,
      uptime: data.uptime_ms ? Math.floor(data.uptime_ms / 1000) : 3600,
      firmware: `v${data.api_version ?? 1}.0`,
    };
  }

  /**
   * Ping check to test connection latency via GET /api/ping
   */
  public async ping(): Promise<{ ok: boolean; latencyMs: number; status?: DeviceStatus }> {
    const start = performance.now();
    try {
      const status = await this.getStatus();
      const latencyMs = Math.round(performance.now() - start);
      return { ok: true, latencyMs, status };
    } catch (e) {
      return { ok: false, latencyMs: -1 };
    }
  }

  /**
   * Start high-speed telemetry streaming.
   * Attempts WebSocket (/api/v1/stream) pushing 5Hz-10Hz.
   * If WebSocket fails or disconnects, gracefully falls back to HTTP polling.
   */
  public startStreaming(
    onTelemetry: (data: TelemetrySnapshot) => void,
    onStatusChange?: (connected: boolean, transport: 'WS' | 'HTTP' | 'NONE') => void
  ): void {
    this.onTelemetryCallback = onTelemetry;
    if (onStatusChange) this.onStatusChangeCallback = onStatusChange;
    this.connectWs();
  }

  /**
   * Stop all active streaming / polling sessions
   */
  public stopStreaming(): void {
    this.stopPolling();
    this.closeWs();
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(false, 'NONE');
    }
  }

  private connectWs(): void {
    if (typeof window === 'undefined') return;

    this.closeWs();
    const wsUrl = this.getWsUrl();

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.wsConnected = true;
        this.stopPolling(); // Stop HTTP polling when WS is live
        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(true, 'WS');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const snapshot = parseEsp32Payload(event.data);
          if (snapshot && this.onTelemetryCallback) {
            this.onTelemetryCallback(snapshot);
          }
        } catch (err) {
          console.warn('Invalid WS telemetry frame format:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket stream connection error, falling back to HTTP polling:', err);
        this.fallbackToPolling();
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this.fallbackToPolling();
        // Schedule WS reconnect attempt after 5 seconds
        if (!this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            if (this.onTelemetryCallback && !this.wsConnected) {
              this.connectWs();
            }
          }, 5000);
        }
      };
    } catch (e) {
      console.warn('Failed to construct WebSocket, using HTTP polling fallback:', e);
      this.fallbackToPolling();
    }
  }

  private fallbackToPolling(): void {
    if (this.pollingTimer) return; // already polling

    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(true, 'HTTP');
    }

    const poll = async () => {
      try {
        const data = await this.getTelemetry();
        if (this.onTelemetryCallback) {
          this.onTelemetryCallback(data);
        }
        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(true, 'HTTP');
        }
      } catch (err) {
        if (this.onStatusChangeCallback) {
          this.onStatusChangeCallback(false, 'NONE');
        }
      }
    };

    // Immediate first tick
    poll();
    this.pollingTimer = setInterval(poll, this.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  private closeWs(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
      this.wsConnected = false;
    }
  }

  private reconnect(): void {
    this.stopStreaming();
    if (this.onTelemetryCallback) {
      this.startStreaming(this.onTelemetryCallback, this.onStatusChangeCallback || undefined);
    }
  }
}

export const esp32Api = new Esp32ApiClient();


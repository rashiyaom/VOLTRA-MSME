/**
 * websiteLanGateway.ts
 * Browser-side LAN Gateway adapter for VOLTRA firmware.
 * Directly integrates with:
 *   - GET /api/ping (Ping / connect health check)
 *   - GET /api/readings (Cached graph measurements & estimated energy/cost)
 *
 * Implements normalizeGatewayEndpoint and VoltraLanGateway from website-lan-gateway.mjs
 */

import type { TelemetrySnapshot, CircuitTelemetry } from './esp32Api';

export interface VoltraLanReading {
  device: string;
  api_version: number;
  voltage: number;
  current1: number;
  current2: number;
  apparent_power1_va?: number;
  apparent_power2_va?: number;
  power1?: number;
  power2?: number;
  total_power?: number;
  energy1?: number;
  energy2?: number;
  total_energy?: number;
  cost1?: number;
  cost2?: number;
  total_cost?: number;
  power_mode?: string;
  valid: boolean;
  noise_calibrated?: boolean;
  calibrating?: boolean;
  energy_ready?: boolean;
  age_ms?: number;
  sequence?: number;
  uptime_ms?: number;
  sample_uptime_ms?: number;
  sensor_rms_v?: number[];
  sensor_centre_v?: number[];
  noise_rms_v?: number[];
  clipping_mask?: number;
  missed_ticks?: number;
  window_us?: number;
  unmeasured_seconds?: number;
  received_at_ms?: number;
  source?: string;
}

export interface VoltraLanPingResponse {
  device: string;
  api_version: number;
  ok: boolean;
  latency_ms?: number;
  ip?: string;
  uptime_ms?: number;
  wifi?: {
    connected?: boolean;
    ssid?: string;
    rssi?: number;
  };
  blynk?: {
    connected?: boolean;
    enabled?: boolean;
  };
  [key: string]: any;
}

export interface VoltraLanStatus {
  connected: boolean;
  state: 'connecting' | 'connected' | 'sensor_warning' | 'calibration_required' | 'calibrating' | 'disconnected';
  message: string;
  health?: VoltraLanPingResponse;
  error?: any;
}

export function normalizeGatewayEndpoint(input: string | undefined | null): string {
  let text = String(input ?? '').trim();
  if (!text) throw new Error('Enter the ESP32 IP address or .local hostname.');
  if (!/^https?:\/\//i.test(text)) text = 'http://' + text;
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP endpoint without login credentials.');
  const knownPaths = ['/', '/api/readings', '/api/data', '/readings', '/data', '/api/ping', '/ping', '/health'];
  if (!knownPaths.includes(url.pathname.replace(/\/$/, '') || '/'))
    throw new Error('Enter the device base URL, such as http://192.168.1.50.');
  if (url.search || url.hash)
    throw new Error('Use the device address without query parameters or a fragment.');
  return url.origin;
}

export class VoltraLanGateway {
  public onData: (data: VoltraLanReading) => void;
  public onStatus: (status: VoltraLanStatus) => void;
  public intervalMs: number;
  public timeoutMs: number;
  public storageKey: string;
  public endpoint: string;
  private timer: any = null;
  private controller: AbortController | null = null;
  private generation: number = 0;

  constructor({
    onData = () => {},
    onStatus = () => {},
    intervalMs = 1000,
    timeoutMs = 4000,
    storageKey = 'voltra.gateway.endpoint',
  }: {
    onData?: (data: VoltraLanReading) => void;
    onStatus?: (status: VoltraLanStatus) => void;
    intervalMs?: number;
    timeoutMs?: number;
    storageKey?: string;
  } = {}) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.intervalMs = Math.max(500, intervalMs);
    this.timeoutMs = timeoutMs;
    this.storageKey = storageKey;
    this.endpoint = '';
    try {
      if (typeof localStorage !== 'undefined') {
        this.endpoint = localStorage.getItem(storageKey) || localStorage.getItem('voltrics_esp32_base_url') || '';
      }
    } catch {}
  }

  public saveEndpoint(input: string): string {
    this.endpoint = normalizeGatewayEndpoint(input);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, this.endpoint);
        localStorage.setItem('voltrics_esp32_base_url', this.endpoint);
      }
    } catch {}
    return this.endpoint;
  }

  public async requestJSON(path: string): Promise<any> {
    if (!this.endpoint) throw new Error('Save an ESP32 endpoint first.');
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const fetchOptions: any = {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
        targetAddressSpace: 'local',
      };
      const response = await fetch(this.endpoint + path, fetchOptions);
      if (!response.ok) throw new Error('Gateway HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  /**
   * Ping / Connect check: GET /api/ping
   */
  public async ping(): Promise<VoltraLanPingResponse> {
    const started = performance.now();
    let result: any;
    try {
      result = await this.requestJSON('/api/ping');
    } catch (e) {
      // Fallback aliases if gateway firmware routed /ping or /health
      try {
        result = await this.requestJSON('/ping');
      } catch {
        result = await this.requestJSON('/health');
      }
    }

    if (result.device !== 'VOLTRA' || result.api_version !== 1 || result.ok !== true) {
      throw new Error('This endpoint does not expose the VOLTRA gateway API v1.');
    }
    return { ...result, latency_ms: Math.round(performance.now() - started) };
  }

  public async connect(input: string = this.endpoint): Promise<VoltraLanPingResponse | undefined> {
    this.stop();
    const generation = this.generation;
    if (input) {
      this.saveEndpoint(input);
    }
    this.onStatus({ connected: false, state: 'connecting', message: 'Checking ESP32 gateway...' });
    try {
      const health = await this.ping();
      if (generation !== this.generation) return;
      this.onStatus({ connected: true, state: 'connected', message: 'Connected to ESP32', health });
      await this.poll(generation);
      return health;
    } catch (error) {
      if (generation !== this.generation) return;
      this.reportFailure(error);
      throw error;
    }
  }

  /**
   * Fetch graph readings: GET /api/readings
   */
  public async poll(generation: number): Promise<void> {
    if (generation !== this.generation) return;
    try {
      let data: any;
      try {
        data = await this.requestJSON('/api/readings');
      } catch (err) {
        // Fallback to readings aliases if needed
        data = await this.requestJSON('/api/data');
      }

      if (generation !== this.generation) return;
      if (
        (data.device !== 'VOLTRA' && data.api_version !== 1) ||
        ![data.voltage, data.current1, data.current2].every(Number.isFinite)
      ) {
        throw new Error('Unexpected gateway readings schema.');
      }

      this.onData({ ...data, received_at_ms: Date.now(), source: 'lan' });

      const state: VoltraLanStatus['state'] = !data.valid
        ? 'sensor_warning'
        : !data.noise_calibrated
        ? 'calibration_required'
        : data.calibrating
        ? 'calibrating'
        : 'connected';

      const message =
        state === 'sensor_warning'
          ? 'Gateway connected; sensor/timing warning'
          : state === 'calibration_required'
          ? 'Connected; no-load calibration required'
          : state === 'calibrating'
          ? 'Connected; calibrating sensors'
          : 'Connected to ESP32';

      this.onStatus({ connected: true, state, message });
    } catch (error) {
      if (generation !== this.generation) return;
      this.reportFailure(error);
    }

    if (generation === this.generation) {
      this.timer = setTimeout(() => this.poll(generation), this.intervalMs);
    }
  }

  public reportFailure(error: any): void {
    this.onStatus({
      connected: false,
      state: 'disconnected',
      error,
      message: 'Cannot reach ESP32. Check the address, local Wi-Fi, browser local-network permission, and website CSP.',
    });
  }

  public stop(): void {
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }
}

/**
 * Maps incoming VoltraLanReading from GET /api/readings directly into TelemetrySnapshot
 */
export function lanReadingToTelemetrySnapshot(
  data: VoltraLanReading,
  tariffRate = 7.5
): TelemetrySnapshot {
  const voltage = data.voltage;
  const load1 = data.current1;
  const load2 = data.current2;
  const totalCurrent = Number((load1 + load2).toFixed(4));

  const power1 = data.power1 !== undefined ? data.power1 : Number((voltage * load1).toFixed(2));
  const power2 = data.power2 !== undefined ? data.power2 : Number((voltage * load2).toFixed(2));
  const activePower = data.total_power !== undefined ? data.total_power : Number((power1 + power2).toFixed(2));

  const app1 = data.apparent_power1_va ?? Number((voltage * load1).toFixed(2));
  const app2 = data.apparent_power2_va ?? Number((voltage * load2).toFixed(2));
  const apparentPower = Number((app1 + app2).toFixed(2));

  const d = new Date(data.received_at_ms || Date.now());
  const rawTime = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  const circuits: CircuitTelemetry[] = [
    {
      id: 'c1',
      name: 'Load 1 (CT Sensor 1)',
      state: load1 > 0 ? 'CLOSED' : 'OPEN',
      current: load1,
      rated: 16.0,
    },
    {
      id: 'c2',
      name: 'Load 2 (CT Sensor 2)',
      state: load2 > 0 ? 'CLOSED' : 'OPEN',
      current: load2,
      rated: 16.0,
    },
  ];

  return {
    timestamp: Math.floor((data.received_at_ms || Date.now()) / 1000),
    voltage_rms: voltage,
    current_rms: totalCurrent,
    active_power: activePower,
    apparent_power: apparentPower,
    power_factor: apparentPower > 0 ? Number(Math.min(1.0, activePower / apparentPower).toFixed(2)) : 0.98,
    frequency: 50.0,
    rawTime,
    load1,
    load2,
    power1,
    power2,
    energy1: data.energy1,
    energy2: data.energy2,
    total_energy: data.total_energy,
    cost1: data.cost1,
    cost2: data.cost2,
    total_cost: data.total_cost,
    power_mode: data.power_mode,
    valid: data.valid,
    circuits,
  };
}

export const voltraLanGateway = new VoltraLanGateway();

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoltricsSimulator } from './simulator';
import { voltricsStoreCore } from '../stores/useVoltricsStore';

describe('Voltrics Hardware & Simulation Layer', () => {
  let sim: VoltricsSimulator;

  beforeEach(() => {
    sim = new VoltricsSimulator();

    // Mock localStorage in Node/Vitest environment if needed
    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.getItem) {
      const storage: Record<string, string> = {};
      globalThis.localStorage = {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => { storage[k] = v; },
        removeItem: (k: string) => { delete storage[k]; },
        clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
        length: 0,
        key: () => null,
      } as any;
    }
  });

  it('generates realistic physical electrical telemetry within operational bounds', () => {
    const frame = sim.generateSnapshot();

    // Voltage RMS should fluctuate around nominal 197V (Indian standard / ESP32 hardware)
    expect(frame.voltage_rms).toBeGreaterThanOrEqual(190);
    expect(frame.voltage_rms).toBeLessThanOrEqual(240);

    // Frequency should remain close to 50.00 Hz (statutory limits)
    expect(frame.frequency).toBeGreaterThanOrEqual(49.8);
    expect(frame.frequency).toBeLessThanOrEqual(50.2);

    // Power factor between 0.95 and 1.00
    expect(frame.power_factor).toBeGreaterThanOrEqual(0.95);
    expect(frame.power_factor).toBeLessThanOrEqual(1.0);

    // Active power <= Apparent power (P = S * PF)
    expect(frame.active_power).toBeLessThanOrEqual(frame.apparent_power + 1);

    // Circuits should have valid entries
    expect(frame.circuits.length).toBeGreaterThanOrEqual(5);
    expect(frame.circuits[0].name).toContain('Load 1');
  });

  it('correctly toggles circuit states and zeros amperage when opened', () => {
    // Initially closed with current
    const initial = sim.generateSnapshot();
    const c1Initial = initial.circuits.find((c) => c.id === 'c1');
    expect(c1Initial?.state).toBe('CLOSED');
    expect(c1Initial?.current).toBeGreaterThan(0);

    // Toggle c1 to OPEN
    sim.toggleCircuit('c1', 'OPEN');
    const updated = sim.generateSnapshot();
    const c1Updated = updated.circuits.find((c) => c.id === 'c1');
    expect(c1Updated?.state).toBe('OPEN');
    expect(c1Updated?.current).toBe(0);

    // Re-close c1
    sim.toggleCircuit('c1', 'CLOSED');
    const closedAgain = sim.generateSnapshot();
    const c1Closed = closedAgain.circuits.find((c) => c.id === 'c1');
    expect(c1Closed?.state).toBe('CLOSED');
    expect(c1Closed?.current).toBeGreaterThan(0);
  });

  it('detects sustained overcurrent (>3 consecutive ticks) and triggers Overload Guardian', () => {
    // Ingest a frame where circuit c1 current exceeds rated capacity (16A)
    const rated = 16.0;
    const overloadedAmps = 24.5;

    const baseFrame = sim.generateSnapshot();
    const testFrame = {
      ...baseFrame,
      circuits: baseFrame.circuits.map((c) =>
        c.id === 'c1' ? { ...c, current: overloadedAmps, rated } : c
      ),
    };

    // Ticks 1 to 3: Overload accumulator increments
    voltricsStoreCore.ingestTelemetry(testFrame);
    voltricsStoreCore.ingestTelemetry(testFrame);
    voltricsStoreCore.ingestTelemetry(testFrame);

    let state = voltricsStoreCore.getState();
    expect(state.overloadState.consecutiveTicks['c1']).toBe(3);
    expect(state.overloadState.isOverloaded).toBe(false);

    // Tick 4: > 3 consecutive ticks triggers CRITICAL_OVERLOAD
    voltricsStoreCore.ingestTelemetry(testFrame);
    state = voltricsStoreCore.getState();
    expect(state.overloadState.isOverloaded).toBe(true);
    expect(state.overloadState.criticalCircuits).toContain('c1');
  });

  it('accurately parses ESP32 4-column telemetry and computes formulas', async () => {
    const { parseEsp32RawLine, parseEsp32Payload } = await import('./esp32Api');

    // 1. Nominal active line
    const line1 = '20:19:27.881\t197.35\t0.029\t0.252';
    const parsed1 = parseEsp32RawLine(line1, 7.5);
    expect(parsed1).not.toBeNull();
    expect(parsed1?.timeStr).toBe('20:19:27.881');
    expect(parsed1?.voltage).toBe(197.35);
    expect(parsed1?.load1).toBe(0.029);
    expect(parsed1?.load2).toBe(0.252);
    // Total Current = Load 1 + Load 2
    expect(parsed1?.totalCurrent).toBe(0.281);
    // P1 = V * I1 = 197.35 * 0.029 = 5.72W
    expect(parsed1?.power1Watts).toBe(5.72);
    // P2 = V * I2 = 197.35 * 0.252 = 49.73W
    expect(parsed1?.power2Watts).toBe(49.73);
    // Total Power = 55.45W
    expect(parsed1?.totalPowerWatts).toBe(55.45);
    // Cost per hour = (55.45 / 1000) * 7.50 = 0.416
    expect(parsed1?.costPerHourInr).toBe(0.416);

    // 2. Disconnected/tripped line
    const line2 = '20:19:45.003\t1.41\t0.005\t0.005';
    const parsed2 = parseEsp32RawLine(line2, 7.5);
    expect(parsed2?.voltage).toBe(1.41);
    expect(parsed2?.load1).toBe(0.005);
    expect(parsed2?.load2).toBe(0.005);
    expect(parsed2?.totalCurrent).toBe(0.01);

    // 3. Calibration / uninitialized line
    const lineCalib = '20:19:26.204*\t—\t—\t—';
    const parsedCalib = parseEsp32RawLine(lineCalib, 7.5);
    expect(parsedCalib?.voltage).toBe(0);
    expect(parsedCalib?.load1).toBe(0);
    expect(parsedCalib?.load2).toBe(0);

    // 4. Blynk Cloud JSON payload { v0: 0.199, v1: 2.268 }
    const blynkPayload = { v0: 0.199, v1: 2.268 };
    const blynkSnap = parseEsp32Payload(blynkPayload);
    expect(blynkSnap).not.toBeNull();
    expect(blynkSnap?.voltage_rms).toBe(2.268);
    expect(blynkSnap?.load1).toBe(0.199);
    expect(blynkSnap?.current_rms).toBe(0.199);

    // 5. Serial Monitor text format "Voltage: 197.4 V"
    const serialLine = 'Voltage: 197.4 V';
    const parsedSerial = parseEsp32RawLine(serialLine);
    expect(parsedSerial?.voltage).toBe(197.4);
  });

  it('uses Blynk V3 and V4 as the authoritative commanded relay states', async () => {
    const { parseEsp32Payload } = await import('./esp32Api');
    const snapshot = parseEsp32Payload({
      v0: 0.4,
      v1: 230,
      v2: 0.8,
      v3: 0,
      v4: 1,
    });

    expect(snapshot?.circuits[0].state).toBe('OPEN');
    expect(snapshot?.circuits[0].current).toBe(0);
    expect(snapshot?.load1).toBe(0);
    expect(snapshot?.circuits[1].state).toBe('CLOSED');
    expect(snapshot?.circuits[1].current).toBe(0.8);
    expect(snapshot?.load2).toBe(0.8);
    expect(snapshot?.current_rms).toBe(0.8);
    expect(snapshot?.active_power).toBe(184);
  });

  it('reads relay feedback and sends relay commands through the configured Blynk token', async () => {
    const { BlynkApiClient } = await import('./esp32Api');
    const client = new BlynkApiClient('test_device_token');
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/get?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ v0: '0.12', v1: '229.5', v2: '0.42', v3: '1', v4: '0' }),
        });
      }
      return Promise.resolve({ ok: true });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const telemetry = await client.fetchTelemetry();
      expect(telemetry).toEqual({
        voltage: 229.5,
        current: 0.12,
        load2: 0.42,
        relay1: 1,
        relay2: 0,
      });

      await expect(client.setVirtualPin('V3', 0)).resolves.toBe(true);
      expect(fetchMock.mock.calls[0][0]).toContain('&v0&v1&v2&v3&v4');
      expect(fetchMock.mock.calls[1][0]).toContain('&v3=0');
      expect(fetchMock.mock.calls[1][0]).toContain('token=test_device_token');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('correctly maps breaker states into live stream graph ticks and calculates real-time values', async () => {
    const { snapshotToTick } = await import('../routes/stream');

    const baseSnapshot = {
      timestamp: 1776000000,
      voltage_rms: 200.0,
      current_rms: 2.5,
      active_power: 500.0,
      apparent_power: 500.0,
      power_factor: 1.0,
      frequency: 50.0,
      rawTime: '12:00:00.000',
      load1: 1.5,
      load2: 1.0,
      circuits: [
        { id: 'c1', name: 'Load 1 (CT 1)', state: 'CLOSED' as const, current: 1.5, rated: 16.0 },
        { id: 'c2', name: 'Load 2 (CT 2)', state: 'CLOSED' as const, current: 1.0, rated: 16.0 },
        { id: 'c3', name: 'Breaker 3', state: 'CLOSED' as const, current: 0.5, rated: 20.0 },
        { id: 'c4', name: 'Breaker 4', state: 'CLOSED' as const, current: 0.2, rated: 16.0 },
        { id: 'c5', name: 'Breaker 5', state: 'CLOSED' as const, current: 0.8, rated: 20.0 },
      ],
    };

    // When all breakers are closed
    const activeTick = snapshotToTick(baseSnapshot, 8.0);
    expect(activeTick.voltage).toBe(200.0);
    expect(activeTick.load1).toBe(1.5);
    expect(activeTick.load2).toBe(1.0);
    expect(activeTick.load3).toBe(0.5);
    expect(activeTick.totalCurrent).toBe(2.5);
    expect(activeTick.totalPower).toBe(500.0);
    // Burn rate = (500W / 1000) * 8.0 INR = 4.0 INR/hr
    expect(activeTick.burnRate).toBe(4.0);

    // When breaker 1 is OPEN (tripped)
    const trippedSnapshot = {
      ...baseSnapshot,
      current_rms: 1.0,
      active_power: 200.0,
      circuits: [
        { id: 'c1', name: 'Load 1 (CT 1)', state: 'OPEN' as const, current: 0.0, rated: 16.0 },
        { id: 'c2', name: 'Load 2 (CT 2)', state: 'CLOSED' as const, current: 1.0, rated: 16.0 },
        { id: 'c3', name: 'Breaker 3', state: 'CLOSED' as const, current: 0.5, rated: 20.0 },
        { id: 'c4', name: 'Breaker 4', state: 'CLOSED' as const, current: 0.2, rated: 16.0 },
        { id: 'c5', name: 'Breaker 5', state: 'CLOSED' as const, current: 0.8, rated: 20.0 },
      ],
    };

    const trippedTick = snapshotToTick(trippedSnapshot, 8.0);
    expect(trippedTick.load1).toBe(0.0); // Zeroed out when breaker is OPEN
    expect(trippedTick.load2).toBe(1.0);
    expect(trippedTick.totalCurrent).toBe(1.0);
    expect(trippedTick.totalPower).toBe(200.0);
    expect(trippedTick.burnRate).toBe(1.6);
  });

  it('strictly segregates SIMULATED and REALTIME modes, persisting mode in localStorage', async () => {
    // 1. Set to SIMULATED mode
    voltricsStoreCore.setOperatingMode('SIMULATED');
    let state = voltricsStoreCore.getState();
    expect(state.operatingMode).toBe('SIMULATED');
    expect(localStorage.getItem('voltrics_operating_mode')).toBe('SIMULATED');

    // 2. Set to REALTIME mode without hardware connected
    voltricsStoreCore.setOperatingMode('REALTIME');
    state = voltricsStoreCore.getState();
    expect(state.operatingMode).toBe('REALTIME');
    expect(localStorage.getItem('voltrics_operating_mode')).toBe('REALTIME');

    // In REALTIME mode without physical connection, telemetry must be strictly zeroed
    expect(state.connectionState).toBe('DISCONNECTED');
    expect(state.liveReading.voltage_rms).toBe(0.0);
    expect(state.liveReading.current_rms).toBe(0.0);
    expect(state.liveReading.active_power).toBe(0.0);
    expect(state.liveReading.circuits.every((c) => c.current === 0.0)).toBe(true);

    // Actuation must reject when in REALTIME mode and disconnected
    await expect(voltricsStoreCore.toggleCircuit('c1', 'CLOSED')).rejects.toThrowError(
      /Cannot actuate/
    );

    // 3. Switching back to SIMULATED mode restores simulator
    voltricsStoreCore.setOperatingMode('SIMULATED');
    state = voltricsStoreCore.getState();
    expect(state.operatingMode).toBe('SIMULATED');
    expect(localStorage.getItem('voltrics_operating_mode')).toBe('SIMULATED');
    expect(state.connectionState).toBe('SIMULATION');
    expect(state.connectionType).toBe('SIMULATION');
  });

  it('queries Blynk isHardwareConnected endpoint and rejects connection if physical board is offline', async () => {
    const { BlynkApiClient } = await import('./esp32Api');
    const client = new BlynkApiClient('test_token_123');

    // Mock fetch returning false (ESP32 physically offline)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('false'),
      json: () => Promise.resolve(false),
    } as any);

    try {
      const isOnline = await client.isHardwareConnected();
      expect(isOnline).toBe(false);

      // Verify voltricsStoreCore.connectBlynk rejects when board is offline
      voltricsStoreCore.setOperatingMode('REALTIME');
      await expect(voltricsStoreCore.connectBlynk('test_token_123')).rejects.toThrowError(
        /ESP32 device is OFFLINE/
      );

      // Ensure state remains disconnected and 0V/0A
      const state = voltricsStoreCore.getState();
      expect(state.connectionState).toBe('DISCONNECTED');
      expect(state.liveReading.voltage_rms).toBe(0.0);
    } finally {
      globalThis.fetch = originalFetch;
      // Reset back to SIMULATED for subsequent tests
      voltricsStoreCore.setOperatingMode('SIMULATED');
    }
  });

  it('correctly normalizes endpoints and maps GET /api/ping and GET /api/readings firmware schema', async () => {
    const { normalizeGatewayEndpoint, lanReadingToTelemetrySnapshot, VoltraLanGateway } = await import('./websiteLanGateway');

    // 1. Endpoint normalization
    expect(normalizeGatewayEndpoint('192.168.1.50')).toBe('http://192.168.1.50');
    expect(normalizeGatewayEndpoint('http://192.168.1.50/api/readings')).toBe('http://192.168.1.50');
    expect(normalizeGatewayEndpoint('http://voltra.local/api/ping')).toBe('http://voltra.local');
    expect(normalizeGatewayEndpoint('voltra.local')).toBe('http://voltra.local');
    expect(() => normalizeGatewayEndpoint('')).toThrow();
    expect(() => normalizeGatewayEndpoint('http://user:pass@192.168.1.50')).toThrow();
    expect(() => normalizeGatewayEndpoint('http://192.168.1.50/unknown-path')).toThrow();

    // 2. Mock firmware readings frame matching README & website-lan-gateway.mjs spec
    const firmwareReading = {
      device: 'VOLTRA',
      api_version: 1,
      voltage: 228.6,
      current1: 0.145,
      current2: 0.820,
      apparent_power1_va: 33.15,
      apparent_power2_va: 187.45,
      power1: 33.15,
      power2: 187.45,
      total_power: 220.60,
      energy1: 0.052,
      energy2: 0.184,
      total_energy: 0.236,
      cost1: 0.36,
      cost2: 1.29,
      total_cost: 1.65,
      power_mode: 'estimated_assumed_pf',
      valid: true,
      noise_calibrated: true,
      calibrating: false,
      received_at_ms: 1776000000000,
    };

    const snapshot = lanReadingToTelemetrySnapshot(firmwareReading, 7.5);
    expect(snapshot.voltage_rms).toBe(228.6);
    expect(snapshot.load1).toBe(0.145);
    expect(snapshot.load2).toBe(0.820);
    expect(snapshot.current_rms).toBe(0.965);
    expect(snapshot.active_power).toBe(220.60);
    expect(snapshot.apparent_power).toBe(220.60);
    expect(snapshot.energy1).toBe(0.052);
    expect(snapshot.energy2).toBe(0.184);
    expect(snapshot.total_energy).toBe(0.236);
    expect(snapshot.cost1).toBe(0.36);
    expect(snapshot.cost2).toBe(1.29);
    expect(snapshot.total_cost).toBe(1.65);
    expect(snapshot.valid).toBe(true);
    expect(snapshot.circuits).toHaveLength(2);
    expect(snapshot.circuits[0].id).toBe('c1');
    expect(snapshot.circuits[0].name).toBe('Load 1 (CT Sensor 1)');
    expect(snapshot.circuits[0].current).toBe(0.145);
    expect(snapshot.circuits[1].id).toBe('c2');
    expect(snapshot.circuits[1].name).toBe('Load 2 (CT Sensor 2)');
    expect(snapshot.circuits[1].current).toBe(0.820);

    // 3. VoltraLanGateway ping test with mocked fetch
    let receivedData: any = null;
    let receivedStatus: any = null;
    const gateway = new VoltraLanGateway({
      onData: (d) => { receivedData = d; },
      onStatus: (s) => { receivedStatus = s; },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/ping')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            device: 'VOLTRA',
            api_version: 1,
            ok: true,
            wifi: { connected: true, rssi: -55 },
          }),
        });
      }
      if (url.includes('/api/readings')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(firmwareReading),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    try {
      const pingRes = await gateway.connect('http://192.168.1.50');
      expect(pingRes?.device).toBe('VOLTRA');
      expect(pingRes?.api_version).toBe(1);
      expect(pingRes?.ok).toBe(true);
      expect(receivedStatus?.connected).toBe(true);
      expect(receivedData?.voltage).toBe(228.6);
    } finally {
      gateway.stop();
      globalThis.fetch = originalFetch;
    }
  });
});


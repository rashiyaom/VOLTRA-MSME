/**
 * simulator.ts
 * Deterministic, physics-modeled offline simulation engine for Voltrics.
 * Generates realistic sine-wave voltage fluctuations, load spikes, power factor variations,
 * and circuit breaker actuations when live hardware is disconnected.
 */

import type { TelemetrySnapshot, CircuitTelemetry } from './esp32Api';

export interface SimulatedCircuit extends CircuitTelemetry {
  baseCurrent: number;
  variance: number;
  powerFactor: number;
}

export class VoltricsSimulator {
  private tickCount: number = 0;
  private intervalTimer: any = null;
  private listeners: Array<(data: TelemetrySnapshot) => void> = [];
  private spikeCircuitId: string | null = null;
  private spikeMultiplier: number = 1.0;

  private circuits: SimulatedCircuit[] = [
    {
      id: 'c1',
      name: 'Load 1 (CT Sensor 1)',
      state: 'CLOSED',
      current: 0.029,
      rated: 16.0,
      baseCurrent: 0.029,
      variance: 0.002,
      powerFactor: 0.98,
    },
    {
      id: 'c2',
      name: 'Load 2 (CT Sensor 2)',
      state: 'CLOSED',
      current: 0.252,
      rated: 16.0,
      baseCurrent: 0.252,
      variance: 0.012,
      powerFactor: 0.98,
    },
    {
      id: 'c3',
      name: 'Kitchen Ring & Induction',
      state: 'CLOSED',
      current: 0.281,
      rated: 20.0,
      baseCurrent: 0.281,
      variance: 0.014,
      powerFactor: 0.97,
    },
    {
      id: 'c4',
      name: 'Server Hub & Telecom',
      state: 'CLOSED',
      current: 0.05,
      rated: 16.0,
      baseCurrent: 0.05,
      variance: 0.005,
      powerFactor: 0.98,
    },
    {
      id: 'c5',
      name: 'Living Room Heat Pump',
      state: 'CLOSED',
      current: 0.1,
      rated: 20.0,
      baseCurrent: 0.1,
      variance: 0.01,
      powerFactor: 0.95,
    },
  ];

  /**
   * Generates a single deterministic snapshot frame
   */
  public generateSnapshot(): TelemetrySnapshot {
    this.tickCount++;
    const t = this.tickCount;

    // Realistic grid voltage sine wave modulation matching ESP32 hardware (~197.2V RMS)
    // with 2nd harmonic micro-noise (196.6V - 197.4V)
    const noiseV = Math.sin(t * 1.7) * 0.15;
    const voltage_rms = Math.round((197.15 + 0.35 * Math.sin(t / 7) + 0.15 * Math.cos(t / 3) + noiseV) * 100) / 100;

    // Grid frequency fluctuation around 50.00 Hz (within statutory ±0.1 Hz)
    const frequency = Math.round((50.01 + 0.03 * Math.sin(t / 14) + 0.01 * Math.cos(t * 0.8)) * 100) / 100;

    // Calculate current per circuit
    const computedCircuits: CircuitTelemetry[] = this.circuits.map((circuit) => {
      if (circuit.state !== 'CLOSED') {
        return {
          id: circuit.id,
          name: circuit.name,
          state: circuit.state,
          current: 0.0,
          rated: circuit.rated,
        };
      }

      // Check if this circuit is experiencing an artificial load spike for overload testing
      let multiplier = 1.0;
      if (this.spikeCircuitId === circuit.id) {
        multiplier = this.spikeMultiplier;
      }

      const circuitNoise = Math.sin(t + parseInt(circuit.id.replace(/\D/g, '') || '1') * 7) * circuit.variance;
      const rawCurrent = (circuit.baseCurrent + circuitNoise) * multiplier;
      const current = Math.max(0.005, Math.round(rawCurrent * 1000) / 1000);

      return {
        id: circuit.id,
        name: circuit.name,
        state: circuit.state,
        current,
        rated: circuit.rated,
      };
    });

    const load1 = computedCircuits[0]?.current ?? 0.029;
    const load2 = computedCircuits[1]?.current ?? 0.252;
    const totalCurrent = Number((load1 + load2).toFixed(4));

    // Power factor: aggregate weighted (~0.98)
    const power_factor = Math.round((0.98 + 0.01 * Math.cos(t / 11)) * 100) / 100;

    // Active power per load
    const power1 = Number((voltage_rms * load1).toFixed(2));
    const power2 = Number((voltage_rms * load2).toFixed(2));
    const active_power = Number((power1 + power2).toFixed(2));

    // Apparent Power S = V * I (VA)
    const apparent_power = Number((voltage_rms * totalCurrent).toFixed(2));

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

    return {
      timestamp: Math.floor(Date.now() / 1000),
      voltage_rms,
      current_rms: totalCurrent,
      active_power,
      apparent_power,
      power_factor,
      frequency,
      rawTime: timeStr,
      load1,
      load2,
      power1,
      power2,
      circuits: computedCircuits,
    };
  }

  /**
   * Start generating continuous simulation telemetry
   */
  public start(intervalMs = 500, callback?: (data: TelemetrySnapshot) => void): void {
    if (callback) {
      this.subscribe(callback);
    }

    if (this.intervalTimer) return;

    this.intervalTimer = setInterval(() => {
      const frame = this.generateSnapshot();
      for (const cb of this.listeners) {
        cb(frame);
      }
    }, intervalMs);
  }

  /**
   * Stop simulation loop
   */
  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public setSpeed(intervalMs: number): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = setInterval(() => {
        const frame = this.generateSnapshot();
        for (const cb of this.listeners) {
          cb(frame);
        }
      }, intervalMs);
    }
  }

  public subscribe(cb: (data: TelemetrySnapshot) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /**
   * Actuate a circuit in the simulator
   */
  public toggleCircuit(circuitId: string, targetState?: 'OPEN' | 'CLOSED'): SimulatedCircuit | null {
    const target = this.circuits.find((c) => c.id === circuitId);
    if (!target) return null;

    if (targetState) {
      target.state = targetState;
    } else {
      target.state = target.state === 'CLOSED' ? 'OPEN' : 'CLOSED';
    }

    if (target.state !== 'CLOSED') {
      target.current = 0.0;
    } else {
      target.current = target.baseCurrent;
    }

    // Trigger an immediate frame broadcast so UI reflects change instantly
    const frame = this.generateSnapshot();
    for (const cb of this.listeners) {
      cb(frame);
    }

    return { ...target };
  }

  /**
   * Force trip a circuit (for Overload Guardian or manual trip tests)
   */
  public tripCircuit(circuitId: string): void {
    const target = this.circuits.find((c) => c.id === circuitId);
    if (target) {
      target.state = 'TRIPPED';
      target.current = 0;
      const frame = this.generateSnapshot();
      for (const cb of this.listeners) {
        cb(frame);
      }
    }
  }

  /**
   * Inject artificial overload spike for testing Guardian threshold response
   */
  public injectOverloadSpike(circuitId = 'c1', multiplier = 2.4): void {
    this.spikeCircuitId = circuitId;
    this.spikeMultiplier = multiplier;
  }

  public clearOverloadSpike(): void {
    this.spikeCircuitId = null;
    this.spikeMultiplier = 1.0;
  }

  public getCircuits(): SimulatedCircuit[] {
    return [...this.circuits];
  }
}

export const voltricsSimulator = new VoltricsSimulator();

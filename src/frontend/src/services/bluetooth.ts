/**
 * bluetooth.ts
 * Web Bluetooth (BLE) & Capacitor Bluetooth LE Connector & Wi-Fi Provisioning Handler.
 * Supports ESP32 Voltrics Energy Monitor device discovery, telemetry stream,
 * circuit breaker actuation, and remote Wi-Fi credential provisioning.
 */

import { parseEsp32Payload } from './esp32Api';

// UUID definitions according to Voltrics Hardware Spec
export const VOLTRICS_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const VOLTRICS_TELEMETRY_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
export const VOLTRICS_COMMAND_CHAR_UUID = '1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e';
export const VOLTRICS_PROVISIONING_CHAR_UUID = 'd82305a4-22b3-4678-8318-6927a3c3cf52';

export interface BleTelemetryPayload {
  timestamp: number;
  voltage_rms: number;
  current_rms: number;
  active_power: number;
  apparent_power: number;
  power_factor: number;
  frequency: number;
  circuits: Array<{
    id: string;
    name: string;
    state: 'OPEN' | 'CLOSED' | 'TRIPPED';
    current: number;
    rated: number;
  }>;
}

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export type ProvisioningStatus =
  | 'IDLE'
  | 'SENDING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'AUTH_FAILED'
  | 'ERROR';

export interface ProvisioningFeedback {
  status: ProvisioningStatus;
  message: string;
  assignedIp?: string;
}

// Fallback ambient typing for Web Bluetooth API when not bundled in standard TS DOM lib
interface WebBluetoothDevice {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<WebBluetoothRemoteGATTServer>;
    disconnect(): void;
  };
  addEventListener(type: string, listener: (this: this, ev: any) => any): void;
  removeEventListener(type: string, listener: (this: this, ev: any) => any): void;
}

interface WebBluetoothRemoteGATTServer {
  connected: boolean;
  getPrimaryService(service: string): Promise<WebBluetoothRemoteGATTService>;
  disconnect(): void;
}

interface WebBluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<WebBluetoothRemoteGATTCharacteristic>;
}

interface WebBluetoothRemoteGATTCharacteristic {
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  startNotifications(): Promise<WebBluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<WebBluetoothRemoteGATTCharacteristic>;
  addEventListener(type: string, listener: (this: this, ev: any) => any): void;
  removeEventListener(type: string, listener: (this: this, ev: any) => any): void;
}

export class VoltricsBleService {
  private device: WebBluetoothDevice | null = null;
  private server: WebBluetoothRemoteGATTServer | null = null;
  private telemetryChar: WebBluetoothRemoteGATTCharacteristic | null = null;
  private commandChar: WebBluetoothRemoteGATTCharacteristic | null = null;
  private provChar: WebBluetoothRemoteGATTCharacteristic | null = null;

  private onTelemetryCallback: ((data: BleTelemetryPayload) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;
  private onProvisioningCallback: ((feedback: ProvisioningFeedback) => void) | null = null;

  public isConnected(): boolean {
    return !!(this.server && this.server.connected);
  }

  public getDeviceName(): string {
    return this.device?.name || 'VOLTRA ESP32-S3';
  }

  /**
   * Check if Web Bluetooth or Capacitor BLE is supported on the client
   */
  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator as any;
    return !!(nav && (nav.bluetooth || (window as any).Capacitor?.isPluginAvailable?.('BleClient')));
  }

  /**
   * Scan and connect to Voltrics ESP32 over BLE
   */
  public async connect(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    const nav = window.navigator as any;
    if (!nav.bluetooth) {
      throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome, Edge, or Capacitor.');
    }

    try {
      this.device = await nav.bluetooth.requestDevice({
        filters: [
          { services: [VOLTRICS_SERVICE_UUID] },
          { namePrefix: 'VOLTRA' },
          { namePrefix: 'Voltrics' },
          { namePrefix: 'ESP32' },
        ],
        optionalServices: [VOLTRICS_SERVICE_UUID],
      });

      if (!this.device || !this.device.gatt) {
        throw new Error('Device selection cancelled or GATT not available.');
      }

      this.device.addEventListener('gattserverdisconnected', () => {
        this.cleanup();
        if (this.onDisconnectCallback) this.onDisconnectCallback();
      });

      this.server = await this.device.gatt.connect();

      const service = await this.server.getPrimaryService(VOLTRICS_SERVICE_UUID);

      // Bind Characteristics
      try {
        this.telemetryChar = await service.getCharacteristic(VOLTRICS_TELEMETRY_CHAR_UUID);
        await this.telemetryChar.startNotifications();
        this.telemetryChar.addEventListener('characteristicvaluechanged', (ev: any) => {
          this.handleTelemetryNotification(ev.target.value);
        });
      } catch (err) {
        console.warn('Telemetry characteristic not available or notifications failed:', err);
      }

      try {
        this.commandChar = await service.getCharacteristic(VOLTRICS_COMMAND_CHAR_UUID);
      } catch (err) {
        console.warn('Command characteristic not found:', err);
      }

      try {
        this.provChar = await service.getCharacteristic(VOLTRICS_PROVISIONING_CHAR_UUID);
        await this.provChar.startNotifications();
        this.provChar.addEventListener('characteristicvaluechanged', (ev: any) => {
          this.handleProvisioningNotification(ev.target.value);
        });
      } catch (err) {
        console.warn('Provisioning characteristic not found:', err);
      }

      return true;
    } catch (error: any) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Disconnect the active BLE session
   */
  public disconnect(): void {
    if (this.server && this.server.connected) {
      try {
        this.server.disconnect();
      } catch (e) {
        console.warn('Error during BLE disconnect:', e);
      }
    }
    this.cleanup();
  }

  /**
   * Dispatch circuit toggle command via BLE Command Characteristic
   */
  public async toggleCircuit(circuitId: string, targetState: 'OPEN' | 'CLOSED'): Promise<boolean> {
    if (!this.commandChar) {
      throw new Error('BLE Command characteristic not ready or disconnected');
    }

    const payload = JSON.stringify({ circuitId, targetState });
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);

    await this.commandChar.writeValue(data);
    return true;
  }

  /**
   * Send Wi-Fi credentials over BLE for ESP32 Wi-Fi Provisioning
   */
  public async provisionWifi(creds: WifiCredentials): Promise<void> {
    if (!this.provChar) {
      throw new Error('BLE Provisioning characteristic not ready');
    }

    if (this.onProvisioningCallback) {
      this.onProvisioningCallback({
        status: 'SENDING',
        message: `Sending credentials for SSID: "${creds.ssid}"...`,
      });
    }

    const payload = JSON.stringify({
      ssid: creds.ssid.trim(),
      password: creds.password,
    });

    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    await this.provChar.writeValue(data);

    if (this.onProvisioningCallback) {
      this.onProvisioningCallback({
        status: 'CONNECTING',
        message: 'ESP32 associating with Wi-Fi network and requesting IP...',
      });
    }
  }

  public onTelemetry(cb: (data: BleTelemetryPayload) => void) {
    this.onTelemetryCallback = cb;
  }

  public onDisconnect(cb: () => void) {
    this.onDisconnectCallback = cb;
  }

  public onProvisioning(cb: (feedback: ProvisioningFeedback) => void) {
    this.onProvisioningCallback = cb;
  }

  private handleTelemetryNotification(dataView?: DataView) {
    if (!dataView) return;
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(dataView.buffer);
      const parsed = parseEsp32Payload(text);
      if (parsed && this.onTelemetryCallback) {
        this.onTelemetryCallback(parsed as any);
      }
    } catch (err) {
      console.warn('Could not parse BLE telemetry notification packet:', err);
    }
  }

  private handleProvisioningNotification(dataView?: DataView) {
    if (!dataView) return;
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(dataView.buffer).trim();
      
      let feedback: ProvisioningFeedback;
      if (text.startsWith('IP_ASSIGNED:')) {
        const ip = text.replace('IP_ASSIGNED:', '').trim();
        feedback = {
          status: 'CONNECTED',
          message: `Wi-Fi Provisioned successfully! IP: ${ip}`,
          assignedIp: ip,
        };
      } else if (text === 'CONNECTED') {
        feedback = {
          status: 'CONNECTED',
          message: 'ESP32 connected to Local Wi-Fi AP.',
        };
      } else if (text === 'AUTH_FAILED') {
        feedback = {
          status: 'AUTH_FAILED',
          message: 'Wi-Fi Authentication failed. Check SSID and Password.',
        };
      } else {
        feedback = {
          status: 'IDLE',
          message: text,
        };
      }

      if (this.onProvisioningCallback) {
        this.onProvisioningCallback(feedback);
      }
    } catch (err) {
      console.warn('Could not parse BLE provisioning response:', err);
    }
  }

  private cleanup() {
    this.server = null;
    this.telemetryChar = null;
    this.commandChar = null;
    this.provChar = null;
    this.device = null;
  }
}

export const voltricsBle = new VoltricsBleService();

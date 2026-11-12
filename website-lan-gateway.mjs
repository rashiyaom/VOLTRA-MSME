/* Browser-side adapter for the existing VOLTRA website.
 * Import it in your frontend, not your cloud backend.
 * It complements the existing Blynk path; it does not replace that path.
 */

export function normalizeGatewayEndpoint(input) {
  let text = String(input ?? "").trim();
  if (!text) throw new Error("Enter the ESP32 IP address or .local hostname.");
  if (!/^https?:\/\//i.test(text)) text = "http://" + text;
  const url = new URL(text);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use an HTTP endpoint without login credentials.");
  const knownPaths = ["/", "/api/readings", "/api/data", "/readings", "/data", "/api/ping", "/ping", "/health"];
  if (!knownPaths.includes(url.pathname.replace(/\/$/, "") || "/"))
    throw new Error("Enter the device base URL, such as http://192.168.1.50.");
  if (url.search || url.hash)
    throw new Error("Use the device address without query parameters or a fragment.");
  return url.origin;
}

export class VoltraLanGateway {
  constructor({ onData = () => {}, onStatus = () => {}, intervalMs = 1000,
                timeoutMs = 4000, storageKey = "voltra.gateway.endpoint" } = {}) {
    this.onData = onData;
    this.onStatus = onStatus;
    this.intervalMs = Math.max(500, intervalMs);
    this.timeoutMs = timeoutMs;
    this.storageKey = storageKey;
    this.endpoint = "";
    try { this.endpoint = localStorage.getItem(storageKey) || ""; } catch {}
    this.timer = null;
    this.controller = null;
    this.generation = 0;
  }

  saveEndpoint(input) {
    this.endpoint = normalizeGatewayEndpoint(input);
    try { localStorage.setItem(this.storageKey, this.endpoint); } catch {}
    return this.endpoint;
  }

  async requestJSON(path) {
    if (!this.endpoint) throw new Error("Save an ESP32 endpoint first.");
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint + path, {
        method: "GET", mode: "cors", credentials: "omit", cache: "no-store",
        // Supported browsers can use this to identify a local-network target.
        targetAddressSpace: "local", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Gateway HTTP " + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  async ping() {
    const started = performance.now();
    const result = await this.requestJSON("/api/ping");
    if (result.device !== "VOLTRA" || result.api_version !== 1 || result.ok !== true)
      throw new Error("This endpoint does not expose the VOLTRA gateway API v1.");
    return { ...result, latency_ms: Math.round(performance.now() - started) };
  }

  async connect(input = this.endpoint) {
    this.stop();
    const generation = this.generation;
    this.saveEndpoint(input);
    this.onStatus({ connected: false, state: "connecting", message: "Checking ESP32 gateway..." });
    try {
      const health = await this.ping();
      if (generation !== this.generation) return;
      this.onStatus({ connected: true, state: "connected", message: "Connected to ESP32", health });
      await this.poll(generation);
      return health;
    } catch (error) {
      if (generation !== this.generation) return;
      this.reportFailure(error);
      throw error;
    }
  }

  async poll(generation) {
    if (generation !== this.generation) return;
    try {
      const data = await this.requestJSON("/api/readings");
      if (generation !== this.generation) return;
      if (data.device !== "VOLTRA" || data.api_version !== 1 ||
          ![data.voltage, data.current1, data.current2].every(Number.isFinite))
        throw new Error("Unexpected gateway readings schema.");
      this.onData({ ...data, received_at_ms: Date.now(), source: "lan" });
      const state = !data.valid ? "sensor_warning" : !data.noise_calibrated ?
        "calibration_required" : data.calibrating ? "calibrating" : "connected";
      const message = state === "sensor_warning" ? "Gateway connected; sensor/timing warning" :
        state === "calibration_required" ? "Connected; no-load calibration required" :
        state === "calibrating" ? "Connected; calibrating sensors" : "Connected to ESP32";
      this.onStatus({ connected: true, state, message });
    } catch (error) {
      if (generation !== this.generation) return;
      this.reportFailure(error);
    }
    // A timeout-based loop avoids overlapping HTTP requests.
    if (generation === this.generation)
      this.timer = setTimeout(() => this.poll(generation), this.intervalMs);
  }

  reportFailure(error) {
    this.onStatus({ connected: false, state: "disconnected", error,
      message: "Cannot reach ESP32. Check the address, local Wi-Fi, browser local-network permission, and website CSP." });
  }

  stop() {
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }
}

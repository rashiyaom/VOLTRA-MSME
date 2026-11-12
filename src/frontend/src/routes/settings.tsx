import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bluetooth,
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  Database,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Pencil,
  PlugZap,
  Radio,
  ShieldCheck,
  Trash2,
  Usb,
  Wifi,
} from "lucide-react";
import { ModeStatusBanner } from "@/components/ModeStatusBanner";
import { useVoltricsStore, type OperatingMode } from "@/stores/useVoltricsStore";
import { blynkApi } from "@/services/esp32Api";
import { assistantStatus, verifyGroqKey, type AssistantStatus } from "@/services/usageAssistant";
import { clearGroqApiKey, maskedGroqKey, readGroqApiKey, saveGroqApiKey } from "@/lib/groqSettings";
import {
  clearBlynkToken,
  maskedBlynkToken,
  readBlynkToken,
  saveBlynkToken,
} from "@/lib/blynkSettings";
import { normalizeApiBase, readApiBase, saveApiBase } from "@/lib/apiSettings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · VOLTRA" },
      {
        name: "description",
        content: "Choose your data source, connect your ESP32, and export your energy readings.",
      },
    ],
  }),
  component: SettingsPage,
});

const methods = [
  { id: "usb", label: "USB cable", hint: "At your desk", icon: Usb, state: "CONNECTED_SERIAL" },
  {
    id: "wifi",
    label: "Local Wi-Fi",
    hint: "On your network",
    icon: Wifi,
    state: "CONNECTED_WIFI",
  },
  {
    id: "bluetooth",
    label: "Bluetooth",
    hint: "Nearby device",
    icon: Bluetooth,
    state: "CONNECTED_BLE",
  },
  {
    id: "cloud",
    label: "Blynk Cloud",
    hint: "Over the internet",
    icon: Cloud,
    state: "CONNECTED_BLYNK",
  },
] as const;
type Method = (typeof methods)[number]["id"];
type Feedback = { text: string; error?: boolean } | null;

function SettingsPage() {
  const store = useVoltricsStore();
  const { operatingMode, connectionState, deviceMetadata, provisioning } = store;
  const [method, setMethod] = useState<Method>(
    () => methods.find((m) => m.state === connectionState)?.id || "usb",
  );
  const [ip, setIp] = useState(deviceMetadata.ip || "http://voltra.local");
  const [token, setToken] = useState("");
  const [savedBlynkToken, setSavedBlynkToken] = useState("");
  const [blynkEditing, setBlynkEditing] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [exportFeedback, setExportFeedback] = useState<Feedback>(null);
  const [cloudStatus, setCloudStatus] = useState("Not checked");
  const [groqKey, setGroqKey] = useState("");
  const [savedGroqKey, setSavedGroqKey] = useState("");
  const [groqEditing, setGroqEditing] = useState(true);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqStatus, setGroqStatus] = useState<AssistantStatus | null>(null);
  const [groqBusy, setGroqBusy] = useState(false);
  const [groqFeedback, setGroqFeedback] = useState<Feedback>(null);
  const [apiBase, setApiBase] = useState(() => readApiBase());
  const [apiBusy, setApiBusy] = useState(false);
  const [apiFeedback, setApiFeedback] = useState<Feedback>(null);
  const [capabilities, setCapabilities] = useState({
    serial: false,
    bluetooth: false,
    ready: false,
  });
  useEffect(() => {
    const storedBlynkToken = readBlynkToken();
    const storedGroqKey = readGroqApiKey();
    setToken(storedBlynkToken);
    setSavedBlynkToken(storedBlynkToken);
    setBlynkEditing(!storedBlynkToken);
    if (storedBlynkToken) blynkApi.setActiveToken(storedBlynkToken);
    setGroqKey(storedGroqKey);
    setSavedGroqKey(storedGroqKey);
    setGroqEditing(!storedGroqKey);
  }, []);

  useEffect(() => {
    setCapabilities({
      serial: "serial" in navigator && window.isSecureContext,
      bluetooth: "bluetooth" in navigator && window.isSecureContext,
      ready: true,
    });
    try {
      setIp(
        localStorage.getItem("voltra.gateway.endpoint") ||
          localStorage.getItem("voltrics_esp32_base_url") ||
          deviceMetadata.ip ||
          "http://voltra.local",
      );
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    void assistantStatus()
      .then(setGroqStatus)
      .catch(() => setGroqStatus(null));
  }, [deviceMetadata.ip]);

  const connectedMethod = methods.find((m) => m.state === connectionState);
  const selectedConnected = connectedMethod?.id === method;
  const run = async (
    name: string,
    action: () => unknown | Promise<unknown>,
    success: string,
    isExport = false,
  ) => {
    const report = isExport ? setExportFeedback : setFeedback;
    setBusy(name);
    report(null);
    try {
      await action();
      report({ text: success });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again.";
      const networkFailure = /failed to fetch|networkerror|load failed/i.test(detail);
      if (name === "verify") setCloudStatus("Check failed");
      report({
        text: networkFailure
          ? name === "wifi"
            ? "Couldn’t reach the gateway. Check the address, connect to the same Wi-Fi network, and allow local network access in your browser."
            : "Couldn’t reach the service. Check your internet connection and try again."
          : detail,
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };
  const changeMode = (mode: OperatingMode) => {
    if (mode === operatingMode || busy) return;
    store.setOperatingMode(mode);
    setFeedback(null);
  };
  const actionIcon = busy ? (
    <Loader2 className="size-4 animate-spin" />
  ) : (
    <PlugZap className="size-4" />
  );

  const connectGroq = async () => {
    const key = groqKey.trim();
    if (!key || groqBusy) return;
    setGroqBusy(true);
    setGroqFeedback(null);
    try {
      const verified = await verifyGroqKey(key);
      saveGroqApiKey(key);
      setSavedGroqKey(key);
      setGroqEditing(false);
      setShowGroqKey(false);
      setGroqStatus(verified);
      setGroqFeedback({
        text: verified.modelAvailable
          ? `Connected to Groq. ${verified.model} now powers every VOLTRA assistant.`
          : `The key is valid, but ${verified.model} is not available for this Groq account.`,
        error: !verified.modelAvailable,
      });
    } catch (error) {
      setGroqFeedback({
        text: error instanceof Error ? error.message : "Groq could not validate this key.",
        error: true,
      });
    } finally {
      setGroqBusy(false);
    }
  };

  const removeGroqKey = async () => {
    clearGroqApiKey();
    setGroqKey("");
    setSavedGroqKey("");
    setGroqEditing(true);
    setShowGroqKey(false);
    setGroqFeedback({ text: "The browser key was removed." });
    try {
      setGroqStatus(await assistantStatus());
    } catch {
      setGroqStatus(null);
    }
  };

  const persistBlynkToken = (): boolean => {
    const nextToken = token.trim();
    try {
      saveBlynkToken(nextToken);
      blynkApi.setActiveToken(nextToken);
      setToken(nextToken);
      setSavedBlynkToken(nextToken);
      setBlynkEditing(false);
      setShowToken(false);
      setFeedback({ text: "Blynk token saved permanently on this device." });
      return true;
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "The Blynk token could not be saved.",
        error: true,
      });
      return false;
    }
  };

  const removeBlynkToken = () => {
    try {
      clearBlynkToken();
      blynkApi.clearActiveToken();
      setToken("");
      setSavedBlynkToken("");
      setBlynkEditing(true);
      setShowToken(false);
      setCloudStatus("Not checked");
      setFeedback({ text: "The saved Blynk token was removed from this device." });
    } catch (error) {
      setFeedback({
        text: error instanceof Error ? error.message : "The Blynk token could not be removed.",
        error: true,
      });
    }
  };

  const saveBackendAddress = async () => {
    if (apiBusy) return;
    setApiBusy(true);
    setApiFeedback(null);
    try {
      const normalized = saveApiBase(apiBase);
      setApiBase(normalized);
      const response = await fetch(`${normalized}/api/health`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}.`);
      setApiFeedback({ text: "Backend connected. Accounts, MongoDB auth, and Groq are available." });
      void assistantStatus().then(setGroqStatus).catch(() => setGroqStatus(null));
    } catch (error) {
      let saved = false;
      try {
        const normalized = normalizeApiBase(apiBase);
        saveApiBase(normalized);
        setApiBase(normalized);
        saved = true;
      } catch {
        // Invalid addresses are reported below and are not saved.
      }
      setApiFeedback({
        text: `${saved ? "Address saved, but VOLTRA could not reach it. " : ""}${error instanceof Error ? error.message : "Check the backend address."}`,
        error: true,
      });
    } finally {
      setApiBusy(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-wrap">
        <header className="workspace-heading">
          <div>
            <p className="workspace-eyebrow">VOLTRA / WORKSPACE</p>
            <h1>Make the connection.</h1>
            <p>Choose where your readings come from. Keep your setup in one place.</p>
          </div>
          <Link to="/guide" className="workspace-button secondary">
            <BookOpen className="size-4" /> Setup guide <ArrowRight className="size-4" />
          </Link>
        </header>
        <div className="workspace-layout">
          <aside className="workspace-sidebar">
            <p className="workspace-eyebrow">Settings</p>
            <nav aria-label="Settings sections">
              <a href="#data-source">
                <span>01</span> Data source <Radio className="size-4" />
              </a>
              <a href="#device-connection">
                <span>02</span> Device connection <PlugZap className="size-4" />
              </a>
              <a href="#ai-assistant">
                <span>03</span> AI connection <Bot className="size-4" />
              </a>
              <a href="#data-exports">
                <span>04</span> Data & exports <Download className="size-4" />
              </a>
            </nav>
            <div className="workspace-aside-note">
              <span className="workspace-eyebrow">Your workspace</span>
              <strong>
                {operatingMode === "SIMULATED"
                  ? "Ready to explore"
                  : connectedMethod
                    ? "Hardware connected"
                    : "Waiting for a device"}
              </strong>
              <p>
                {operatingMode === "SIMULATED"
                  ? "Demo readings let you explore every page without an ESP32."
                  : connectedMethod
                    ? `Your readings come through ${connectedMethod.label}.`
                    : "Choose a connection below to start receiving readings."}
              </p>
              <Link to="/stream">
                Open live stream <ArrowRight className="size-4" />
              </Link>
            </div>
          </aside>
          <div className="workspace-content">
            <section id="data-source" className="workspace-panel">
              <div className="workspace-section-heading">
                <span className="workspace-section-number">01</span>
                <div>
                  <h2>Data source</h2>
                  <p>Choose demo readings or your own hardware. Changes apply immediately.</p>
                </div>
              </div>
              <div className="mode-options" role="group" aria-label="Data source">
                {(
                  [
                    {
                      value: "SIMULATED",
                      title: "Explore with demo data",
                      text: "Try the dashboard, waveforms and breaker controls. No device needed.",
                      icon: Activity,
                      detail: "Simulated readings · no hardware commands",
                    },
                    {
                      value: "REALTIME",
                      title: "Use my ESP32",
                      text: "Read from your sensors and send controls to your connected device.",
                      icon: PlugZap,
                      detail: "Requires a connection below",
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={operatingMode === option.value}
                    disabled={!!busy}
                    onClick={() => changeMode(option.value)}
                    className={cn("mode-option", operatingMode === option.value && "selected")}
                  >
                    <div className="mode-option-top">
                      <option.icon className="size-5" />
                      <span className="selection-dot">
                        {operatingMode === option.value && <Check className="size-3" />}
                      </span>
                    </div>
                    <strong>{option.title}</strong>
                    <p>{option.text}</p>
                    <span className="mode-option-detail">{option.detail}</span>
                  </button>
                ))}
              </div>
              <ModeStatusBanner compact className="mt-5" />
            </section>

            <section id="device-connection" className="workspace-panel">
              <div className="workspace-section-heading">
                <span className="workspace-section-number">02</span>
                <div>
                  <h2>Device connection</h2>
                  <p>
                    Pick one way to connect. A successful connection switches you to hardware data.
                  </p>
                </div>
              </div>
              <div className="connection-picker" role="group" aria-label="Connection method">
                {methods.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={!!busy}
                    aria-pressed={method === item.id}
                    onClick={() => {
                      setMethod(item.id);
                      setFeedback(null);
                    }}
                    className={cn(method === item.id && "selected")}
                  >
                    <item.icon className="size-5" />
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                    {connectedMethod?.id === item.id && (
                      <span className="connection-active">Connected</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="connection-detail" aria-busy={!!busy}>
                <div className="connection-detail-heading">
                  <h3>{methods.find((m) => m.id === method)?.label}</h3>
                  <span className={cn("workspace-status", selectedConnected && "online")}>
                    <i />
                    {selectedConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                {method === "usb" && (
                  <>
                    <p className="workspace-description">
                      Connect the ESP32 to this computer with a data-capable USB cable, then select
                      its serial port.
                    </p>
                    <ol className="connection-instructions">
                      <li>Plug in the board and close any serial monitor using its port.</li>
                      <li>Select the ESP32 in your browser’s device chooser.</li>
                    </ol>
                    {capabilities.ready && !capabilities.serial && (
                      <p className="workspace-feedback error">
                        USB access isn’t available in this browser. Open this page in a browser with
                        Web Serial support, such as desktop Chrome or Edge, over HTTPS or localhost.
                      </p>
                    )}
                    <div className="workspace-action-row">
                      <button
                        className="workspace-button"
                        disabled={!!busy || (!selectedConnected && !capabilities.serial)}
                        onClick={() =>
                          run(
                            "usb",
                            selectedConnected ? store.disconnectSerial : store.connectSerial,
                            selectedConnected
                              ? "USB disconnected."
                              : "USB connected. Open Live stream to view readings.",
                          )
                        }
                      >
                        {actionIcon}
                        {busy === "usb"
                          ? "Connecting…"
                          : selectedConnected
                            ? "Disconnect USB"
                            : "Choose USB device"}
                      </button>
                      <span className="workspace-micro">Serial rate: 115200 baud</span>
                    </div>
                  </>
                )}
                {method === "wifi" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        "wifi",
                        () => store.connectWifi(ip.trim()),
                        "Gateway connected. Your address is saved for next time.",
                      );
                    }}
                  >
                    <p className="workspace-description">
                      Use this when your ESP32 gateway and computer are on the same local network.
                    </p>
                    <div className="workspace-field">
                      <label htmlFor="gateway-address">Gateway address</label>
                      <input
                        id="gateway-address"
                        value={ip}
                        onChange={(e) => setIp(e.target.value)}
                        placeholder="http://192.168.1.50"
                        required
                        spellCheck={false}
                        autoCapitalize="none"
                        aria-describedby="gateway-help"
                      />
                      <p id="gateway-help">
                        Enter the IP address or local hostname shown by your device.
                      </p>
                    </div>
                    <div className="workspace-action-row">
                      <button className="workspace-button" disabled={!!busy || !ip.trim()}>
                        {actionIcon}
                        {busy === "wifi" ? "Connecting…" : "Save & connect"}
                      </button>
                      {selectedConnected && (
                        <button
                          type="button"
                          className="workspace-button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            run("disconnect", store.disconnectWifi, "Wi-Fi gateway disconnected.")
                          }
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                    <details className="workspace-disclosure">
                      <summary>
                        Gateway requirements <ChevronDown className="size-4" />
                      </summary>
                      <p>
                        Your firmware or gateway must expose <code>/api/ping</code> and{" "}
                        <code>/api/readings</code>, and allow requests from this website. Allow
                        local network access if your browser asks.
                      </p>
                    </details>
                  </form>
                )}
                {method === "bluetooth" && (
                  <>
                    <p className="workspace-description">
                      Keep the ESP32 nearby and select it from your browser’s Bluetooth chooser. The
                      board must run compatible VOLTRA Bluetooth firmware.
                    </p>
                    {capabilities.ready && !capabilities.bluetooth && (
                      <p className="workspace-feedback error">
                        Bluetooth access isn’t available here. Use a browser with Web Bluetooth
                        support over HTTPS or localhost, or choose another connection method.
                      </p>
                    )}
                    <div className="workspace-action-row">
                      <button
                        className="workspace-button"
                        disabled={!!busy || !capabilities.bluetooth || selectedConnected}
                        onClick={() =>
                          run(
                            "bluetooth",
                            store.connectBle,
                            "Bluetooth paired. You can now send Wi-Fi details to the board.",
                          )
                        }
                      >
                        {actionIcon}
                        {busy === "bluetooth"
                          ? "Waiting for device…"
                          : selectedConnected
                            ? "Bluetooth paired"
                            : "Pair Bluetooth device"}
                      </button>
                      {selectedConnected && (
                        <span className="workspace-micro">{deviceMetadata.bleName}</span>
                      )}
                    </div>
                    <details className="workspace-disclosure">
                      <summary>
                        Send Wi-Fi details to the device <span>Optional</span>
                        <ChevronDown className="size-4" />
                      </summary>
                      <p>
                        Pair over Bluetooth first. Sending these details asks the board to join your
                        Wi-Fi network.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(
                            "provision",
                            async () => {
                              await store.provisionWifiViaBle(ssid.trim(), password);
                              setPassword("");
                            },
                            "Wi-Fi details sent. Wait for the device to report its connection status.",
                          );
                        }}
                      >
                        <div className="workspace-field-grid">
                          <div className="workspace-field">
                            <label htmlFor="wifi-name">Network name (SSID)</label>
                            <input
                              id="wifi-name"
                              value={ssid}
                              onChange={(e) => setSsid(e.target.value)}
                              required
                              placeholder="Your Wi-Fi network"
                              disabled={!selectedConnected || !!busy}
                            />
                          </div>
                          <div className="workspace-field">
                            <label htmlFor="wifi-password">Wi-Fi password</label>
                            <input
                              id="wifi-password"
                              type="password"
                              autoComplete="new-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Network password"
                              disabled={!selectedConnected || !!busy}
                            />
                          </div>
                        </div>
                        <button
                          className="workspace-button secondary"
                          disabled={!selectedConnected || !!busy || !ssid.trim()}
                        >
                          {busy === "provision" ? "Sending…" : "Send Wi-Fi details"}
                          <ArrowRight className="size-4" />
                        </button>
                        <p className="workspace-micro mt-3" role="status">
                          {selectedConnected
                            ? provisioning.message
                            : "Pair a Bluetooth device to enable this form."}
                        </p>
                      </form>
                    </details>
                  </>
                )}
                {method === "cloud" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const nextToken = token.trim();
                      if (blynkEditing && !persistBlynkToken()) return;
                      run(
                        "cloud",
                        () => store.connectBlynk(nextToken),
                        "Blynk connected. Open Live stream to view readings.",
                      );
                    }}
                  >
                    <p className="workspace-description">
                      Connect through Blynk when your board is already online in Blynk Cloud. Find
                      its device token in your Blynk console.
                    </p>
                    <div className="workspace-field">
                      <label htmlFor="blynk-token">Device auth token</label>
                      <div className="workspace-secret">
                        <input
                          id="blynk-token"
                          type={showToken ? "text" : "password"}
                          value={token}
                          onChange={(e) => {
                            setToken(e.target.value);
                            setCloudStatus("Not checked");
                          }}
                          placeholder="Paste your device token"
                          required
                          autoComplete="off"
                          spellCheck={false}
                          disabled={!!busy || !blynkEditing}
                        />
                        <button
                          type="button"
                          aria-label={showToken ? "Hide token" : "Show token"}
                          onClick={() => setShowToken(!showToken)}
                        >
                          {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                      <p className="workspace-secret-state">
                        {savedBlynkToken && !blynkEditing
                          ? `Saved permanently on this device as ${maskedBlynkToken(savedBlynkToken)}.`
                          : savedBlynkToken
                            ? "Editing the saved token. Save or cancel to lock it again."
                            : "Enter the device token once. VOLTRA will keep it after refreshes."}
                      </p>
                    </div>
                    <div className="workspace-action-row">
                      {blynkEditing ? (
                        <>
                          <button
                            type="button"
                            className="workspace-button"
                            disabled={!!busy || !token.trim()}
                            onClick={persistBlynkToken}
                          >
                            <KeyRound className="size-4" /> Save token
                          </button>
                          {savedBlynkToken && (
                            <button
                              type="button"
                              className="workspace-button secondary"
                              disabled={!!busy}
                              onClick={() => {
                                setToken(savedBlynkToken);
                                setBlynkEditing(false);
                                setShowToken(false);
                                setFeedback(null);
                              }}
                            >
                              Cancel
                            </button>
                          )}
                          {savedBlynkToken && (
                            <button
                              type="button"
                              className="workspace-button secondary groq-remove"
                              disabled={!!busy}
                              onClick={removeBlynkToken}
                            >
                              <Trash2 className="size-4" /> Remove token
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          {selectedConnected ? (
                            <button
                              type="button"
                              className="workspace-button secondary"
                              disabled={!!busy}
                              onClick={() =>
                                run("disconnect", store.disconnectBlynk, "Blynk Cloud disconnected.")
                              }
                            >
                              Disconnect Blynk
                            </button>
                          ) : (
                            <button className="workspace-button" disabled={!!busy}>
                              {actionIcon}
                              {busy === "cloud" ? "Connecting…" : "Connect Blynk"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="workspace-button secondary"
                            disabled={!!busy}
                            onClick={() => {
                              setBlynkEditing(true);
                              setFeedback(null);
                            }}
                          >
                            <Pencil className="size-4" /> Edit token
                          </button>
                        </>
                      )}
                      {!blynkEditing && (
                        <button
                          type="button"
                          className="workspace-button secondary"
                          disabled={!!busy}
                          onClick={() =>
                            run(
                              "verify",
                              async () => {
                                const online = await blynkApi.isHardwareConnected();
                                setCloudStatus(online ? "Device online" : "Device offline");
                                if (!online)
                                  throw new Error(
                                    "Blynk reports this device is offline. Check its power and Wi-Fi connection.",
                                  );
                              },
                              "Device is online in Blynk. Choose Connect Blynk to receive readings.",
                            )
                          }
                        >
                          {busy === "verify" ? "Checking…" : "Check device"}
                        </button>
                      )}
                      <span className="workspace-micro">{cloudStatus}</span>
                    </div>
                    <details className="workspace-disclosure">
                      <summary>
                        Cloud configuration <ChevronDown className="size-4" />
                      </summary>
                      <p>
                        Uses <code>blynk.cloud</code> with Load 1 current on <code>V0</code>,
                        voltage on <code>V1</code>, Load 2 current on <code>V2</code>, and relay
                        commands on <code>V3</code> and <code>V4</code>. The token stays saved on
                        this device across refreshes and disconnects until you explicitly edit or
                        remove it.
                      </p>
                    </details>
                  </form>
                )}
                {feedback && (
                  <p
                    className={cn("workspace-feedback", feedback.error && "error")}
                    role={feedback.error ? "alert" : "status"}
                  >
                    {feedback.text}
                  </p>
                )}
              </div>
            </section>
            <section id="ai-assistant" className="workspace-panel groq-settings-panel">
              <div className="workspace-section-heading">
                <span className="workspace-section-number">03</span>
                <div>
                  <h2>AI connection</h2>
                  <p>
                    Connect one Groq key for Usage Patterns and the page-aware VOLTRA assistant.
                  </p>
                </div>
              </div>

              <div className="api-endpoint-card">
                <div className="groq-mark" aria-hidden="true">
                  <Database className="size-5" />
                </div>
                <div className="workspace-field">
                  <label htmlFor="voltra-api-base">VOLTRA backend address</label>
                  <input
                    id="voltra-api-base"
                    type="url"
                    inputMode="url"
                    value={apiBase}
                    onChange={(event) => {
                      setApiBase(event.target.value);
                      setApiFeedback(null);
                    }}
                    placeholder="https://api.example.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={apiBusy}
                  />
                  <p>
                    In the Android app, use a deployed HTTPS API or your computer’s LAN address,
                    such as <code>http://192.168.1.20:8000</code>. Phone localhost points to the
                    phone itself.
                  </p>
                </div>
                <button
                  type="button"
                  className="workspace-button secondary"
                  onClick={() => void saveBackendAddress()}
                  disabled={apiBusy || !apiBase.trim()}
                >
                  {apiBusy ? <Loader2 className="size-4 animate-spin" /> : <Cloud className="size-4" />}
                  {apiBusy ? "Testing…" : "Save & test"}
                </button>
              </div>
              {apiFeedback && (
                <p
                  className={cn("workspace-feedback", apiFeedback.error && "error")}
                  role={apiFeedback.error ? "alert" : "status"}
                >
                  {apiFeedback.text}
                </p>
              )}

              <div className="groq-connection-head">
                <div className="groq-mark" aria-hidden="true">
                  <Bot className="size-5" />
                </div>
                <div>
                  <span className="workspace-eyebrow">GROQ CLOUD</span>
                  <strong>
                    {groqStatus?.configured
                      ? groqStatus.keySource === "browser"
                        ? "Your browser key is active"
                        : "A server key is active"
                      : "Not connected"}
                  </strong>
                  <p>
                    {groqStatus?.configured
                      ? `${groqStatus.model} · ${groqStatus.keySource === "browser" ? "shared by this browser" : "provided by the backend"}`
                      : "Add a key to ask questions about usage and get help across the app."}
                  </p>
                </div>
                <span className={cn("workspace-status", groqStatus?.configured && "online")}>
                  <i /> {groqStatus?.configured ? "Connected" : "Disconnected"}
                </span>
              </div>

              <form
                className="groq-key-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void connectGroq();
                }}
              >
                <div className="workspace-field">
                  <label htmlFor="groq-api-key">Groq API key</label>
                  <div className="workspace-secret">
                    <input
                      id="groq-api-key"
                      type={showGroqKey ? "text" : "password"}
                      value={groqKey}
                      onChange={(event) => {
                        setGroqKey(event.target.value);
                        setGroqFeedback(null);
                      }}
                      placeholder="gsk_…"
                      autoComplete="off"
                      spellCheck={false}
                      disabled={groqBusy || !groqEditing}
                      aria-describedby="groq-key-help"
                    />
                    <button
                      type="button"
                      aria-label={showGroqKey ? "Hide Groq API key" : "Show Groq API key"}
                      onClick={() => setShowGroqKey((current) => !current)}
                    >
                      {showGroqKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p id="groq-key-help">
                    {savedGroqKey && !groqEditing
                      ? `Saved permanently on this device as ${maskedGroqKey(savedGroqKey)}.`
                      : savedGroqKey
                        ? "Editing the saved key. Verify and save, or cancel to keep the current key."
                        : "Create a key in Groq Console, paste it here, then verify and save."}
                  </p>
                </div>
                <div className="workspace-action-row">
                  {groqEditing ? (
                    <button className="workspace-button" disabled={groqBusy || !groqKey.trim()}>
                      {groqBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <KeyRound className="size-4" />
                      )}
                      {groqBusy ? "Checking with Groq…" : "Verify & save key"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="workspace-button secondary"
                      disabled={groqBusy}
                      onClick={() => {
                        setGroqEditing(true);
                        setGroqFeedback(null);
                      }}
                    >
                      <Pencil className="size-4" /> Edit key
                    </button>
                  )}
                  {groqEditing && savedGroqKey && (
                    <>
                      <button
                        type="button"
                        className="workspace-button secondary"
                        disabled={groqBusy}
                        onClick={() => {
                          setGroqKey(savedGroqKey);
                          setGroqEditing(false);
                          setShowGroqKey(false);
                          setGroqFeedback(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="workspace-button secondary groq-remove"
                        disabled={groqBusy}
                        onClick={() => void removeGroqKey()}
                      >
                        <Trash2 className="size-4" /> Remove key
                      </button>
                    </>
                  )}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    className="workspace-text-link"
                  >
                    Open Groq Console <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </form>

              <div className="groq-boundaries" aria-label="How VOLTRA handles your key">
                <div>
                  <ShieldCheck className="size-4" />
                  <span>
                    <strong>Browser storage</strong>Your key stays in this browser until you remove
                    it.
                  </span>
                </div>
                <div>
                  <KeyRound className="size-4" />
                  <span>
                    <strong>Request only</strong>The backend forwards it to Groq and does not save
                    it.
                  </span>
                </div>
                <div>
                  <Download className="size-4" />
                  <span>
                    <strong>Excluded from exports</strong>Your key never appears in VOLTRA
                    downloads.
                  </span>
                </div>
              </div>

              {groqFeedback && (
                <p
                  className={cn("workspace-feedback", groqFeedback.error && "error")}
                  role={groqFeedback.error ? "alert" : "status"}
                >
                  {groqFeedback.text}
                </p>
              )}
            </section>

            <section id="data-exports" className="workspace-panel">
              <div className="workspace-section-heading">
                <span className="workspace-section-number">04</span>
                <div>
                  <h2>Take your data with you</h2>
                  <p>Download readings and saved events from this browser.</p>
                </div>
              </div>
              <div className="export-row">
                <FileSpreadsheet className="size-5" />
                <div>
                  <h3>Recent readings</h3>
                  <p>Voltage, current, power and circuit states from the recent session buffer.</p>
                </div>
                <button
                  className="workspace-button secondary"
                  disabled={!!busy}
                  onClick={() => run("csv", store.exportCsv, "Readings downloaded as CSV.", true)}
                >
                  Download CSV <Download className="size-4" />
                </button>
              </div>
              <div className="export-row">
                <FileJson className="size-5" />
                <div>
                  <h3>Breaker event log</h3>
                  <p>Locally saved trip events with device and connection details.</p>
                </div>
                <button
                  className="workspace-button secondary"
                  disabled={!!busy}
                  onClick={() =>
                    run("json", store.exportAuditJson, "Event log downloaded as JSON.", true)
                  }
                >
                  {busy === "json" ? "Preparing…" : "Download JSON"}
                  <Download className="size-4" />
                </button>
              </div>
              {operatingMode === "SIMULATED" && (
                <p className="workspace-micro mt-4">
                  You’re in demo mode. Recent readings contain simulated data.
                </p>
              )}
              {exportFeedback && (
                <p
                  className={cn("workspace-feedback", exportFeedback.error && "error")}
                  role={exportFeedback.error ? "alert" : "status"}
                >
                  {exportFeedback.text}
                </p>
              )}
            </section>
            <div className="workspace-endnote">
              <span>SET UP. CONNECT. UNDERSTAND.</span>
              <Link to="/guide">
                Need a hand? Read the guide <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

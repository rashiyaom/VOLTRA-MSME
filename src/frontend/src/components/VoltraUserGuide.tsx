import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  Fingerprint,
  KeyRound,
  PlugZap,
  Search,
  Settings2,
  SlidersHorizontal,
  ToggleRight,
  X,
} from "lucide-react";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { cn } from "@/lib/utils";

type GuideLink = "/settings" | "/stream" | "/breakers" | "/analytics" | "/patterns";
const chapters: {
  id: string;
  title: string;
  short: string;
  category: string;
  intro: string;
  steps: string[];
  note: string;
  link: GuideLink;
  action: string;
  icon: typeof Activity;
}[] = [
  {
    id: "start",
    title: "Start with the right data",
    short: "Choose your data",
    category: "Getting started",
    icon: Settings2,
    intro: "VOLTRA has two data sources. Choose the one that matches what you want to do today.",
    steps: [
      "Open Settings → Data source. Choose ‘Explore with demo data’ to try the app without a device.",
      "Choose ‘Use my ESP32’ when you’re ready to read your own sensors. Then select a connection method in Device connection.",
      "Check the data-source banner on the monitoring pages before interpreting any readings.",
    ],
    note: "Hardware mode does not fall back to demo data. If the device disconnects, zero readings mean data is unavailable; they do not confirm the circuit is de-energized.",
    link: "/settings",
    action: "Choose a data source",
  },
  {
    id: "connect",
    title: "Connect your ESP32",
    short: "Connect a device",
    category: "Hardware setup",
    icon: PlugZap,
    intro:
      "You only need one connection method. Choose it based on where your device is and how its firmware is configured.",
    steps: [
      "USB cable: plug the board into your computer, close any other serial monitor, and choose its port in Settings. The app uses 115200 baud.",
      "Local Wi-Fi: put your computer and gateway on the same network. Enter the gateway’s IP address or hostname, then select Save & connect.",
      "Bluetooth: keep the board nearby and choose Pair Bluetooth device. Once paired, you can optionally send Wi-Fi details to the board.",
      "Blynk Cloud: use a board that is already online in Blynk. Paste its auth token, check the device, then connect.",
    ],
    note: "USB and Bluetooth need browser support, device permission, and a secure page (HTTPS or localhost). Settings shows whether these features are available in your current browser. Have a qualified installer handle mains wiring and sensor installation.",
    link: "/settings",
    action: "Open device settings",
  },
  {
    id: "read",
    title: "Make sense of your readings",
    short: "Read the live stream",
    category: "Monitoring",
    icon: Activity,
    intro:
      "The Stream page shows incoming electrical readings over time. Start with the overall load, then inspect individual signals.",
    steps: [
      "Open Live stream and check whether its banner says Demo data or Hardware connected.",
      "Use the signal controls to inspect voltage (V), current (A), and power (W). Compare changes in the waveform as loads change.",
      "Use the circuit filters to focus on a branch. Return to the combined view to compare it with the overall load.",
    ],
    note: "A connected transport is not a guarantee of fresh sensor readings. If values stop changing, check device power, firmware output, and the connection in Settings.",
    link: "/stream",
    action: "Open live stream",
  },
  {
    id: "groq",
    title: "Connect the AI assistant",
    short: "Connect Groq",
    category: "AI connection",
    icon: KeyRound,
    intro: "One Groq key powers the page-aware assistant and Usage Patterns questions.",
    steps: [
      "Open Settings → AI connection, paste a Groq API key, then choose Verify & save key.",
      "VOLTRA checks the key against Groq before saving it in this browser. The backend uses it for each request without storing it.",
      "Use Ask VOLTRA for page guidance, or open Patterns for questions grounded in recorded circuit history and adaptive observations.",
    ],
    note: "The key remains readable to this browser profile, so use a private device and remove it from Settings when you are finished. Assistant responses are advisory and cannot operate breakers.",
    link: "/settings",
    action: "Open AI settings",
  },
  {
    id: "breakers",
    title: "Understand circuit controls",
    short: "Manage breakers",
    category: "Circuit control",
    icon: ToggleRight,
    intro:
      "The Breakers page brings circuit states, load readings, and available controls into one view.",
    steps: [
      "Read the circuit name and state before using a control. Closed means on; open means off; tripped means the circuit has been opened by protection logic.",
      "Use demo mode to explore switching and the Simulate Spike action. Observe how an overload appears in the circuit state and event log.",
      "With real hardware, controls depend on the connected firmware and transport. Wait for the result of a command before sending another.",
    ],
    note: "Resolve the cause of a real trip before resetting a circuit. App readings and remote controls are not a substitute for electrical isolation or installed protection equipment.",
    link: "/breakers",
    action: "View circuit controls",
  },
  {
    id: "cost",
    title: "Explore energy costs",
    short: "Understand costs",
    category: "Energy analytics",
    icon: SlidersHorizontal,
    intro:
      "Use Analytics to explore load patterns and estimate what your electricity use could cost.",
    steps: [
      "Open Analytics and review the energy and circuit breakdowns.",
      "Adjust the utility tariff to match your electricity rate per kWh. Cost projections change with the selected rate.",
      "Compare larger loads and the displayed time periods to identify where changing usage may help.",
    ],
    note: "Treat projections as estimates. Your actual bill can include fixed charges, taxes, slab rates, and utility-specific rules. Demo and modeled charts do not represent measured billing history.",
    link: "/analytics",
    action: "Explore analytics",
  },
  {
    id: "patterns",
    title: "Learn your energy routine",
    short: "Explore usage patterns",
    category: "Usage intelligence",
    icon: Fingerprint,
    intro:
      "Usage patterns starts with recorded activity and your preferences, then adds comparisons as evidence grows.",
    steps: [
      "Open Patterns and choose a circuit. Personalize its name, expected hours, activity threshold, and daily runtime reminder—or skip setup to start with observations.",
      "Keep VOLTRA open to record activity. Review hourly power and the seven-day heatmap; striped cells mean missing data, not an inactive appliance.",
      "Review Adaptive circuit intelligence as it learns each circuit's active and standby power at a fixed five-second cadence. An observation means a sustained statistical deviation from that circuit's own baseline; it is not a fault diagnosis.",
      "Learned comparisons become available after five comparable days with at least 12 recorded hours each. Demo and hardware history stay separate.",
      "Ask the Groq usage assistant a question or request a suggestion. Sending a question shares the selected circuit summary and conversation with Groq.",
    ],
    note: "History and adaptive models are local to this browser, and recording stops when the app closes. Example history is fictional. Model observations and assistant responses never operate breakers. You can export a summary, change retention, delete usage history, or reset adaptive learning on the Patterns page.",
    link: "/patterns",
    action: "Open usage patterns",
  },
  {
    id: "export",
    title: "Keep a copy of your data",
    short: "Export readings & events",
    category: "Data & records",
    icon: Download,
    intro: "Settings offers two downloads, each designed for a different job.",
    steps: [
      "Choose Download CSV for the recent readings buffer: timestamps, voltage, current, power, and circuit states.",
      "Choose Download JSON for breaker trip events stored in this browser, alongside device and connection metadata.",
      "Check your data source before sharing a download. Recent readings collected in demo mode are simulated.",
    ],
    note: "Exports are local records, not certified or tamper-proof audits. Download anything you need to keep before clearing this browser’s site data.",
    link: "/settings",
    action: "Go to data exports",
  },
];
const troubleshooting = [
  {
    question: "My device doesn’t appear in the chooser",
    answer:
      "Check that the board is powered and running compatible firmware. For USB, use a data-capable cable and close other serial monitors. For Bluetooth, keep the board nearby and enable Bluetooth. If Settings reports the browser feature is unavailable, use a supported browser or another connection method.",
  },
  {
    question: "Why do I see zero readings in hardware mode?",
    answer:
      "Hardware mode waits for physical telemetry and does not substitute demo values. Check the connection banner and reconnect in Settings. Also check that your firmware is sending the expected readings. A zero shown by the app does not prove a circuit is safe to touch.",
  },
  {
    question: "The local Wi-Fi gateway won’t connect",
    answer:
      "Confirm the address and that both devices are on the same network. Check that the gateway exposes /api/ping and /api/readings and permits requests from this website. Your browser may ask you to allow local network access. Guest networks can prevent devices from reaching one another.",
  },
  {
    question: "Blynk says my device is offline",
    answer:
      "Check the board’s power and internet connection, and verify that the token belongs to that device. Use Check device again after the board appears online in your Blynk console, then choose Connect Blynk.",
  },
];

export function VoltraUserGuide({ compact = false }: { compact?: boolean }) {
  const { operatingMode } = useVoltricsStore();
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const prefix = useId();
  const search = query.trim().toLowerCase();
  const filtered = chapters.filter((chapter) =>
    [chapter.title, chapter.category, chapter.intro, chapter.note, ...chapter.steps]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
  const questions = troubleshooting.filter((item) =>
    `${item.question} ${item.answer}`.toLowerCase().includes(search),
  );

  if (compact)
    return (
      <section className="guide-preview">
        <div>
          <p className="workspace-eyebrow">THE VOLTRA FIELD GUIDE</p>
          <h2>A clear path from setup to insight.</h2>
          <p>Connect your device, understand your readings, and find your way around.</p>
          <Link to="/guide" className="workspace-button">
            Read the guide <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="guide-preview-links">
          {chapters.slice(0, 3).map((chapter, i) => (
            <Link to="/guide" hash={chapter.id} key={chapter.id}>
              <span>0{i + 1}</span>
              <strong>{chapter.short}</strong>
              <ArrowRight className="size-4" />
            </Link>
          ))}
        </div>
      </section>
    );

  return (
    <div className="workspace-wrap">
      <header className="workspace-heading guide-heading">
        <div>
          <p className="workspace-eyebrow">VOLTRA / FIELD GUIDE</p>
          <h1>
            A little clarity.
            <br />
            <span>A lot more control.</span>
          </h1>
          <p>
            From your first connection to your daily energy check.
            <br className="hidden sm:block" /> Practical instructions, one step at a time.
          </p>
        </div>
        <div className="guide-header-note">
          <BookOpen className="size-6" />
          <span>THE ESSENTIALS</span>
          <strong>
            {chapters.length} short chapters.
            <br />
            Start wherever you need.
          </strong>
          <a href="#start">
            Let’s get started <ArrowDown className="size-4" />
          </a>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="workspace-sidebar guide-sidebar">
          <label className="guide-search" htmlFor={`${prefix}-search`}>
            <Search className="size-4" />
            <input
              id={`${prefix}-search`}
              type="search"
              aria-label="Search the guide"
              placeholder="Find an answer…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>
                <X className="size-4" />
              </button>
            )}
          </label>
          <p className="workspace-eyebrow">In this guide</p>
          <nav aria-label="Guide chapters">
            {chapters.map((chapter, i) => (
              <a href={`#${chapter.id}`} key={chapter.id} onClick={() => setQuery("")}>
                <span>
                  {completed.includes(chapter.id) ? <Check className="size-3.5" /> : `0${i + 1}`}
                </span>
                {chapter.short}
              </a>
            ))}
            <a href="#troubleshooting" onClick={() => setQuery("")}>
              <span>?</span> Troubleshooting
            </a>
          </nav>
          <div className="guide-progress">
            <div>
              <span>Your reading progress</span>
              <strong>
                {completed.length} / {chapters.length}
              </strong>
            </div>
            <progress
              max={chapters.length}
              value={completed.length}
              aria-label="Chapters marked as read"
            />
            <p>
              Mark chapters as read as you go.
              <br />
              Progress lasts for this visit.
            </p>
          </div>
        </aside>
        <div className="workspace-content">
          {!query && (
            <div className="guide-start-note">
              <div className="guide-note-icon">
                <PlugZap className="size-5" />
              </div>
              <div>
                <strong>
                  {operatingMode === "SIMULATED"
                    ? "No device? You can still get started."
                    : "Setting up your own device?"}
                </strong>
                <p>
                  {operatingMode === "SIMULATED"
                    ? "You’re using demo data. Explore the stream and controls now, then connect hardware when you’re ready."
                    : "Start with a connection method in Settings. The app will wait for hardware readings until a device is connected."}
                </p>
              </div>
              <Link to={operatingMode === "SIMULATED" ? "/stream" : "/settings"}>
                {operatingMode === "SIMULATED" ? "Explore demo" : "Open settings"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
          {query && (
            <p role="status" className="guide-results">
              {filtered.length + questions.length}{" "}
              {filtered.length + questions.length === 1 ? "result" : "results"} for “{query}”
            </p>
          )}
          {filtered.map((chapter) => {
            const index = chapters.indexOf(chapter);
            const isRead = completed.includes(chapter.id);
            return (
              <article id={chapter.id} key={chapter.id} className="guide-chapter">
                <div className="guide-chapter-number">
                  0{index + 1}
                  <span />
                </div>
                <div className="guide-chapter-content">
                  <p className="workspace-eyebrow">{chapter.category}</p>
                  <h2>{chapter.title}</h2>
                  <p className="guide-intro">{chapter.intro}</p>
                  <ol className="guide-steps">
                    {chapter.steps.map((step, i) => (
                      <li key={step}>
                        <span>{i + 1}</span>
                        <p>{step}</p>
                      </li>
                    ))}
                  </ol>
                  <div className="guide-chapter-note">
                    <span>KEEP IN MIND</span>
                    <p>{chapter.note}</p>
                  </div>
                  <div className="guide-chapter-actions">
                    <Link
                      to={chapter.link}
                      hash={
                        chapter.id === "export"
                          ? "data-exports"
                          : chapter.id === "connect"
                            ? "device-connection"
                            : undefined
                      }
                    >
                      {chapter.action}
                      <ArrowRight className="size-4" />
                    </Link>
                    <button
                      type="button"
                      className={cn(isRead && "is-read")}
                      aria-pressed={isRead}
                      onClick={() =>
                        setCompleted((current) =>
                          isRead
                            ? current.filter((id) => id !== chapter.id)
                            : [...current, chapter.id],
                        )
                      }
                    >
                      <span>
                        <Check className="size-3" />
                      </span>
                      {isRead ? "Read" : "Mark as read"}
                      <span className="sr-only">: {chapter.title}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {questions.length > 0 && (
            <section id="troubleshooting" className="guide-troubleshooting">
              <p className="workspace-eyebrow">WHEN SOMETHING DOESN’T CONNECT</p>
              <h2>Let’s work it out.</h2>
              {questions.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <ChevronDown className="size-4" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          )}
          {filtered.length === 0 && questions.length === 0 && (
            <div className="guide-empty">
              <Search className="size-7" />
              <h2>No matching instructions</h2>
              <p>Try “USB”, “Wi-Fi”, “demo”, or “export”.</p>
              <button
                type="button"
                className="workspace-button secondary"
                onClick={() => setQuery("")}
              >
                Show all chapters
              </button>
            </div>
          )}
          <div className="workspace-endnote">
            <span>LESS GUESSWORK. MORE UNDERSTANDING.</span>
            <Link to="/settings">
              Go to settings <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

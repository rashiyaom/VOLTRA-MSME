import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, CircleStop, Database, Globe2, KeyRound, MessageCircle, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import {
  askPanelAssistant,
  assistantStatus,
  type AssistantStatus,
  type UsageMessage,
} from "@/services/usageAssistant";
import { subscribeToGroqKey } from "@/lib/groqSettings";

const SUGGESTIONS = [
  "Explain my current power reading in simple terms.",
  "What account and household details do you know about me?",
  "Find current energy-saving guidance for Indian homes.",
];

export function HomeEnergyAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<UsageMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { location } = useRouterState();
  const { operatingMode, connectionState, liveReading } = useVoltricsStore();

  const pageContext = useMemo(
    () => ({
      page: location.pathname,
      source: operatingMode === "SIMULATED" ? "demo" : "hardware",
      connection: connectionState,
      liveReading: {
        voltageV: Number(liveReading.voltage_rms.toFixed(1)),
        currentA: Number(liveReading.current_rms.toFixed(2)),
        activePowerW: Number(liveReading.active_power.toFixed(0)),
        powerFactor: Number(liveReading.power_factor.toFixed(2)),
        valid: liveReading.valid !== false,
      },
      circuits: liveReading.circuits.slice(0, 8).map((circuit) => ({
        id: circuit.id,
        label: circuit.name,
        state: circuit.state,
        currentA: Number(circuit.current.toFixed(2)),
        ratingA: circuit.rated,
      })),
    }),
    [connectionState, liveReading, location.pathname, operatingMode],
  );

  async function refreshStatus() {
    setStatusError("");
    try {
      setStatus(await assistantStatus());
    } catch (cause) {
      setStatusError(cause instanceof Error ? cause.message : "Assistant backend unavailable.");
    }
  }

  useEffect(() => {
    void refreshStatus();
    const unsubscribe = subscribeToGroqKey(() => void refreshStatus());
    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!messages.length && !loading) return;
    endRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [loading, messages]);

  async function send(text = input) {
    const question = text.trim();
    if (!question || loading || !status?.configured) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 45000);
    const history = [...messages];
    setMessages((current) => [...current, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const answer = await askPanelAssistant(question, pageContext, history, controller.signal);
      if (!controller.signal.aborted) {
        setMessages((current) => [...current, { role: "assistant", content: answer }]);
      }
    } catch (cause) {
      if (controller.signal.reason === "timeout") setError("The answer timed out. Please retry.");
      else if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "The assistant could not answer.");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="voltra-assistant-launcher fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open VOLTRA assistant"
          className="group flex items-center gap-2.5 rounded-full border border-border bg-card p-2.5 text-xs font-semibold text-foreground shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted sm:px-4"
        >
          <span className="relative grid size-7 place-items-center rounded-full bg-foreground text-background">
            <MessageCircle className="size-3.5" />
            <i
              className={`absolute -right-0.5 -top-0.5 size-2 rounded-full border-2 border-card ${status?.configured ? "bg-emerald-500" : "bg-amber-400"}`}
            />
          </span>
          <span className="hidden sm:inline">Ask VOLTRA</span>
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col border-border bg-background p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border bg-card/65 px-5 py-4 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background">
                  <Bot className="size-4" />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="text-sm font-semibold text-foreground">
                    VOLTRA assistant
                  </SheetTitle>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                    Personal data · VOLTRA context · live web
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Clear conversation"
                title="Clear conversation"
                disabled={!messages.length || loading}
                onClick={() => {
                  setMessages([]);
                  setError("");
                }}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="border-b border-border px-5 py-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/55 px-2 py-2">
                <strong className="block text-sm font-semibold">
                  {liveReading.active_power.toFixed(0)} W
                </strong>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Power
                </span>
              </div>
              <div className="rounded-lg bg-muted/55 px-2 py-2">
                <strong className="block text-sm font-semibold">
                  {liveReading.current_rms.toFixed(2)} A
                </strong>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Current
                </span>
              </div>
              <div className="rounded-lg bg-muted/55 px-2 py-2">
                <strong className="block text-sm font-semibold">
                  {liveReading.circuits.length}
                </strong>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  Circuits
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm" aria-live="polite">
            {!status?.configured && !statusError && (
              <div className="rounded-xl border border-border bg-card p-4">
                <KeyRound className="mb-4 size-5 text-primary" />
                <h3 className="font-display text-xl font-medium tracking-tight">
                  Connect your own Groq key.
                </h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  One browser-level connection powers this assistant and Usage Patterns. VOLTRA does
                  not save your key on the backend.
                </p>
                <Link
                  to="/settings"
                  hash="ai-assistant"
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary"
                >
                  Open AI connection settings <ArrowUp className="size-3 rotate-45" />
                </Link>
              </div>
            )}

            {statusError && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs leading-6">
                <p>{statusError}</p>
                <button
                  type="button"
                  onClick={() => void refreshStatus()}
                  className="mt-2 font-semibold text-primary"
                >
                  Check again
                </button>
              </div>
            )}

            {status?.configured && messages.length === 0 && (
              <div>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">
                  YOUR ENERGY COPILOT
                </span>
                <h3 className="mt-2 font-display text-2xl font-medium tracking-tight">
                  Ask your home—or ask the web.
                </h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">
                  Get answers from your signed-in profile, saved household setup, current VOLTRA
                  readings, and external web sources. Device controls always remain with you.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    <Database className="size-3" /> Your VOLTRA data
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                    <Globe2 className="size-3" /> Current web answers
                  </span>
                </div>
                <div className="mt-5 grid gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-xs transition hover:border-primary/40 hover:bg-muted"
                    >
                      {suggestion}
                      <ArrowUp className="size-3 shrink-0 rotate-45" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-8 rounded-xl bg-foreground p-3 text-background"
                    : "voltra-chat-answer mr-1 rounded-2xl border border-border bg-card p-4 shadow-sm"
                }
              >
                <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider opacity-65">
                  {message.role === "user" ? "You" : "VOLTRA · Groq"}
                </span>
                <div className="voltra-chat-markdown prose prose-sm max-w-none text-inherit dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              </div>
            ))}

            {loading && (
              <div className="voltra-chat-answer mr-1 rounded-2xl border border-border bg-card p-4" role="status">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  Checking your VOLTRA context and trusted sources…
                </span>
                <div className="mt-2 flex gap-1">
                  {[0, 1, 2].map((dot) => (
                    <i key={dot} className="size-1.5 animate-pulse rounded-full bg-primary" />
                  ))}
                </div>
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-destructive/8 p-3 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-border bg-card/65 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label htmlFor="panel-assistant-question" className="sr-only">
              Ask VOLTRA
            </label>
            <div className="flex items-end gap-2 rounded-xl border border-border bg-background p-2 focus-within:border-primary/50">
              <textarea
                id="panel-assistant-question"
                rows={2}
                maxLength={1200}
                value={input}
                disabled={!status?.configured || loading}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  status?.configured
                    ? "Ask about your home, account, energy, or the wider web…"
                    : "Connect Groq in Settings"
                }
                className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-5 outline-none placeholder:text-muted-foreground"
              />
              {loading ? (
                <button
                  type="button"
                  aria-label="Stop generating"
                  onClick={() => request.current?.abort()}
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background"
                >
                  <CircleStop className="size-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send question"
                  disabled={!status?.configured || !input.trim()}
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-foreground text-background disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>{status?.model || "Groq disconnected"}</span>
              <Link to="/settings" hash="ai-assistant" onClick={() => setOpen(false)}>
                Connection
              </Link>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ArrowUp, Bot, CircleStop, RefreshCw, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  askUsageAssistant,
  assistantStatus,
  type UsageMessage,
  type AssistantStatus,
} from "@/services/usageAssistant";
import { subscribeToGroqKey } from "@/lib/groqSettings";

export function UsageAssistant({
  context,
  sourceLabel,
}: {
  context: Record<string, unknown>;
  sourceLabel: string;
}) {
  const [messages, setMessages] = useState<UsageMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const request = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null);
  async function checkStatus() {
    setStatusError("");
    try {
      setStatus(await assistantStatus());
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Backend unavailable");
    }
  }
  useEffect(() => {
    void checkStatus();
    const unsubscribe = subscribeToGroqKey(() => void checkStatus());
    return () => {
      unsubscribe();
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (messages.length)
      end.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
      });
  }, [messages, busy]);
  async function ask(value = question) {
    const prompt = value.trim();
    if (!prompt || busy) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort("timeout"), 45000);
    setPendingQuestion(prompt);
    setBusy(true);
    setError("");
    setQuestion("");
    try {
      const answer = await askUsageAssistant(prompt, context, messages, controller.signal);
      if (!controller.signal.aborted)
        setMessages((current) => [
          ...current,
          { role: "user", content: prompt },
          { role: "assistant", content: answer },
        ]);
    } catch (e) {
      if (controller.signal.reason === "timeout")
        setError("The answer timed out. Please try again.");
      else if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Unable to get an answer.");
      setQuestion(prompt);
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <aside className="patterns-assistant" aria-label="Usage assistant">
      <div className="assistant-heading">
        <div className="assistant-symbol">
          <Bot size={22} />
        </div>
        <div>
          <h2>Ask your data.</h2>
          <p>Usage assistant · Groq</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="patterns-icon-button"
            aria-label="Clear conversation"
            disabled={busy}
            onClick={() => {
              setMessages([]);
              setError("");
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="assistant-context">
        <span className="patterns-dot" />
        {sourceLabel}
        <span>Personal context + web</span>
      </div>
      {statusError ? (
        <div className="assistant-status" role="status">
          <p>Assistant backend unavailable. Your local analysis still works.</p>
          <button type="button" onClick={checkStatus}>
            <RefreshCw size={12} /> Check again
          </button>
        </div>
      ) : status && !status.configured ? (
        <div className="assistant-status">
          <p>
            Groq isn’t connected yet. Add your API key in Settings to enable questions across
            VOLTRA.
          </p>
          <Link to="/settings" hash="ai-assistant">
            Open AI settings <ArrowUpRight size={12} />
          </Link>
        </div>
      ) : null}
      <div className="assistant-conversation" aria-live="polite" aria-busy={busy}>
        {!messages.length && (
          <div className="assistant-welcome">
            <span className="patterns-overline">YOUR ENERGY COPILOT</span>
            <h3>
              Ask your data.
              <br />
              Explore beyond it.
            </h3>
            <p>
              Ask about your activity, saved household setup, bill plan, or an external energy
              question. Personal answers stay grounded in the data VOLTRA actually has.
            </p>
            <div className="assistant-prompts">
              {[
                "What can you tell me so far?",
                "What household details do you know about me?",
                "Find current ways to reduce AC costs in India.",
              ].map((prompt) => (
                <button type="button" key={prompt} disabled={busy} onClick={() => ask(prompt)}>
                  {prompt}
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`assistant-message ${message.role}`} key={index}>
            <span>{message.role === "user" ? "YOU" : "VOLTRA · GROQ"}</span>
            <div className="voltra-chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {busy && (
          <div className="assistant-message user">
            <span>YOU</span>
            <p>{pendingQuestion}</p>
          </div>
        )}
        {busy && (
          <div className="assistant-thinking" role="status">
            <span />
            <span />
            <span />
            <p>Checking your VOLTRA context and trusted sources…</p>
          </div>
        )}
        <div ref={end} />
      </div>
      {error && (
        <p className="patterns-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="sr-only" htmlFor="usage-question">
          Ask about your usage
        </label>
        <textarea
          id="usage-question"
          value={question}
          maxLength={1200}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your usage, account, or anything energy-related…"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div>
          <span>Enter to send · Shift + Enter for a new line</span>
          {busy ? (
            <button
              type="button"
              aria-label="Stop generating"
              onClick={() => request.current?.abort()}
            >
              <CircleStop size={18} />
            </button>
          ) : (
            <button type="submit" disabled={!question.trim()} aria-label="Send question">
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
      <p className="assistant-disclosure">
        Questions can use your signed-in VOLTRA profile, household summary, and Groq web search.
        Answers are advisory; the assistant cannot operate device controls.
      </p>
    </aside>
  );
}

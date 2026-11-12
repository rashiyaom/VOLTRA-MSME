import { groqRequestHeaders } from "@/lib/groqSettings";
import { readApiBase } from "@/lib/apiSettings";
import { authSession } from "@/lib/authSession";
import { readBillPlanSettings } from "@/lib/billPlan";
import { readUsagePreferences } from "@/services/usageHistory";

function personalContext() {
  if (typeof window === "undefined") return {};
  const source = localStorage.getItem("voltrics_operating_mode") === "REALTIME" ? "hardware" : "demo";
  const signedIn = authSession.isAuthenticated();
  const profile = authSession.getProfile();
  const bill = readBillPlanSettings(source);
  const usage = readUsagePreferences(source);
  return {
    signedIn,
    household: signedIn
      ? {
          name: profile.name,
          role: profile.role,
          zone: profile.zone,
          designation: profile.designation || null,
        }
      : null,
    monthlyPlan: bill.configured
      ? {
          targetInr: bill.target,
          cycleStart: bill.cycleStart,
          cycleEnd: bill.cycleEnd,
          tariffPerKwh: bill.tariffRate,
          fixedCharges: bill.fixedCharges,
          taxPercent: bill.taxPercent,
          addedAppliances: bill.manualAppliances.map((appliance) => ({
            name: appliance.name,
            category: appliance.category,
            watts: appliance.watts,
            quantity: appliance.quantity,
            essential: appliance.essential,
          })),
        }
      : { configured: false },
    usageSetup: {
      source,
      configured: usage.configured,
      goal: usage.goal,
      circuits: Object.entries(usage.circuits).map(([id, circuit]) => ({
        id,
        name: circuit.name,
        equipment: circuit.equipment,
        thresholdW: circuit.thresholdW,
        runtimeReminderHours: circuit.runtimeHours,
        scheduleEnabled: circuit.schedule,
      })),
    },
  };
}

function assistantRequestHeaders(includeJson = false) {
  const token = authSession.getToken();
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...groqRequestHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
export interface UsageMessage {
  role: "user" | "assistant";
  content: string;
}
export interface AssistantStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  keySource: "browser" | "server" | null;
  webSearchAvailable: boolean;
}
export async function assistantStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  const response = await fetch(`${readApiBase()}/api/usage/status`, {
    headers: groqRequestHeaders(),
    signal: signal ?? AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("The usage assistant backend is unavailable.");
  return response.json();
}
export async function askUsageAssistant(
  question: string,
  context: Record<string, unknown>,
  history: UsageMessage[],
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${readApiBase()}/api/usage/chat`, {
      method: "POST",
      headers: assistantRequestHeaders(true),
      body: JSON.stringify({
        question,
        context: { ...context, userContext: personalContext() },
        history: history.slice(-8).map((m) => ({ ...m, content: m.content.slice(0, 5000) })),
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Couldn’t reach the usage assistant. Check that the VOLTRA backend is running.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The assistant could not answer. Please try again.",
    );
  if (typeof data.answer !== "string") throw new Error("The assistant returned an empty response.");
  return data.answer;
}

export interface GroqVerification extends AssistantStatus {
  modelAvailable: boolean;
}

export async function verifyGroqKey(
  apiKey: string,
  signal?: AbortSignal,
): Promise<GroqVerification> {
  let response: Response;
  try {
    response = await fetch(`${readApiBase()}/api/usage/verify`, {
      method: "POST",
      headers: groqRequestHeaders(apiKey),
      signal: signal ?? AbortSignal.timeout(18000),
    });
  } catch {
    throw new Error("Couldn’t reach the VOLTRA backend to validate this key.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Groq could not validate this key.",
    );
  }
  return data;
}

export async function askPanelAssistant(
  question: string,
  context: Record<string, unknown>,
  history: UsageMessage[],
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${readApiBase()}/api/usage/help`, {
      method: "POST",
      headers: assistantRequestHeaders(true),
      body: JSON.stringify({
        question,
        context: { ...context, userContext: personalContext() },
        history: history.slice(-8).map((message) => ({
          ...message,
          content: message.content.slice(0, 5000),
        })),
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Couldn’t reach the VOLTRA assistant. Check that the backend is running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The assistant could not answer. Please retry.",
    );
  }
  if (typeof data.answer !== "string") throw new Error("The assistant returned an empty response.");
  return data.answer;
}

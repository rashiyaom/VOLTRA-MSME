const STORAGE_KEY = "voltra.groq.api-key";
const CHANGE_EVENT = "voltra:groq-key-change";

export function readGroqApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function saveGroqApiKey(value: string): void {
  if (typeof window === "undefined") return;
  const key = value.trim();
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    throw new Error("This browser blocked local storage, so the Groq key could not be saved.");
  }
}

export function clearGroqApiKey(): void {
  saveGroqApiKey("");
}

export function groqRequestHeaders(override?: string): Record<string, string> {
  const key = override?.trim() || readGroqApiKey();
  return key ? { "X-Voltra-Groq-Key": key } : {};
}

export function subscribeToGroqKey(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function maskedGroqKey(key: string): string {
  if (!key) return "";
  if (key.length < 10) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

const STORAGE_KEY = "voltra.blynk.device-token";
const CHANGE_EVENT = "voltra:blynk-token-change";

export function readBlynkToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function saveBlynkToken(value: string): void {
  if (typeof window === "undefined") return;
  const token = value.trim();
  if (!token) throw new Error("Enter a Blynk device auth token before saving.");
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    throw new Error("This device blocked local storage, so the Blynk token could not be saved.");
  }
}

export function clearBlynkToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    throw new Error("This device blocked local storage, so the Blynk token could not be removed.");
  }
}

export function maskedBlynkToken(token: string): string {
  if (!token) return "";
  if (token.length < 10) return "••••••••";
  return `${token.slice(0, 4)}••••••••${token.slice(-4)}`;
}

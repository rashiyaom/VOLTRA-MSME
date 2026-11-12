const API_STORAGE_KEY = "voltra.api.base";
const FALLBACK_API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(
  /\/$/,
  "",
);

export function normalizeApiBase(value: string): string {
  const input = value.trim();
  if (!input) return FALLBACK_API_BASE;
  const url = new URL(/^https?:\/\//i.test(input) ? input : `http://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("Use an HTTP or HTTPS backend address without credentials.");
  }
  return url.origin;
}

export function readApiBase(): string {
  if (typeof localStorage === "undefined") return FALLBACK_API_BASE;
  try {
    return normalizeApiBase(localStorage.getItem(API_STORAGE_KEY) || FALLBACK_API_BASE);
  } catch {
    return FALLBACK_API_BASE;
  }
}

export function saveApiBase(value: string): string {
  const normalized = normalizeApiBase(value);
  localStorage.setItem(API_STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent("voltra-api-base-changed", { detail: normalized }));
  return normalized;
}

export function defaultApiBase(): string {
  return FALLBACK_API_BASE;
}

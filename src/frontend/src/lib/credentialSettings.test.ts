import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBlynkToken, readBlynkToken, saveBlynkToken } from "./blynkSettings";
import { clearGroqApiKey, readGroqApiKey, saveGroqApiKey } from "./groqSettings";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage;
}

describe("persistent API credentials", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: memoryStorage(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps the Blynk token until it is explicitly removed", () => {
    saveBlynkToken("  blynk-device-token  ");
    expect(readBlynkToken()).toBe("blynk-device-token");
    clearBlynkToken();
    expect(readBlynkToken()).toBe("");
  });

  it("keeps the Groq key until it is explicitly removed", () => {
    saveGroqApiKey("  gsk_saved-key  ");
    expect(readGroqApiKey()).toBe("gsk_saved-key");
    clearGroqApiKey();
    expect(readGroqApiKey()).toBe("");
  });
});

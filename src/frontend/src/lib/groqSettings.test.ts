import { describe, expect, it } from "vitest";
import { groqRequestHeaders, maskedGroqKey } from "./groqSettings";

describe("Groq settings", () => {
  it("sends an explicitly supplied key only in the dedicated request header", () => {
    expect(groqRequestHeaders("  gsk_test-secret  ")).toEqual({
      "X-Voltra-Groq-Key": "gsk_test-secret",
    });
  });

  it("masks saved credentials without exposing the full value", () => {
    const key = "gsk_1234567890secret";
    const masked = maskedGroqKey(key);
    expect(masked).toBe("gsk_••••••••cret");
    expect(masked).not.toContain("1234567890");
  });
});

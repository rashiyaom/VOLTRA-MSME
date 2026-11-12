import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSession } from "./authSession";

describe("account session", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    const localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", {
      localStorage,
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates a session only from a successful backend login", async () => {
    const payload = {
      token: "signed-server-token",
      profile: {
        id: "user-1",
        name: "Home owner",
        email: "home@example.com",
        role: "Homeowner Admin",
        zone: "Main panel",
        substation: "VOLTRA panel",
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await authSession.loginWithCredentials({
      email: "home@example.com",
      password: "correct-password",
    });

    expect(result.token).toBe("signed-server-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/auth/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(authSession.getToken()).toBe("signed-server-token");
  });

  it("surfaces backend rejection without creating a local session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Invalid email or password." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      authSession.loginWithCredentials({ email: "home@example.com", password: "wrong-pass" }),
    ).rejects.toThrow("Invalid email or password.");
    expect(authSession.getSession()).toBeNull();
  });
});

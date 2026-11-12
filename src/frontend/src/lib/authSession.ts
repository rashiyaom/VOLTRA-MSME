/**
 * authSession.ts
 * ==============
 * Manages authenticated VOLTRA operator and homeowner sessions.
 */

import { readApiBase } from "@/lib/apiSettings";

export interface OperatorProfile {
  name: string;
  email: string;
  role: string;
  zone: string;
  substation: string;
  id?: string;
  image?: string | null;
  designation?: string;
  provider?: "credentials" | "google";
}

export interface OperatorSession {
  profile: OperatorProfile;
  sessionToken: string | null;
  signedInAt: string;
}

export interface UserLocationState {
  latitude: number;
  longitude: number;
  city: string;
  region: string;
  autoDetected: boolean;
  timestamp: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  zone?: string;
  role?: string;
  designation?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  profile: OperatorProfile & {
    id: string;
    substation?: string;
    createdAt?: string;
    lastLoginAt?: string;
  };
}

const STORAGE_KEY_SESSION = "voltra_operator_session";
const STORAGE_KEY_LOC = "voltra_user_location";
async function authRequest(path: string, init: RequestInit): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(`${readApiBase()}/api/auth/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error(
      "Couldn’t reach the VOLTRA account service. Check that the backend is running.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : "The account request could not be completed.",
    );
  }
  return data as AuthResponse;
}

const DEFAULT_LOCATION: UserLocationState = {
  latitude: 28.6139,
  longitude: 77.209,
  city: "Smart Panel Hub",
  region: "Residential Electrical Grid",
  autoDetected: false,
  timestamp: new Date().toISOString(),
};

const DEFAULT_PROFILE: OperatorProfile = {
  name: "Om Rashiya",
  email: "operator@voltra.energy",
  role: "Homeowner & Panel Admin",
  zone: "Main Residential Service (40A / 230V)",
  substation: "VOLTRA Smart Panel Node #1",
};

export const authSession = {
  getSession(): OperatorSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  getProfile(): OperatorProfile {
    const s = this.getSession();
    return s?.profile ?? DEFAULT_PROFILE;
  },

  getToken(): string | null {
    const s = this.getSession();
    return s?.sessionToken ?? null;
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  setSession(profile: OperatorProfile, token: string | null): void {
    if (typeof window === "undefined") return;
    const session: OperatorSession = {
      profile,
      sessionToken: token,
      signedInAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("voltra-auth-change", { detail: session }));
  },

  logout(): void {
    if (typeof window === "undefined") return;
    const token = this.getToken();
    localStorage.removeItem(STORAGE_KEY_SESSION);
    window.dispatchEvent(new CustomEvent("voltra-auth-change", { detail: null }));
    if (token) {
      void fetch(`${readApiBase()}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  },

  async loginWithCredentials(req: LoginRequest): Promise<AuthResponse> {
    const response = await authRequest("login", {
      method: "POST",
      body: JSON.stringify(req),
    });
    this.setSession(response.profile, response.token);
    return response;
  },

  async register(req: RegisterRequest): Promise<AuthResponse> {
    const response = await authRequest("register", {
      method: "POST",
      body: JSON.stringify(req),
    });
    this.setSession(response.profile, response.token);
    return response;
  },

  startGoogleOAuth(): void {
    window.location.href = `${readApiBase()}/api/auth/google`;
  },

  consumeGoogleCallbackParams(params: URLSearchParams): boolean {
    const token = params.get("token");
    if (!token) return false;
    const name = params.get("name") || "Google Panel User";
    const email = params.get("email") || "user@voltra.energy";
    const role = params.get("role") || "Homeowner & Panel Admin";
    const zone = params.get("zone") || "Main Residential Service (40A / 230V)";

    const profile: OperatorProfile = {
      name,
      email,
      role,
      zone,
      substation: "VOLTRA Smart Panel Node #1",
      id: "usr-google-" + Date.now(),
      provider: "google",
    };
    this.setSession(profile, token);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return true;
  },

  getLocation(): UserLocationState {
    if (typeof window === "undefined") return DEFAULT_LOCATION;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_LOC);
      if (!raw) return DEFAULT_LOCATION;
      return JSON.parse(raw);
    } catch {
      return DEFAULT_LOCATION;
    }
  },

  setLocation(loc: Partial<UserLocationState>): void {
    if (typeof window === "undefined") return;
    const current = this.getLocation();
    const updated = { ...current, ...loc, timestamp: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY_LOC, JSON.stringify(updated));
  },
};

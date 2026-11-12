import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Menu,
  Sun,
  Moon,
  LogIn,
  LogOut,
  User,
  ArrowUpRight,
  X,
  Zap,
  Home,
  Activity,
  LayoutDashboard,
  MapPin,
  ShieldAlert,
  Cpu,
  Layers,
  ToggleRight,
  Sliders,
  Settings as SettingsIcon,
  BookOpen,
  Fingerprint,
  BadgeIndianRupee,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { VoltraLogo } from "@/components/VoltraLogo";
import { authSession, type OperatorProfile } from "@/lib/authSession";
import { voltricsStore, type Esp32HardwareConfig } from "@/lib/voltricsStore";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV_LINKS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/stream", label: "Stream", icon: Activity },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/breakers", label: "Breakers", icon: ToggleRight },
  { to: "/analytics", label: "Analytics", icon: Sliders },
  { to: "/patterns", label: "Patterns", icon: Fingerprint },
  { to: "/bill-plan", label: "Bill plan", icon: BadgeIndianRupee },
  { to: "/guide", label: "Guide", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const MOBILE_PRIMARY_LINKS = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/breakers", label: "Loads", icon: ToggleRight },
  { to: "/stream", label: "Live", icon: Activity },
  { to: "/patterns", label: "Patterns", icon: Fingerprint },
] as const;

const PAGE_LABELS: Record<string, string> = {
  "/": "Home",
  "/dashboard": "Energy overview",
  "/breakers": "Load control",
  "/stream": "Live readings",
  "/analytics": "Analytics",
  "/patterns": "Usage patterns",
  "/bill-plan": "Bill plan",
  "/guide": "Field guide",
  "/settings": "Settings",
};

export function SiteNav() {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const path = location.pathname;
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");

  const { operatingMode, connectionState } = useVoltricsStore();
  const isConnected = connectionState.startsWith("CONNECTED");

  // Client-side only — sync with document & localStorage
  useEffect(() => {
    setProfile(authSession.getProfile());
    setMounted(true);
    if (typeof document !== "undefined") {
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark") ||
        localStorage.getItem("cinematic-theme") === "dark" ||
        localStorage.getItem("voltra-theme") === "dark";
      const initial = isDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.classList.toggle("dark", isDark);
      document.body.classList.toggle("dark", isDark);
    }

    const onThemeChanged = (e: any) => {
      const t = e.detail?.theme;
      if (t === "dark" || t === "light") {
        setTheme(t);
      }
    };
    window.addEventListener("voltra-theme-changed", onThemeChanged);
    return () => window.removeEventListener("voltra-theme-changed", onThemeChanged);
  }, []);

  // Re-sync profile when route changes (handles post-login redirect)
  useEffect(() => {
    if (mounted) {
      setProfile(authSession.getProfile());
    }
  }, [path, mounted]);

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [path]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isAuthenticated = mounted && !!profile;

  const handleSignOut = useCallback(() => {
    authSession.logout();
    setProfile(null);
    setOpen(false);
    toast.success("Signed out of VOLTRA console");
    navigate({ to: "/login" });
  }, [navigate]);

  const toggleTheme = useCallback(() => {
    if (typeof document === "undefined") return;
    const isCurrentlyDark =
      document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark");
    const next = isCurrentlyDark ? "light" : "dark";

    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.body.classList.toggle("dark", next === "dark");

    const sliceEl = document.getElementById("voltraSliceOverlay");
    if (sliceEl) {
      sliceEl.classList.remove("slice-theme-light", "slice-theme-dark");
      sliceEl.classList.add(next === "dark" ? "slice-theme-dark" : "slice-theme-light");
    }

    localStorage.setItem("cinematic-theme", next);
    localStorage.setItem("voltra-theme", next);
    window.dispatchEvent(new CustomEvent("voltra-theme-changed", { detail: { theme: next } }));
  }, []);

  const [hardware, setHardware] = useState<Esp32HardwareConfig>(() =>
    voltricsStore.getHardwareConfig(),
  );

  // Listen to hardware mode changes
  useEffect(() => {
    const handleHwUpdate = () => {
      setHardware(voltricsStore.getHardwareConfig());
    };
    window.addEventListener("voltrics-hardware-changed", handleHwUpdate);
    return () => window.removeEventListener("voltrics-hardware-changed", handleHwUpdate);
  }, []);

  return (
    <>
      <header className="voltra-mobile-header md:hidden">
        <Link to="/dashboard" aria-label="Open VOLTRA dashboard" className="voltra-mobile-brand">
          <span className="voltra-mobile-mark"><Zap aria-hidden="true" /></span>
          <span>
            <b>{PAGE_LABELS[path] || "VOLTRA"}</b>
            <small>
              <i
                className={cn(
                  operatingMode === "SIMULATED"
                    ? "is-demo"
                    : isConnected
                      ? "is-connected"
                      : "is-offline",
                )}
              />
              {operatingMode === "SIMULATED"
                ? "Demo workspace"
                : isConnected
                  ? "Panel connected"
                  : "Panel offline"}
            </small>
          </span>
        </Link>
        <button
          type="button"
          className="voltra-mobile-menu-trigger"
          aria-label={open ? "Close app menu" : "Open app menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>

      {/* ── Floating Premium Aerodynamic Top Bar ─────────────────────────────────────────────── */}
      <header className="voltra-desktop-nav hidden md:block sticky top-2 sm:top-3.5 z-50 mx-auto w-[calc(100%-1.25rem)] sm:w-[calc(100%-2rem)] max-w-6xl rounded-xl border border-white/[0.12] bg-[#0c0d11]/90 shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur-2xl transition-all mb-3 sm:mb-4">
        <div className="flex h-12 sm:h-13 w-full items-center justify-between px-3.5 sm:px-5 lg:px-6 gap-2 sm:gap-3">
          {/* Left: Brand - ⚡ VOLTRA */}
          <Link
            to="/"
            aria-label="VOLTRA Home"
            className="flex items-center gap-2 transition-transform hover:scale-105 shrink-0"
          >
            <Zap className="size-4 text-[#d2f831]" aria-hidden="true" />
            <span className="text-sm sm:text-base font-bold leading-none tracking-tight text-white font-mono">
              VOLTRA
            </span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-0.5 xl:gap-1 xl:flex"
          >
            {NAV_LINKS.map((link) => {
              const active = link.to === "/" ? path === "/" : path.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-2 xl:px-3 text-xs font-medium transition-colors whitespace-nowrap",
                    active
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:text-white hover:bg-white/5",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Hardware Status Pill, Operator Pill & Control Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              to="/settings"
              title="Manage data source in Settings"
              className="hidden sm:inline-flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-neutral-300 hover:bg-white/5"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  operatingMode === "SIMULATED"
                    ? "bg-neutral-400"
                    : isConnected
                      ? "bg-emerald-400"
                      : "bg-amber-400",
                )}
              />
              {operatingMode === "SIMULATED"
                ? "Demo data"
                : isConnected
                  ? "Hardware connected"
                  : "Device offline"}
            </Link>

            {/* Auth Pill — signed in (desktop) */}
            {isAuthenticated && (
              <div className="hidden items-center gap-1 sm:flex">
                <span
                  title={`${profile!.role} · ${profile!.zone}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white shadow-xs backdrop-blur-md cursor-default"
                >
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                  <span className="max-w-[120px] truncate">{profile!.name}</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out"
                  className="grid size-8 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-rose-500/15 hover:border-rose-500/30 transition-all cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                </button>
              </div>
            )}

            {/* Auth Pill — not signed in (desktop) */}
            {mounted && !isAuthenticated && (
              <Link
                to="/login"
                className="hidden items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-white/[0.12] hover:border-white/20 sm:inline-flex"
              >
                <LogIn className="size-3.5" />
                Sign In
              </Link>
            )}

            {/* Day/Night Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}
              className="grid size-8.5 place-items-center rounded-full border border-white/[0.1] bg-white/[0.05] backdrop-blur-md text-white shadow-xs transition-all hover:scale-105 hover:bg-white/[0.1] active:scale-95 cursor-pointer"
            >
              {theme === "dark" ? (
                <Sun className="size-4 text-amber-400" />
              ) : (
                <Moon className="size-4 text-neutral-300" />
              )}
            </button>

            {/* Mobile Hamburger (visible on screens < lg) */}
            <button
              type="button"
              aria-label={open ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid size-8.5 place-items-center rounded-full border border-white/[0.12] bg-white/[0.06] xl:hidden shadow-xs text-white transition-all hover:bg-white/[0.14] active:scale-95 cursor-pointer"
            >
              {open ? <X className="size-4 text-white" /> : <Menu className="size-4 text-white" />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile & Tablet Glassmorphic Overlay Drawer ──────────────────────────────── */}
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`voltra-mobile-menu-backdrop fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 xl:hidden ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Dropdown Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        inert={!open}
        aria-label="Navigation menu"
        className={`voltra-mobile-menu fixed inset-x-3 sm:inset-x-6 top-16 sm:top-18.5 z-50 max-w-lg mx-auto xl:hidden transition-all duration-300 ease-out ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto scale-100"
            : "opacity-0 -translate-y-3 pointer-events-none scale-98"
        }`}
      >
        <div className="overflow-hidden rounded-3xl border border-white/[0.14] bg-[#0c0d11]/95 text-white shadow-[0_25px_60px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-2xl">
          {/* Header Status Bar in Mobile Menu */}
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-2.5 bg-white/[0.02]">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 text-xs text-neutral-300"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  operatingMode === "SIMULATED"
                    ? "bg-neutral-400"
                    : isConnected
                      ? "bg-emerald-400"
                      : "bg-amber-400",
                )}
              />
              {operatingMode === "SIMULATED"
                ? "Demo data"
                : isConnected
                  ? "Hardware connected"
                  : "Device offline"}
              <SettingsIcon className="size-3.5" />
            </Link>
            <span className="text-[10px] font-mono text-neutral-500">VOLTRA v2.4</span>
          </div>

          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-1.5 p-3">
            {NAV_LINKS.map((link) => {
              const active = link.to === "/" ? path === "/" : path.startsWith(link.to);
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-xs font-medium transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-neutral-400 hover:text-white hover:bg-white/5",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Live Grid Action CTA */}
          <div className="px-3 pb-2">
            <Link
              to="/dashboard"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-2xl bg-white/5 border border-[#d2f831]/30 px-4 py-2.5 text-xs font-bold text-[#d2f831] transition-all hover:bg-[#d2f831]/25 active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <Zap className="size-4 text-[#d2f831]" />
                <span>Open dashboard</span>
              </span>
              <ArrowUpRight className="size-4 text-[#d2f831]" />
            </Link>
          </div>

          {/* Operator Profile & Quick Settings */}
          <div className="border-t border-white/[0.08] p-3 bg-white/[0.02]">
            {isAuthenticated ? (
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <User className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{profile!.name}</div>
                    <div className="text-[10px] font-mono text-neutral-400 truncate">
                      {profile!.role} · {profile!.zone}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out"
                  className="flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-all shrink-0 cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                  <span>Exit</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.12] bg-white/[0.06] py-2.5 text-xs font-bold text-white transition-all hover:bg-white/[0.12]"
              >
                <LogIn className="size-4" />
                <span>Sign In to Operator Console</span>
              </Link>
            )}

            {/* Theme Switcher in Drawer */}
            <div className="mt-2.5 flex items-center justify-between px-1">
              <span className="text-[11px] text-neutral-400 font-medium">Appearance</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1 text-xs font-medium text-white hover:bg-white/[0.1] transition-all cursor-pointer"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="size-3.5 text-amber-400" />
                    <span>Day Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="size-3.5 text-neutral-300" />
                    <span>Night Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="voltra-bottom-nav md:hidden" aria-label="Primary app navigation">
        {MOBILE_PRIMARY_LINKS.map((link) => {
          const active = path === link.to || path.startsWith(`${link.to}/`);
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              aria-current={active ? "page" : undefined}
              className={cn("voltra-bottom-item", active && "is-active")}
            >
              <span><Icon /></span>
              <b>{link.label}</b>
            </Link>
          );
        })}
        <button
          type="button"
          className={cn(
            "voltra-bottom-item",
            ["/analytics", "/bill-plan", "/guide", "/settings", "/"].includes(path) &&
              "is-active",
          )}
          aria-label="Open more sections"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span><Menu /></span>
          <b>More</b>
        </button>
      </nav>
    </>
  );
}

import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Theme } from "./types.ts";
import type { CinematicThemeTransition } from "./CinematicThemeTransition.ts";

interface CinematicLandingProps {
  children: React.ReactNode;
  isHomePage?: boolean;
}

/**
 * HOUSE_POINTS — polygon tracing the house roofline + base in the 2560×1440 SVG coordinate space.
 * Used for two purposes:
 *   1. clip-path on the "house foreground layer" — clips the photo copy to show only the house.
 *   2. No longer used as an occlusion mask on the text (that approach hid letters inside the house
 *      but still left them visually on top in the z-order).
 *
 * The polygon is expressed as a percentage-based clip-path string for the CSS layer so it
 * scales correctly with the viewport. We keep the raw numeric coords for reference.
 */
const HOUSE_POLYGON_COORDS: [number, number][] = [
  [0, 1440],
  [0, 1160],
  [176, 1160],
  [176, 1070],
  [415, 1070],
  [415, 792],
  [360, 792],
  [335, 772],
  [333, 760],
  [806, 636],
  [806, 488],
  [954, 488],
  [954, 574],
  [1635, 422],
  [1638, 432],
  [1634, 462],
  [1629, 482],
  [1619, 502],
  [1609, 522],
  [1598, 542],
  [1588, 562],
  [1583, 582],
  [1583, 694],
  [2283, 694],
  [2305, 712],
  [2280, 718],
  [2315, 737],
  [2277, 749],
  [2272, 1070],
  [2285, 1070],
  [2285, 1160],
  [2560, 1160],
  [2560, 1440],
];

const W = 2560;
const H = 1440;

/** Convert the polygon to CSS clip-path percentage values. */
const HOUSE_CLIP_PATH =
  "polygon(" +
  HOUSE_POLYGON_COORDS.map(
    ([x, y]) => `${((x / W) * 100).toFixed(3)}% ${((y / H) * 100).toFixed(3)}%`,
  ).join(", ") +
  ")";

/** SVG polygon points string (same coords) for the SVG layer. */
const HOUSE_SVG_POINTS = HOUSE_POLYGON_COORDS.map(([x, y]) => `${x},${y}`).join(" ");

/* Natural glyph proportions are important here. A fixed SVG textLength used to
 * stretch the wordmark and made the O look damaged where it met the chimney.
 * This baseline keeps the complete letterforms in the clear sky band while the
 * generous tracking maintains the wide, architectural composition. */
const FONT_SIZE = 300;
const LETTER_SPACING = 94;
const WORDMARK_BASELINE = 480;

const MICRO_TASKS = [
  "sampling 230V AC waveform...",
  "reading current harmonics...",
  "initializing ESP32-S3 FreeRTOS core...",
  "arming solid-state breaker relays...",
  "calibrating overcurrent thresholds...",
  "synchronizing Web BLE telemetry stream...",
  "monitoring 5 branch circuits...",
];

export function CinematicLanding({ children, isHomePage = true }: CinematicLandingProps) {
  if (!isHomePage) {
    return <>{children}</>;
  }
  return <CinematicLandingInner>{children}</CinematicLandingInner>;
}

function CinematicLandingInner({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [isSliceOpen, setIsSliceOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 640 : false,
  );

  // Preloader telemetry and state
  const [loadedFrames, setLoadedFrames] = useState(0);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isLoaderExiting, setIsLoaderExiting] = useState(false);
  const [isLoaderDismissed, setIsLoaderDismissed] = useState(false);
  const [loadingTicks, setLoadingTicks] = useState(0);

  useEffect(() => {
    if (isReady || isLoaderDismissed) return;
    const interval = setInterval(() => {
      setLoadingTicks((t) => t + 1);
    }, 1800);
    return () => clearInterval(interval);
  }, [isReady, isLoaderDismissed]);

  const currentMicroTask = MICRO_TASKS[loadingTicks % MICRO_TASKS.length];

  // containerRef — the div that receives the canvas from CinematicFrameSequence
  const containerRef = useRef<HTMLDivElement>(null);
  const sliceOverlayRef = useRef<HTMLDivElement>(null);
  const sliceContentRef = useRef<HTMLDivElement>(null);
  const cinematicRef = useRef<CinematicThemeTransition | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTheme = useCallback((newTheme: Theme) => {
    setTheme(newTheme);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", newTheme === "dark");
      document.body.classList.toggle("dark", newTheme === "dark");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("cinematic-theme", newTheme);
      localStorage.setItem("voltra-theme", newTheme);
    }
  }, []);

  // Listen to external theme changes (e.g. from SiteNav toggle)
  useEffect(() => {
    const handleExternalTheme = (e: CustomEvent<{ theme?: Theme }>) => {
      const nextTheme = e.detail?.theme as Theme;
      if (nextTheme && (nextTheme === "dark" || nextTheme === "light")) {
        setTheme(nextTheme);
        cinematicRef.current?.setTheme(nextTheme);
      }
    };
    const listener = handleExternalTheme as EventListener;
    window.addEventListener("voltra-theme-changed", listener);
    return () => window.removeEventListener("voltra-theme-changed", listener);
  }, []);

  const handleOpenSlice = useCallback(() => {
    if (!isReady) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsLeaving(false);
    setIsSliceOpen(true);
  }, [isReady]);

  const handleCloseSlice = useCallback(() => {
    setIsLeaving(true);
    setIsSliceOpen(false);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      setIsLeaving(false);
    }, 850);
  }, []);

  const handleToggleTheme = useCallback(() => {
    if (!isReady) return;
    if (cinematicRef.current) {
      const nextTheme = cinematicRef.current.toggleTheme();
      updateTheme(nextTheme);
    } else {
      updateTheme(theme === "dark" ? "light" : "dark");
    }
  }, [isReady, theme, updateTheme]);

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Initialize interactive frame player on client
  useEffect(() => {
    const savedTheme = (typeof localStorage !== "undefined" &&
      (localStorage.getItem("cinematic-theme") ||
        localStorage.getItem("voltra-theme") ||
        "light")) as Theme;

    updateTheme(savedTheme);

    let isCleanedUp = false;

    import("./CinematicThemeTransition.ts")
      .then(({ CinematicThemeTransition }) => {
        if (isCleanedUp || !containerRef.current) return;

        const cinematic = new CinematicThemeTransition(containerRef.current, {
          initialTheme: savedTheme,
          fit: "cover",
          storageKey: "cinematic-theme",
          houseClipPath: HOUSE_CLIP_PATH,
          onPreloadProgress: (loaded, total) => {
            setLoadedFrames(loaded);
            const pct = Math.min(100, Math.round((loaded / total) * 100));
            setPreloadProgress(pct);
          },
          onPreloadComplete: () => {
            setLoadedFrames(169);
            setPreloadProgress(100);
            setTimeout(() => {
              setIsLoaderExiting(true);
              setTimeout(() => {
                setIsLoaderDismissed(true);
                setIsReady(true);
              }, 850);
            }, 300);
          },
          onThemeSettled: (settledTheme: Theme) => {
            updateTheme(settledTheme);
          },
        });

        cinematicRef.current = cinematic;
      })
      .catch((err) => {
        console.error("[Cinematic] Failed to load frame transition engine:", err);
        setIsLoaderDismissed(true);
        setIsReady(true);
      });

    return () => {
      isCleanedUp = true;
      if (cinematicRef.current) {
        cinematicRef.current.destroy();
        cinematicRef.current = null;
      }
    };
  }, [isMobile, updateTheme]);

  // Safety fallback: if network is slow, smoothly release loader if majority of frames are ready
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isReady && preloadProgress >= 70) {
        setIsLoaderExiting(true);
        setTimeout(() => {
          setIsLoaderDismissed(true);
          setIsReady(true);
        }, 850);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [isReady, preloadProgress]);

  // Window wheel / touch scroll listener: open/close slice without changing frames or theme
  useEffect(() => {
    let touchStartY = 0;

    const handleWheel = (e: WheelEvent) => {
      if (!isReady) return;

      if (!isSliceOpen) {
        if (e.deltaY > 18) {
          // Scrolling down opens the platform content slice (theme/frames only change via Day/Night button)
          handleOpenSlice();
        }
      } else if (isSliceOpen && e.deltaY < -18) {
        const content = sliceContentRef.current;
        if (content && content.scrollTop <= 5) {
          handleCloseSlice();
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isReady) return;
      const delta = touchStartY - e.changedTouches[0].clientY;
      if (!isSliceOpen && delta > 25) {
        // Swiping up opens the platform slice
        handleOpenSlice();
      } else if (isSliceOpen && delta < -25) {
        const content = sliceContentRef.current;
        if (content && content.scrollTop <= 5) {
          handleCloseSlice();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReady) return;
      if (e.key === "Escape" && isSliceOpen) {
        handleCloseSlice();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReady, isSliceOpen, handleOpenSlice, handleCloseSlice]);

  /* ── Shared theme-toggle button ── */
  const themeToggle = (
    <button
      id="themeToggle"
      className="theme-toggle-btn group"
      aria-label={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}
      title={theme === "dark" ? "Switch to Day Mode" : "Switch to Night Mode"}
      onClick={handleToggleTheme}
      disabled={!isReady}
      style={{
        opacity: isReady ? 1 : 0.4,
        cursor: isReady ? "pointer" : "not-allowed",
        pointerEvents: isReady ? "auto" : "none",
      }}
    >
      {theme === "dark" ? (
        <svg
          className="theme-svg transition-transform duration-300 group-hover:rotate-45"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg
          className="theme-svg transition-transform duration-300 group-hover:-rotate-12"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );

  /* ── Current frame image src ── */
  const frameSrc =
    theme === "dark" ? "/assets/cinematic/last-frame.webp" : "/assets/cinematic/first-frame.webp";

  /*
   * ═══════════════════════════════════════════════════════════════════
   * CORRECT LAYER ORDER (bottom → top):
   *
   *  Layer 1  [z-index: 1]  Canvas (animated photo — full bleed)
   *  Layer 2  [z-index: 2]  Fallback img (static first/last frame — full bleed,
   *                          shown until canvas is ready)
   *  Layer 3  [z-index: 3]  VOLTRA SVG typography (BEHIND the house)
   *  Layer 4  [z-index: 4]  House foreground img — same photo, clipped to the
   *                          house polygon via clip-path so ONLY the house shows.
   *                          This makes the house appear IN FRONT of the letters.
   *  Layer 5  [z-index: 5]  Subtitles SVG overlay
   *  Layer 6  [z-index: 6]  Theme toggle / UI
   *
   * The "house foreground" layer is the key addition. It is the identical
   * fallback image cropped to the house outline. The canvas is NOT clipped —
   * it shows the full scene. The clipped copy sits on top of VOLTRA so the
   * house literally occludes the letters.
   * ═══════════════════════════════════════════════════════════════════
   */
  const cinematicScene = (mobileMode: boolean) => (
    <div
      ref={mobileMode === isMobile ? containerRef : undefined}
      id="cinematicContainer"
      className="fullscreen-cinematic"
      aria-hidden={isSliceOpen}
    >
      {/*
       * LAYER 1+2: Canvas (injected by CinematicFrameSequence) + static fallback.
       * Both are absolute, inset-0, z-index 1/2, object-fit cover.
       * The canvas gets z=1, the fallback img gets z=2 so it shows immediately.
       * Once the canvas paints its first frame, the fallback is behind it.
       * We actually want the fallback OVER the canvas initially:
       * we give fallback z=2 and canvas itself (via JS class) z=1.
       */}
      <img src={frameSrc} alt="" aria-hidden="true" className="cinematic-fallback-frame" />

      {/*
       * LAYER 3: VOLTRA giant typography — sits ABOVE the photo canvas but
       * BELOW the house clip layer. Letters are pure dark fills, no opacity tricks.
       */}
      <svg
        viewBox="0 0 2560 1440"
        preserveAspectRatio="xMidYMid slice"
        className={`voltra-letters-svg voltra-theme-${theme}`}
        aria-hidden="true"
      >
        <g className="voltra-brand-group">
          <text
            x="1280"
            y={WORDMARK_BASELINE}
            className="voltra-letter"
            fontFamily="'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="800"
            fontSize={FONT_SIZE}
            textAnchor="middle"
            letterSpacing={LETTER_SPACING}
            style={{ textAnchor: "middle" }}
          >
            VOLTRA
          </text>
        </g>
      </svg>

      {/*
       * LAYER 4: House foreground — the SAME image clipped to the house polygon.
       * This is the critical layer that makes the house appear IN FRONT of VOLTRA.
       * clip-path uses the same polygon converted to percentages so it scales
       * correctly as the container resizes.
       */}
      <img
        src={frameSrc}
        alt=""
        aria-hidden="true"
        className="cinematic-house-layer"
        style={{ clipPath: HOUSE_CLIP_PATH }}
      />

      {/*
       * LAYER 5: Supporting subtitle text in the sky area.
       * Positioned above the house layer so it appears in the sky.
       */}
      <svg
        viewBox="0 0 2560 1440"
        preserveAspectRatio="xMidYMid slice"
        className={`voltra-subtitles-svg voltra-theme-${theme}`}
        aria-hidden="true"
      >
        <g className="voltra-subtitles">
          <text x="5.5%" y="14%" textAnchor="start" className="voltra-subtitle-text" fontSize="28">
            <tspan x="5.5%" dy="0">
              Smarter predictions.
            </tspan>
            <tspan x="5.5%" dy="38">
              More reliable power.
            </tspan>
          </text>
          <text x="50%" y="14%" textAnchor="middle" className="voltra-subtitle-text" fontSize="28">
            <tspan x="50%" dy="0">
              AI-powered
            </tspan>
            <tspan x="50%" dy="38">
              grid intelligence.
            </tspan>
          </text>
          <text x="94.5%" y="14%" textAnchor="end" className="voltra-subtitle-text" fontSize="28">
            <tspan x="94.5%" dy="0">
              A more stable
            </tspan>
            <tspan x="94.5%" dy="38">
              tomorrow.
            </tspan>
          </text>
        </g>
      </svg>
    </div>
  );

  /* ── Slice overlay ── */
  const sliceOverlay = (
    <div
      ref={sliceOverlayRef}
      id="voltraSliceOverlay"
      className={`voltra-slice-overlay slice-theme-${theme} ${
        isSliceOpen ? "slice-approaching" : isLeaving ? "slice-leaving" : ""
      }`}
      role="region"
      aria-label="VOLTRA Grid Intelligence Platform"
    >
      <div className="voltra-slice-strips">
        <div className="slice-strip strip-1" />
        <div className="slice-strip strip-2" />
        <div className="slice-strip strip-3" />
        <div className="slice-strip strip-4" />
        <div className="slice-strip strip-5" />
      </div>
      <div ref={sliceContentRef} className="voltra-slice-content">
        <div id="voltra-frontend-app" className="voltra-frontend-content-boundary">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <div
      id="cinematicLandingLayer"
      className={`cinematic-landing-root ${isSliceOpen ? "slice-is-active" : ""} ${isReady ? "is-landing-ready" : ""}`}
    >
      {/* ── MINIMAL KAVACH PRELOADER ────────────────────────────────────── */}
      {!isLoaderDismissed && (
        <div
          className={`kavach-minimal-loader ${isLoaderExiting ? "loader-exiting" : ""}`}
          aria-label="Loading VOLTRA"
          role="progressbar"
          aria-valuenow={preloadProgress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="kavach-brand-title">V O L T R A</div>

          <div className="kavach-loader-block">
            <div className="kavach-loader-track">
              <div
                className="kavach-loader-bar"
                style={{ width: `${Math.max(2, preloadProgress)}%` }}
              />
            </div>

            <div className="kavach-loader-meta">
              <span className="kavach-loading-label">loading</span>
              <span className="kavach-percent-label">{preloadProgress}%</span>
            </div>

            {loadingTicks >= 1 && (
              <div key={currentMicroTask} className="kavach-micro-status">
                {currentMicroTask}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MOBILE shell (≤640 px) ─────────────────────────────────────── */}
      <div className="cinematic-mobile-shell">
        {/* Top branding band */}
        <div className="cinematic-mobile-top">
          <span className="cinematic-mobile-wordmark">VOLTRA</span>
          <div className="cinematic-mobile-bolt-line">
            <span className="line-seg" />
            <svg
              className="cinematic-mobile-bolt"
              width="14"
              height="20"
              viewBox="0 0 14 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M8 0L0 11h6l-1 9 8-12H7L8 0z" fill="currentColor" opacity="0.7" />
            </svg>
            <span className="line-seg" />
          </div>
          <p className="cinematic-mobile-tagline">Predict&nbsp;/&nbsp;Balance&nbsp;/&nbsp;Power</p>
          <p className="cinematic-mobile-tagline" style={{ marginTop: 0, letterSpacing: "2px" }}>
            AI for a more resilient grid
          </p>
        </div>

        {/* 16:9 framed card with correct layer order */}
        <div className="cinematic-mobile-frame">
          {cinematicScene(true)}
          {!isSliceOpen && (
            <div style={{ position: "absolute", top: 10, right: 10, zIndex: 20 }}>
              {themeToggle}
            </div>
          )}
          {!isSliceOpen && (
            <div className="cinematic-mobile-swipe">
              <span>swipe up</span>
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true">
                <path
                  d="M1 1l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Bottom branding band */}
        <div className="cinematic-mobile-bottom">
          <div className="cinematic-mobile-bolt-line">
            <span className="line-seg" />
            <svg
              width="120"
              height="16"
              viewBox="0 0 120 16"
              fill="none"
              aria-hidden="true"
              style={{ opacity: 0.22 }}
            >
              <path d="M60 8 H40 V2 H10" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
              <path d="M60 8 H80 V2 H110" stroke="white" strokeWidth="0.8" strokeLinecap="round" />
              <circle cx="60" cy="8" r="2" fill="white" opacity="0.7" />
            </svg>
            <span className="line-seg" />
          </div>
          <p className="cinematic-mobile-bottom-copy">
            Cleaner energy.
            <br />
            Stronger communities.
          </p>
          <div className="cinematic-mobile-bolt-line">
            <span className="line-seg" />
            <svg
              className="cinematic-mobile-bolt"
              width="14"
              height="20"
              viewBox="0 0 14 20"
              fill="none"
              aria-hidden="true"
            >
              <path d="M8 0L0 11h6l-1 9 8-12H7L8 0z" fill="currentColor" opacity="0.6" />
            </svg>
            <span className="line-seg" />
          </div>
          <span className="cinematic-mobile-bottom-wordmark">VOLTRA</span>
        </div>
      </div>

      {/* ── DESKTOP shell (>640 px) ────────────────────────────────────── */}
      <div className="cinematic-desktop-shell">
        {cinematicScene(false)}
        {!isSliceOpen && <div className="theme-controls">{themeToggle}</div>}
      </div>

      {sliceOverlay}
    </div>
  );
}

/* Export polygon string for potential use by other modules */
export { HOUSE_SVG_POINTS, HOUSE_CLIP_PATH };

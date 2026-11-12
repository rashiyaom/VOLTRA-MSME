import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  AlertTriangle,
  EyeOff,
  AlertOctagon,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Check,
  ChevronDown,
  Clock3,
  CloudLightning,
  Cpu,
  Database,
  Gauge,
  Home,
  LogIn,
  Power,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Wifi,
  Wrench,
  Zap,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoltraInterventionBanner } from "@/components/VoltraInterventionBanner";
import { VoltraUserGuide } from "@/components/VoltraUserGuide";
import { useVoltricsStore } from "@/stores/useVoltricsStore";
import { authSession } from "@/lib/authSession";
import homeImage from "@/assets/voltra-home.jpeg";
import gridImage from "@/assets/voltra-grid.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VOLTRA — Next-Gen IoT ESP32 Smart Energy & Circuit Protection" },
      {
        name: "description",
        content:
          "VOLTRA is an IoT ESP32-based Smart Energy Telemetry, Distribution Panel Monitor, and Autonomous Circuit Protection System.",
      },
      { property: "og:title", content: "VOLTRA — Next-Gen IoT ESP32 Smart Energy & Circuit Protection" },
      {
        property: "og:description",
        content:
          "Real-time AC electrical telemetry, sub-second breaker actuation, and autonomous overcurrent protection for modern homes & facilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

// 24-Hour AC Power Consumption & Overload Curve
const defaultDailyTelemetry = [
  { time: "00:00", powerKw: 0.45, currentAmps: 1.95, voltageV: 231.2 },
  { time: "02:00", powerKw: 0.38, currentAmps: 1.65, voltageV: 232.0 },
  { time: "04:00", powerKw: 0.42, currentAmps: 1.82, voltageV: 231.8 },
  { time: "06:00", powerKw: 0.85, currentAmps: 3.70, voltageV: 230.5 },
  { time: "07:30", powerKw: 2.15, currentAmps: 9.35, voltageV: 229.4 },
  { time: "09:00", powerKw: 1.65, currentAmps: 7.18, voltageV: 230.1 },
  { time: "11:00", powerKw: 1.95, currentAmps: 8.48, voltageV: 228.9 },
  { time: "13:00", powerKw: 2.40, currentAmps: 10.45, voltageV: 228.4 },
  { time: "15:00", powerKw: 1.80, currentAmps: 7.82, voltageV: 229.6 },
  { time: "17:30", powerKw: 2.95, currentAmps: 12.82, voltageV: 227.5 },
  { time: "19:00", powerKw: 3.85, currentAmps: 16.74, voltageV: 226.8 }, // Evening Peak Load
  { time: "20:30", powerKw: 3.40, currentAmps: 14.78, voltageV: 227.2 },
  { time: "22:00", powerKw: 1.90, currentAmps: 8.26, voltageV: 229.1 },
  { time: "23:30", powerKw: 0.95, currentAmps: 4.13, voltageV: 230.8 },
];

function Hero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const voltraContainerRef = useRef<HTMLDivElement>(null);
  const voltraTextRef = useRef<HTMLHeadingElement>(null);
  const voltraSubtitleRef = useRef<HTMLParagraphElement>(null);
  const voltraBloomRef = useRef<HTMLDivElement>(null);
  const voltraFlareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;

    const updateScrollAnimation = () => {
      if (!containerRef.current || !cardRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const totalScrollDistance = containerRef.current.offsetHeight - viewportHeight;

      if (totalScrollDistance <= 0) return;

      // Progress through the locked track: 0 to 1
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / totalScrollDistance));

      // 1. Zoom phase (0.02 -> 0.30):
      // Expands the initial card into full screen
      const zoomStart = 0.02;
      const zoomEnd = 0.30;
      const normZoom = Math.max(0, Math.min(1, (progress - zoomStart) / (zoomEnd - zoomStart)));
      const easeZoom =
        normZoom < 0.5
          ? 4 * normZoom * normZoom * normZoom
          : 1 - Math.pow(-2 * normZoom + 2, 3) / 2;

      cardRef.current.style.setProperty("--hero-zoom", easeZoom.toFixed(4));

      // 2. Initial text fade out (0.02 -> 0.22):
      const textFade = Math.max(0, 1 - Math.max(0, (progress - 0.02) / 0.20));
      if (textRef.current) {
        textRef.current.style.opacity = textFade.toFixed(3);
        textRef.current.style.transform = `translateY(${-((1 - textFade) * 28).toFixed(1)}px)`;
        textRef.current.style.pointerEvents = textFade < 0.1 ? "none" : "auto";
      }

      // 3. Image parallax camera push-in:
      if (imgRef.current) {
        const imgScale = (1 + progress * 0.14).toFixed(4);
        imgRef.current.style.transform = `scale(${imgScale})`;
      }

      // 4. VOLTRA text appearance in the sky (0.28 -> 0.48):
      const appearStart = 0.28;
      const appearEnd = 0.48;
      const rawAppear = Math.max(0, Math.min(1, (progress - appearStart) / (appearEnd - appearStart)));
      const easeAppear = rawAppear * rawAppear * (3 - 2 * rawAppear);

      // 5. Emitted light glow surge (0.46 -> 0.78):
      const glowStart = 0.46;
      const glowEnd = 0.78;
      const rawGlow = Math.max(0, Math.min(1, (progress - glowStart) / (glowEnd - glowStart)));
      const easeGlow = rawGlow < 0.5 ? 2 * rawGlow * rawGlow : 1 - Math.pow(-2 * rawGlow + 2, 2) / 2;

      // 6. Exit fade to next section (0.84 -> 0.98):
      const exitStart = 0.84;
      const exitEnd = 0.98;
      const exitFade = progress <= exitStart ? 1 : Math.max(0, 1 - (progress - exitStart) / (exitEnd - exitStart));

      // Master opacity for VOLTRA sky element
      const masterOpacity = (easeAppear * exitFade).toFixed(3);
      const exitTranslateY = progress > exitStart ? -((1 - exitFade) * 50).toFixed(1) : "0";

      if (voltraContainerRef.current) {
        voltraContainerRef.current.style.opacity = masterOpacity;
        voltraContainerRef.current.style.transform = `translate3d(0, ${exitTranslateY}px, 0)`;
        voltraContainerRef.current.style.pointerEvents = Number(masterOpacity) < 0.05 ? "none" : "auto";
      }

      // 7. Dynamic emitted light styling:
      if (voltraTextRef.current) {
        const g = easeGlow;
        // Subtle letter spacing breathing out as energy emits
        const trackingValue = (0.35 + g * 0.10).toFixed(3);
        voltraTextRef.current.style.letterSpacing = `${trackingValue}em`;
        voltraTextRef.current.style.paddingLeft = `${trackingValue}em`;

        if (g > 0.01) {
          const s1 = (14 * g).toFixed(1);
          const s2 = (35 * g).toFixed(1);
          const s3 = (75 * g).toFixed(1);
          const s4 = (140 * g).toFixed(1);
          const s5 = (220 * g).toFixed(1);
          const a1 = (0.95 * g).toFixed(2);
          const a2 = (0.85 * g).toFixed(2);
          const a3 = (0.75 * g).toFixed(2);
          const a4 = (0.55 * g).toFixed(2);
          const a5 = (0.35 * g).toFixed(2);

          voltraTextRef.current.style.textShadow = `
            0 0 ${s1}px rgba(255, 255, 255, ${a1}),
            0 0 ${s2}px rgba(224, 242, 254, ${a2}),
            0 0 ${s3}px rgba(56, 189, 248, ${a3}),
            0 0 ${s4}px rgba(14, 165, 233, ${a4}),
            0 0 ${s5}px rgba(2, 132, 199, ${a5})
          `;
          voltraTextRef.current.style.color = "#ffffff";
        } else {
          voltraTextRef.current.style.textShadow = "0 4px 30px rgba(0, 0, 0, 0.7)";
          voltraTextRef.current.style.color = "rgba(255, 255, 255, 0.95)";
        }
      }

      // Radiant sky bloom:
      if (voltraBloomRef.current) {
        const g = easeGlow;
        voltraBloomRef.current.style.opacity = (g * 0.85).toFixed(3);
        const scale = (0.85 + g * 0.4).toFixed(3);
        voltraBloomRef.current.style.transform = `translate(-50%, 0) scale(${scale})`;
      }

      // Anamorphic horizontal flare:
      if (voltraFlareRef.current) {
        const g = easeGlow;
        voltraFlareRef.current.style.opacity = (g * 0.8).toFixed(3);
        const flareScaleX = (0.5 + g * 0.8).toFixed(3);
        voltraFlareRef.current.style.transform = `translate(-50%, 0) scaleX(${flareScaleX})`;
      }

      // Subtitle glow:
      if (voltraSubtitleRef.current) {
        const g = easeGlow;
        voltraSubtitleRef.current.style.opacity = (0.6 + g * 0.4).toFixed(3);
        if (g > 0.05) {
          voltraSubtitleRef.current.style.textShadow = `0 0 ${(16 * g).toFixed(1)}px rgba(56, 189, 248, ${(0.85 * g).toFixed(2)})`;
        } else {
          voltraSubtitleRef.current.style.textShadow = "none";
        }
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateScrollAnimation);
        ticking = true;
      }
    };

    // Find any scrolling ancestor (.voltra-slice-content or window)
    const findScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      let curr = node?.parentElement;
      while (curr) {
        const overflowY = window.getComputedStyle(curr).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          return curr;
        }
        curr = curr.parentElement;
      }
      return window;
    };

    const scrollParent = findScrollParent(containerRef.current);
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });

    // Initial calculation
    updateScrollAnimation();

    return () => {
      scrollParent.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  return (
    <section ref={containerRef} className="relative h-[380vh] w-full">
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
        <div
          ref={cardRef}
          className="relative overflow-hidden border border-border/70 shadow-2xl transition-[border-radius,width,height] duration-75 ease-out"
          style={{
            width:
              "calc(min(1152px, 100vw - 3rem) + (100vw - min(1152px, 100vw - 3rem)) * var(--hero-zoom, 0))",
            height:
              "calc(min(650px, 75vh) + (100vh - min(650px, 75vh)) * var(--hero-zoom, 0))",
            borderRadius: "calc(2rem * (1 - var(--hero-zoom, 0)))",
            borderWidth: "calc(1px * (1 - var(--hero-zoom, 0)))",
            maxWidth: "100vw",
            maxHeight: "100vh",
          }}
        >
          <img
            ref={imgRef}
            src={homeImage}
            alt="A powered modern home beside monitored electrical infrastructure at dusk"
            width={1600}
            height={1050}
            className="absolute inset-0 size-full object-cover origin-center will-change-transform"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--ink)_42%,transparent),color-mix(in_oklab,var(--ink)_6%,transparent)_50%,color-mix(in_oklab,var(--ink)_70%,transparent))]" />

          {/* Initial Hero Content (Fades out on initial scroll) */}
          <div
            ref={textRef}
            className="relative flex min-h-[580px] flex-col justify-start p-6 text-cream sm:min-h-[620px] sm:p-10 md:min-h-[660px] md:p-14 will-change-[opacity,transform] z-10"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="pill inline-flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/10 px-3 py-1 font-mono text-cream/90 backdrop-blur-md">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                VOLTRA · Smart Energy Intelligence
              </span>
              <span className="hidden text-cream/70 sm:block font-mono">IoT ESP32 Smart Energy Ecosystem</span>
            </div>

            <div className="mt-4 max-w-3xl sm:mt-6">
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cream/70 font-mono">
                Real-Time Telemetry &amp; Autonomous Circuit Control
              </p>
              <h1 className="text-4xl font-semibold leading-[1.04] sm:text-5xl md:text-6xl">
                Power shouldn't fail<br />
                <span className="font-display font-normal italic text-signal">before you're warned.</span>
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="pill h-8.5 border-cream/25 bg-cream/10 px-4 text-xs font-medium text-cream backdrop-blur-md transition-all hover:border-cream/40 hover:bg-cream/20 hover:text-white"
                >
                  <Link to="/dashboard" className="inline-flex items-center gap-1.5">
                    <span>Open Panel Command</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="pill h-8.5 border-cream/15 bg-transparent px-4 text-xs font-medium text-cream/80 backdrop-blur-md transition-all hover:border-cream/30 hover:bg-cream/10 hover:text-white"
                >
                  <Link to="/breakers" className="inline-flex items-center gap-1.5">
                    <span>Smart Breakers</span>
                    <ShieldCheck className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Cinematic Large VOLTRA in Sky (appears when scrolled, emits glowing light) */}
          <div
            ref={voltraContainerRef}
            className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col items-center justify-start pt-[18vh] sm:pt-[20vh] md:pt-[22vh] will-change-[opacity,transform] z-20"
            style={{ opacity: 0 }}
          >
            {/* Atmospheric Sky Bloom behind VOLTRA */}
            <div
              ref={voltraBloomRef}
              className="pointer-events-none absolute top-[15vh] sm:top-[17vh] md:top-[19vh] left-1/2 -translate-x-1/2 h-[340px] sm:h-[420px] w-[540px] sm:w-[820px] rounded-full opacity-0 blur-3xl transition-transform duration-75"
              style={{
                background:
                  "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(224, 242, 254, 0.45) 0%, rgba(56, 189, 248, 0.32) 35%, rgba(14, 165, 233, 0.16) 65%, transparent 80%)",
              }}
            />

            {/* Horizontal Anamorphic Light Streak */}
            <div
              ref={voltraFlareRef}
              className="pointer-events-none absolute top-[24vh] sm:top-[27vh] md:top-[29vh] left-1/2 -translate-x-1/2 h-[2px] w-[650px] sm:w-[980px] opacity-0 blur-[1px]"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(56, 189, 248, 0.4) 20%, rgba(255, 255, 255, 0.95) 50%, rgba(56, 189, 248, 0.4) 80%, transparent 100%)",
              }}
            />

            {/* Large Top-Centered Spaced-Out VOLTRA Title */}
            <div className="relative flex flex-col items-center justify-center px-4 text-center">
              <h1
                ref={voltraTextRef}
                className="select-none font-sans text-6xl sm:text-7xl md:text-8xl lg:text-[7.5rem] xl:text-[8.5rem] font-bold uppercase leading-none text-white transition-all duration-75 will-change-[text-shadow,letter-spacing,transform]"
                style={{
                  letterSpacing: "0.35em",
                  paddingLeft: "0.35em",
                  textShadow: "0 4px 30px rgba(0, 0, 0, 0.7)",
                }}
              >
                VOLTRA
              </h1>

              <p
                ref={voltraSubtitleRef}
                className="mt-4 sm:mt-5 text-[11px] sm:text-xs md:text-sm font-mono uppercase tracking-[0.6em] text-cyan-100/80 transition-all duration-75"
                style={{ paddingLeft: "0.6em" }}
              >
                AI-Powered Smart Energy &amp; Grid Intelligence
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

function HomePage() {
  const [historyData] = useState(defaultDailyTelemetry);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    setIsAuthed(authSession.isAuthenticated());
  }, []);

  return (
    <div className="overflow-x-clip">
      <Hero />
      <div className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
        <VoltraInterventionBanner />
      </div>
      <ProblemStory />
      <div id="guide" className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
        <VoltraUserGuide compact />
      </div>
      <PanelArchitecture />
      <AutonomousProtectionShowcase />
      <LivePanelPreview />
      <SmartBreakersMatrix />
      <TelemetryAnalytics historyData={historyData} />
      <PlatformModules />
      <ActionCta />
    </div>
  );
}

// ─── Problem Story: The Four Vulnerabilities of Old Breakers ─────────────────

const VOLTRA_PROTECTION_STAGES = [
  {
    tag: "THE STATUS QUO",
    title: "Thermal bi-metal strips react too slowly to electrical arcs.",
    desc:
      "Conventional breaker panels rely on thermal-magnetic strips calibrated over 50 years ago. By the time a bi-metal strip heats and bends, micro-arcing has scorched wiring insulation and stressed sensitive electronics.",
    meta: {
      label: "LEGACY BREAKER TRIP",
      value: "800ms - 2,400ms",
      sub: "Slow Thermal Response",
    },
    icon: AlertOctagon,
    dotColor: "bg-red-500",
    borderClass: "border-red-500/30 hover:border-red-500/50",
    gradient: "from-red-500/10 via-red-500/5 to-transparent",
    valueColor: "text-red-400",
  },
  {
    tag: "THE BLIND SPOT",
    title: "Zero visibility into live current draw and harmonics.",
    desc:
      "Homeowners receive a single aggregate utility bill once a month. No branch circuit breakdown, no voltage drop alerts, and zero early warning before an overloaded circuit trips during peak hours.",
    meta: {
      label: "HOME VISIBILITY",
      value: "0 Real-Time Datapoints",
      sub: "Complete Diagnostic Blindness",
    },
    icon: EyeOff,
    dotColor: "bg-amber-500",
    borderClass: "border-amber-500/30 hover:border-amber-500/50",
    gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
    valueColor: "text-amber-400",
  },
  {
    tag: "THE VOLTRA BREAKTHROUGH",
    title: "ESP32-S3 microcontroller with sub-8ms solid-state actuation.",
    desc:
      "VOLTRA continuously reads AC line voltage, current RMS, and power factor harmonics at 50Hz. When an anomalous surge is detected, the relay cuts downstream power in less than a single electrical cycle.",
    meta: {
      label: "VOLTRA AUTONOMOUS TRIP",
      value: "< 8.0 Milliseconds",
      sub: "Sub-Cycle Arc Prevention",
    },
    icon: Zap,
    dotColor: "bg-emerald-400",
    borderClass: "border-emerald-500/30 hover:border-emerald-500/50",
    gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
    valueColor: "text-emerald-400",
  },
  {
    tag: "CONTINUOUS UPTIME",
    title: "Smart load shedding keeps essential appliances energized.",
    desc:
      "Rather than knocking out your entire main breaker when power demand surges, VOLTRA's intelligent priority matrix sheds non-critical utility circuits first—keeping essential devices running uninterrupted.",
    meta: {
      label: "POWER AVAILABILITY",
      value: "99.98% Service Uptime",
      sub: "Selective Load Shedding",
    },
    icon: ShieldCheck,
    dotColor: "bg-cyan-400",
    borderClass: "border-cyan-500/30 hover:border-cyan-500/50",
    gradient: "from-cyan-500/10 via-cyan-500/5 to-transparent",
    valueColor: "text-cyan-400",
  },
];

function ProblemStory() {
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-[#d2f831] font-mono font-bold">
          Circuit Protection Evolution
        </p>
        <h2 className="mt-2 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
          Why traditional breakers fail <span className="font-display font-normal italic text-emerald-600 dark:text-[#d2f831]">modern electronics.</span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          Comparing 50-year-old bi-metal thermal trips with VOLTRA's sub-8ms solid-state ESP32-S3 protection architecture.
        </p>
      </div>

      {/* 2x2 Compact Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
        {VOLTRA_PROTECTION_STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          return (
            <div
              key={idx}
              className={`group relative rounded-2xl border ${stage.borderClass} bg-card/90 dark:bg-[#0c0d13]/90 p-5 sm:p-6 shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.01] backdrop-blur-md flex flex-col justify-between overflow-hidden`}
            >
              {/* Subtle ambient accent gradient glow */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stage.gradient} opacity-20 group-hover:opacity-35 transition-opacity pointer-events-none`}
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 dark:bg-white/[0.04] px-3 py-1 text-[10px] font-mono font-bold tracking-wider text-muted-foreground">
                    <span className={`size-2 rounded-full ${stage.dotColor} animate-pulse`} />
                    <span>{stage.tag}</span>
                  </div>
                  <div className="size-8 rounded-lg bg-muted/30 dark:bg-white/[0.04] border border-border/40 flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-colors">
                    <Icon className="size-4" />
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-foreground leading-snug group-hover:text-emerald-500 dark:group-hover:text-[#d2f831] transition-colors">
                  {stage.title}
                </h3>
                <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed font-sans">
                  {stage.desc}
                </p>
              </div>

              {/* Compact Inset Metric Bar */}
              <div className="relative z-10 mt-5 rounded-xl border border-border/50 bg-muted/30 dark:bg-black/35 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {stage.meta.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                    {stage.meta.sub}
                  </p>
                </div>
                <div className={`text-lg sm:text-xl font-bold font-mono ${stage.valueColor} shrink-0`}>
                  {stage.meta.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── 3. Hardware Architecture Cards ───────────────────────────────────────────

function PanelArchitecture() {
  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <div className="mb-8 sm:mb-10 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-[#d2f831] font-mono">
          Embedded Hardware Stack
        </p>
        <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
          From micro-amperage sampling to <span className="font-display font-normal italic text-emerald-600 dark:text-[#d2f831]">instantaneous actuation.</span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          The VOLTRA panel integrates the ESP32-S3 dual-core SoC, Hall-effect current sensor array, and magnetic relay drivers into a single compact DIN-rail form factor.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Microcontroller */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 sm:p-7 shadow-xs flex flex-col justify-between h-[360px] sm:h-[390px]">
          <div>
            <div className="size-11 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Cpu className="size-5" />
            </div>
            <span className="inline-block mt-6 text-[10px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 font-bold">
              ESP32-S3 SoC
            </span>
            <h3 className="mt-1 text-lg font-bold text-foreground">
              Dual-Core 240MHz Real-Time Kernel
            </h3>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Executes continuous ADC sampling routines on Core 0 while Core 1 handles Web Bluetooth GATT and Wi-Fi WebSocket telemetry streaming.
            </p>
          </div>
          <div className="border-t border-border/50 pt-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>FreeRTOS</span>
            <span className="font-semibold text-foreground">50Hz Sampling Loop</span>
          </div>
        </div>

        {/* Card 2: Current Sensors */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 sm:p-7 shadow-xs flex flex-col justify-between h-[360px] sm:h-[390px]">
          <div>
            <div className="size-11 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Activity className="size-5" />
            </div>
            <span className="inline-block mt-6 text-[10px] font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400 font-bold">
              ACS712 / CT Array
            </span>
            <h3 className="mt-1 text-lg font-bold text-foreground">
              5-Branch Hall Current Monitoring
            </h3>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Galvanically isolated current transducers detect subtle harmonic distortions, motor startup inrush, and micro-amperage leakage in real-time.
            </p>
          </div>
          <div className="border-t border-border/50 pt-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>Accuracy</span>
            <span className="font-semibold text-foreground">±0.5% True RMS</span>
          </div>
        </div>

        {/* Card 3: Solid-State Relays */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 sm:p-7 shadow-xs flex flex-col justify-between h-[360px] sm:h-[390px]">
          <div>
            <div className="size-11 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <ShieldCheck className="size-5" />
            </div>
            <span className="inline-block mt-6 text-[10px] font-mono uppercase tracking-widest text-purple-600 dark:text-purple-400 font-bold">
              Relay Actuation
            </span>
            <h3 className="mt-1 text-lg font-bold text-foreground">
              &lt; 8ms Sub-Cycle Relay Trip
            </h3>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Zero-crossing triac and latching relay drivers isolate short circuits before plasma arc flash occurs, completely eliminating contact erosion.
            </p>
          </div>
          <div className="border-t border-border/50 pt-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>Rating</span>
            <span className="font-semibold text-foreground">16A - 32A per Breaker</span>
          </div>
        </div>

        {/* Card 4: Dual-Channel Link */}
        <div className="group relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 sm:p-7 shadow-xs flex flex-col justify-between h-[360px] sm:h-[390px]">
          <div>
            <div className="size-11 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Wifi className="size-5" />
            </div>
            <span className="inline-block mt-6 text-[10px] font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400 font-bold">
              Connectivity
            </span>
            <h3 className="mt-1 text-lg font-bold text-foreground">
              Dual Web BLE + Wi-Fi WebSocket
            </h3>
            <p className="mt-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Pair directly in Google Chrome or Safari via Web Bluetooth GATT without any cloud dependency, or sync over local Wi-Fi for multi-device dashboard control.
            </p>
          </div>
          <div className="border-t border-border/50 pt-3 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
            <span>Latency</span>
            <span className="font-semibold text-foreground">&lt; 15ms Telemetry</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 4. Autonomous Protection Showcase ─────────────────────────────────────────

function AutonomousProtectionShowcase() {
  return (
    <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-[#d2f831] font-mono flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-[#d2f831] animate-pulse" /> Sub-Cycle Trip Engine
          </p>
          <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
            Current surges caught. <span className="font-display font-normal italic text-emerald-700 dark:text-[#d2f831]">Appliances preserved.</span>
          </h2>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
          Dynamic inverse-time overcurrent thresholds protect household wiring from thermal creep while accommodating normal motor inrush.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-[2rem] border border-border/70 dark:border-white/[0.08] shadow-2xl">
        <img
          src={gridImage}
          alt="Smart electrical panel monitoring"
          width={1600}
          height={900}
          loading="lazy"
          className="h-[500px] w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

        <div className="absolute bottom-6 left-6 right-6 grid gap-3 sm:grid-cols-3">
          {/* Card 1: Active Branch Guardian */}
          <div className="rounded-2xl border border-white/[0.12] bg-[#0c0d10]/85 backdrop-blur-xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-[10px] uppercase tracking-widest font-mono font-semibold">
                Protected Service
              </span>
              <ShieldCheck className="size-4 text-emerald-400" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-bold text-white tracking-tight">
              Single-Phase 230V AC · 40A
            </p>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Continuous 5-Branch Circuit Guardian
            </p>
          </div>

          {/* Card 2: Microcontroller State */}
          <div className="rounded-2xl border border-white/[0.12] bg-[#0c0d10]/85 backdrop-blur-xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-[10px] uppercase tracking-widest font-mono font-semibold">
                Hardware Link
              </span>
              <Radio className="size-4 text-cyan-400" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-bold text-white tracking-tight">
              ESP32-S3 · Web BLE Online
            </p>
            <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
              Autonomous Offline Relay Execution
            </p>
          </div>

          {/* Card 3: Response Metric */}
          <div className="rounded-2xl border border-purple-500/40 bg-[#160d24]/90 backdrop-blur-xl p-4 sm:p-5 shadow-[0_0_30px_rgba(168,85,247,0.25)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-purple-300">
                Breaker Actuation
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 text-[9px] font-mono font-bold text-purple-200">
                <span className="size-1.5 rounded-full bg-purple-400 animate-pulse" /> Armed
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-white">
              &lt; 8.0 ms Trip
            </p>
            <p className="text-[11px] text-purple-300 font-mono mt-0.5">
              IEC 60947 Electrical Safety Compliant
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. Live Panel Preview ────────────────────────────────────────────────────

function LivePanelPreview() {
  const circuits = [
    { id: "c1", name: "Living Room HVAC", rated: "16A", current: "6.2A", power: "1.42 kW", status: "CLOSED" },
    { id: "c2", name: "Kitchen & Refrigeration", rated: "20A", current: "4.1A", power: "0.94 kW", status: "CLOSED" },
    { id: "c3", name: "Master Bedroom & Lights", rated: "10A", current: "1.8A", power: "0.41 kW", status: "CLOSED" },
    { id: "c4", name: "EV Fast Charger", rated: "32A", current: "0.0A", power: "0.00 kW", status: "OPEN" },
    { id: "c5", name: "Water Heater Utility", rated: "16A", current: "8.5A", power: "1.95 kW", status: "CLOSED" },
  ];

  return (
    <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10 items-center">
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-[#d2f831] font-mono flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> Smart Panel Command
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-[1.15]">
            Individual control over <span className="font-display font-normal italic text-emerald-600 dark:text-[#d2f831]">every branch circuit.</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            View live amperage draw on each circuit branch. If an overload occurs, the autonomous guardian isolates only the faulted line, keeping the rest of your home illuminated.
          </p>

          <div className="pt-2">
            <Button asChild className="pill bg-emerald-600 dark:bg-[#d2f831] text-white dark:text-neutral-950 hover:bg-emerald-700 font-semibold shadow-xs px-5 py-2.5 rounded-full text-xs inline-flex items-center gap-2">
              <Link to="/breakers">
                Open Breakers Console <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Live Panel Interactive Preview Card */}
        <div className="lg:col-span-7 rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Main Distribution Service</p>
              <h3 className="font-bold text-sm text-foreground">5-Branch Circuit Status</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> 4 Active / 1 Idle
            </span>
          </div>

          <div className="space-y-2.5">
            {circuits.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className={c.status === "CLOSED" ? "size-2 rounded-full bg-emerald-500" : "size-2 rounded-full bg-neutral-400"} />
                  <div>
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{c.id.toUpperCase()} · {c.rated} Rated</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 font-mono">
                  <div className="text-right">
                    <p className="font-bold text-foreground">{c.current}</p>
                    <p className="text-[10px] text-muted-foreground">{c.power}</p>
                  </div>
                  <span className={c.status === "CLOSED" ? "text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase" : "text-[10px] font-bold text-muted-foreground uppercase"}>
                    {c.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 6. Smart Breakers Matrix ─────────────────────────────────────────────────

function SmartBreakersMatrix() {
  return (
    <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-card p-7 sm:p-10 md:p-12 shadow-sm">
        <div className="grid gap-10 md:grid-cols-2 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3.5" />
              <span>ACTIVE RELAY PROTECTION</span>
            </div>

            <h3 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Intelligent fault clearance with automated recovery.
            </h3>

            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              When an inrush surge from heavy appliances occurs, VOLTRA dynamically analyzes the current derivative (dI/dt) to distinguish between benign motor startup and dangerous sustained short circuits.
            </p>

            <div className="mt-6 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/15">
                <span className="text-muted-foreground">Inrush Surge Tolerance</span>
                <span className="font-bold text-foreground">3.0× Rated for 120ms</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/15">
                <span className="text-muted-foreground">Overload Cutoff Curve</span>
                <span className="font-bold text-foreground">Inverse-Time IEC 60255</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/15">
                <span className="text-muted-foreground">Physical Actuator</span>
                <span className="font-bold text-emerald-500">Solid-State + Magnetic Trip</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 space-y-3 font-mono text-xs">
            <p className="font-bold text-foreground text-sm uppercase tracking-wide">
              Live Protection Status
            </p>

            <div className="space-y-2">
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Voltage Stability</span>
                <span className="font-semibold text-emerald-500">230.4 V (Within ±2%)</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Frequency Tracking</span>
                <span className="font-semibold text-foreground">50.02 Hz Stable</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Power Factor (PF)</span>
                <span className="font-semibold text-foreground">0.98 Inductive</span>
              </div>
              <div className="flex justify-between border-b border-border/40 pb-2">
                <span className="text-muted-foreground">Active Load Draw</span>
                <span className="font-semibold text-foreground">2.45 kW / 10.6A</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Tripped Breakers</span>
                <span className="font-semibold text-emerald-500">0 Faults Detected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 7. Telemetry & Analytics ─────────────────────────────────────────────────

function TelemetryAnalytics({
  historyData = defaultDailyTelemetry,
}: {
  historyData?: typeof defaultDailyTelemetry;
}) {
  return (
    <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-600 dark:text-[#d2f831] font-mono">
          Continuous Power Monitoring
        </p>
        <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-foreground">
          24-Hour consumption curve & <span className="font-display font-normal italic text-emerald-600 dark:text-[#d2f831]">tariff optimization.</span>
        </h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
          Track peak kilowatt draw across the day to simulate time-of-use utility rates and prevent costly tier penalties.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.8fr_1fr] items-stretch">
        <div className="rounded-[2rem] border border-border/70 bg-card p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-4">
            <div>
              <p className="text-sm font-bold text-foreground">Daily Household Load Profile</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">Active Power (kW) vs Time of Day</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-600 dark:text-[#d2f831]">24h Profile</span>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="homePowerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" kW" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-card p-2.5 text-xs shadow-md font-mono">
                          <p className="font-bold text-foreground">{d.time}</p>
                          <p className="text-emerald-500 font-semibold">{d.powerKw} kW ({d.currentAmps}A)</p>
                          <p className="text-muted-foreground">{d.voltageV} V AC</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area type="monotone" dataKey="powerKw" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#homePowerGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost & Energy Highlight Card */}
        <div className="rounded-[2rem] bg-[#d2f831] p-7 sm:p-8 text-neutral-950 flex flex-col justify-between shadow-sm min-h-[340px]">
          <div>
            <div className="size-11 rounded-full bg-neutral-950 text-white flex items-center justify-center shadow-sm">
              <Zap className="size-5" />
            </div>
            <p className="mt-8 text-5xl sm:text-6xl font-bold font-sans tracking-tight text-neutral-950">14.8</p>
            <p className="mt-1 text-base font-bold text-neutral-950">Daily kWh Consumption</p>
          </div>
          <p className="mt-6 text-xs sm:text-sm leading-relaxed text-neutral-900/85 font-normal">
            Autonomous load balancing helped shave 18% of peak energy demand by shifting heavy water heating cycles to off-peak utility slabs.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── 8. Platform Modules ──────────────────────────────────────────────────────

function PlatformModules() {
  const modules = [
    {
      to: "/dashboard",
      badge: "MAIN PANEL COMMAND",
      title: "Homeowner Dashboard",
      desc: "Live 230V AC active kW consumption, power factor, 40A service headroom progress, and 24-hour household energy curve.",
      accent: "text-emerald-700 dark:text-[#d2f831] border-emerald-500/30 bg-emerald-500/10",
    },
    {
      to: "/breakers",
      badge: "CIRCUIT RELAY CONTROL",
      title: "Smart Breakers & Relays",
      desc: "Sub-8ms autonomous trip protection across 5 smart branch circuits. Tap to isolate or energize loads immediately.",
      accent: "text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10",
    },
    {
      to: "/stream",
      badge: "OSCILLOSCOPE STREAM",
      title: "Live AC Waveform Stream",
      desc: "High-speed AC voltage RMS, current harmonics, and raw ESP32 packet logs streaming at up to 5Hz with live Recharts graph.",
      accent: "text-red-500 border-red-500/30 bg-red-500/10",
    },
    {
      to: "/analytics",
      badge: "TARIFF & BILLING",
      title: "Consumption & Cost Simulator",
      desc: "Live daily and monthly power cost projections, dynamic utility rate tuning, and IndexedDB CSV audit export.",
      accent: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10",
    },
    {
      to: "/settings",
      badge: "HARDWARE PAIRING",
      title: "ESP32-S3 IoT Console",
      desc: "Web Bluetooth GATT discovery and pairing, Wi-Fi mDNS provisioning, overcurrent trip thresholds, and telemetry interval tuning.",
      accent: "text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10",
    },
    {
      to: "/guide",
      badge: "USER GUIDE & SETUP",
      title: "Interactive System Guide",
      desc: "Step-by-step CT sensor clamping, Web Bluetooth GATT pairing walkthrough, safety wiring diagrams, and troubleshooting FAQ.",
      accent: "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    },
  ];

  return (
    <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
      <div className="text-center max-w-2xl mx-auto space-y-2 mb-10">
        <p className="text-xs font-mono font-bold uppercase tracking-widest text-emerald-700 dark:text-[#d2f831]">
          Explore Full VOLTRA Console
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground dark:text-white font-display">
          All 6 Platform Views
        </h2>
        <p className="text-sm text-muted-foreground dark:text-neutral-400">
          Switch seamlessly between main panel telemetry, individual branch breakers, real-time AC waveform stream, tariff analytics, ESP32 hardware settings, and interactive system guide.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {modules.map((m, idx) => (
          <Link
            key={idx}
            to={m.to}
            className="group relative rounded-3xl border border-border/80 dark:border-white/[0.08] bg-card dark:bg-[#121318] p-6 shadow-xs hover:border-emerald-500/40 dark:hover:border-[#d2f831]/40 hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-bold ${m.accent}`}>
                  {m.badge}
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground dark:group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
              <h3 className="text-base font-bold text-foreground dark:text-white group-hover:text-emerald-700 dark:group-hover:text-[#d2f831] transition-colors">
                {m.title}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground dark:text-neutral-400 leading-relaxed">
                {m.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── 9. Call to Action ────────────────────────────────────────────────────────

function ActionCta() {
  return (
    <section className="mx-auto mt-28 w-full max-w-6xl px-4 sm:px-6 pb-20">
      <div className="rounded-[2.25rem] bg-[#d2f831] p-8 sm:p-12 md:p-16 text-neutral-950 shadow-md">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-mono font-bold text-neutral-900/70">
              VOLTRA Smart Panel
            </p>
            <h2 className="mt-4 max-w-2xl text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-neutral-950">
              Take complete control of your <span className="font-display font-normal italic">home power.</span>
            </h2>
          </div>
          <div>
            <p className="text-sm sm:text-base leading-relaxed text-neutral-900/85 font-normal">
              Experience the live homeowner console to monitor AC telemetry, toggle smart branch breakers, and pair your ESP32-S3 hardware.
            </p>
            <Button asChild className="pill mt-6 bg-neutral-950 text-white hover:bg-neutral-900 font-semibold shadow-sm px-6 py-3 rounded-full text-sm inline-flex items-center gap-2">
              <Link to="/dashboard">
                Open Homeowner Panel <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

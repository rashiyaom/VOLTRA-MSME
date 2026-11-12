import { PieChart, Lightbulb, ArrowRight, Zap, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export function VoltraInterventionBanner() {
  return (
    <section className="relative w-full py-8 sm:py-12">
      {/* Top Editorial Headline */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8 sm:mb-10">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-medium tracking-[0.18em] text-foreground/80 uppercase mb-3">
            <span className="size-2 rounded-full bg-emerald-500" />
            ELECTRICAL CIRCUIT RELIABILITY
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-sans font-bold tracking-tight text-foreground leading-[1.12]">
            Next-generation energy intelligence keeping power{" "}
            <span className="inline-flex items-center justify-center size-8 sm:size-10 md:size-12 rounded-full bg-[#0ea5e9] text-white mx-1 align-middle shadow-sm">
              <PieChart className="size-4 sm:size-5 md:size-6" />
            </span>{" "}
            <span className="font-extrabold text-foreground">resilient</span> and{" "}
            <span className="inline-flex items-center justify-center size-8 sm:size-10 md:size-12 rounded-full bg-[#ccff00] text-black mx-1 align-middle shadow-sm">
              <Lightbulb className="size-4 sm:size-5 md:size-6 fill-black text-black" />
            </span>{" "}
            <span className="text-muted-foreground font-normal">fail-safe</span>
          </h2>
        </div>

        <div className="shrink-0 mb-2">
          <Button
            asChild
            size="default"
            variant="outline"
            className="pill rounded-full border border-border/80 bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm hover:bg-muted"
          >
            <Link to="/breakers" className="inline-flex items-center gap-2">
              <span>Inspect Smart Relays</span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 4-Card Responsive Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-5">
        
        {/* Card 1: Smart Sensors & Standards */}
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-[#f1f3f5] dark:bg-[#161a22] p-6 flex flex-col justify-between min-h-[250px] sm:min-h-[280px] shadow-sm transition-transform duration-300 hover:scale-[1.01]">
          <div className="relative flex flex-wrap gap-2 pt-1">
            <span className="rounded-full bg-white dark:bg-[#212631] px-3 py-1 text-xs font-semibold text-foreground shadow-xs border border-black/5 dark:border-white/10">
              ESP32-S3 IoT
            </span>
            <span className="rounded-full bg-white dark:bg-[#212631] px-3 py-1 text-xs font-semibold text-foreground shadow-xs border border-black/5 dark:border-white/10">
              IEEE 519
            </span>
            <span className="rounded-full bg-white dark:bg-[#212631] px-3 py-1 text-xs font-medium text-foreground/80 shadow-xs border border-black/5 dark:border-white/10">
              Edge Telemetry
            </span>
            <span className="rounded-full bg-white dark:bg-[#212631] px-3 py-1 text-xs font-medium text-foreground/80 shadow-xs border border-black/5 dark:border-white/10">
              IEC 60947
            </span>
            <span className="rounded-full bg-white dark:bg-[#212631] px-3 py-1 text-xs font-medium text-foreground/80 shadow-xs border border-black/5 dark:border-white/10">
              Web Bluetooth
            </span>
          </div>

          <div className="mt-6">
            <p className="text-xs font-medium text-muted-foreground">Smart Branch Circuits</p>
            <p className="mt-1 text-4xl sm:text-5xl font-bold tracking-tight text-foreground font-display">05</p>
          </div>
        </div>

        {/* Card 2: Electric Neon Lime Card (100%) */}
        <div className="rounded-[2rem] bg-[#ccff00] text-black p-6 flex flex-col justify-between min-h-[250px] sm:min-h-[280px] shadow-sm border border-[#b8f000] transition-transform duration-300 hover:scale-[1.01]">
          <div>
            <p className="text-xs font-semibold text-black/75">Commitment to zero outages</p>
          </div>
          <div className="my-3">
            <p className="text-5xl sm:text-6xl font-bold tracking-tight text-black font-display">100%</p>
          </div>
          <div>
            <p className="text-xs leading-relaxed text-black/85 font-medium">
              Autonomous sub-second overcurrent and micro-arcing cut-off protection.
            </p>
          </div>
        </div>

        {/* Card 3: Autonomous Response (<10ms) */}
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 flex flex-col justify-between min-h-[250px] sm:min-h-[280px] shadow-sm transition-transform duration-300 hover:scale-[1.01]">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Autonomous Trip Latency</p>
          </div>
          <div className="my-3">
            <p className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground font-display">&lt;10ms</p>
          </div>
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground font-medium">
              Hardware relay interruption triggers immediately upon current threshold violation.
            </p>
          </div>
        </div>

        {/* Card 4: Clean Data Points Card (520k+) */}
        <div className="rounded-[2rem] border border-border/70 bg-[#f1f3f5] dark:bg-[#161a22] p-6 flex flex-col justify-between min-h-[250px] sm:min-h-[280px] shadow-sm transition-transform duration-300 hover:scale-[1.01]">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Telemetry Points</p>
          </div>
          <div className="my-3">
            <p className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground font-display">520k+</p>
          </div>
          <div>
            <p className="text-xs leading-relaxed text-muted-foreground font-medium">
              Continuous AC voltage RMS, current harmonics, and real-time load readings.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

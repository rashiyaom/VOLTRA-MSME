import type { Theme } from "./types.ts";

export interface VoltraSliceSlideConfig {
  sliceCount?: number;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * VoltraSliceSlide — Premium "Slice & Dicer" approaching branded slide.
 * Magazine-style editorial two-column layout with staggered vertical strip entrance.
 */
export class VoltraSliceSlide {
  private rootContainer: HTMLElement;
  private slideElement: HTMLElement | null = null;
  private isOpen = false;
  private currentTheme: Theme = "light";
  private sliceCount: number;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;

  constructor(rootContainer: HTMLElement, config?: VoltraSliceSlideConfig) {
    this.rootContainer = rootContainer;
    this.sliceCount = config?.sliceCount ?? 5;
    this.onOpenCallback = config?.onOpen;
    this.onCloseCallback = config?.onClose;

    this.mount();
    this.bindEvents();
  }

  private mount(): void {
    const slide = document.createElement("div");
    slide.className = `voltra-slice-overlay slice-theme-${this.currentTheme}`;
    slide.id = "voltraSliceOverlay";
    slide.setAttribute("aria-hidden", "true");
    slide.setAttribute("role", "dialog");
    slide.setAttribute("aria-modal", "true");
    slide.setAttribute("aria-label", "VOLTRA Grid Intelligence");

    // Vertical slice strips (the "dice" backdrop)
    const sliceContainer = document.createElement("div");
    sliceContainer.className = "voltra-slice-strips";
    for (let i = 0; i < this.sliceCount; i++) {
      const strip = document.createElement("div");
      strip.className = `slice-strip strip-${i + 1}`;
      sliceContainer.appendChild(strip);
    }
    slide.appendChild(sliceContainer);

    // Foreground editorial content
    const content = document.createElement("div");
    content.className = "voltra-slice-content";
    content.innerHTML = `
      <!-- Navigation Bar -->
      <nav class="slice-nav">
        <div class="slice-nav-brand">
          <span class="slice-nav-pulse"></span>
          <span class="slice-nav-wordmark">VOLTRA</span>
        </div>
        <button class="slice-close-btn" id="sliceCloseBtn" aria-label="Return to Cinematic View">
          <span class="slice-close-label">Close</span>
          <span class="slice-close-x" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          </span>
        </button>
      </nav>

      <!-- Main Two-Column Layout -->
      <div class="slice-body">

        <!-- Left: Editorial Column -->
        <section class="slice-editorial">
          <div class="slice-kicker">
            <span class="slice-kicker-line"></span>
            <span class="slice-kicker-text">IOT ELECTRICAL ARCHITECTURE · ESP32-S3 SYSTEM</span>
          </div>

          <h1 class="slice-headline">
            The Home,<br/>
            <span class="slice-headline-accent">Protected.</span>
          </h1>

          <p class="slice-lead">
            VOLTRA combines the high-performance ESP32-S3 microcontroller with sub-8ms solid-state circuit breaker relays, continuous AC electrical waveform telemetry, and autonomous overcurrent protection to safeguard modern homes and facilities.
          </p>

          <!-- Horizontal Stats Bar -->
          <div class="slice-stats-bar">
            <div class="slice-stat">
              <span class="slice-stat-value">&lt;8<small>ms</small></span>
              <span class="slice-stat-name">Trip Latency</span>
            </div>
            <div class="slice-stat-sep"></div>
            <div class="slice-stat">
              <span class="slice-stat-value">05</span>
              <span class="slice-stat-name">Smart Breakers</span>
            </div>
            <div class="slice-stat-sep"></div>
            <div class="slice-stat">
              <span class="slice-stat-value">50<small>Hz</small></span>
              <span class="slice-stat-name">AC Waveform</span>
            </div>
            <div class="slice-stat-sep"></div>
            <div class="slice-stat">
              <span class="slice-stat-value">230<small>V</small></span>
              <span class="slice-stat-name">Main Inflow</span>
            </div>
          </div>

          <!-- CTA -->
          <div class="slice-cta-row">
            <button class="slice-cta-primary" id="sliceCtaBtn">
              Open Panel Console
              <svg width="15" height="15" viewBox="0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5h10m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="slice-live-badge">
              <span class="slice-live-dot"></span>
              Autonomous Guardian Armed
            </div>
          </div>
        </section>

        <!-- Right: Capability Cards -->
        <aside class="slice-cards-col">
          <div class="slice-capability-card">
            <div class="slice-cap-num">01</div>
            <h3 class="slice-cap-title">Autonomous Overcurrent Protection</h3>
            <p class="slice-cap-body">Dynamic inverse-time trip curves (IEC 60255 & IEC 60947) isolating severe overcurrent spikes in less than 8ms.</p>
          </div>
          <div class="slice-capability-card">
            <div class="slice-cap-num">02</div>
            <h3 class="slice-cap-title">Dual-Channel Hardware Link</h3>
            <p class="slice-cap-body">Direct browser Web Bluetooth (BLE GATT) pairing and local Wi-Fi WebSocket streaming at up to 5Hz telemetry cadence.</p>
          </div>
          <div class="slice-capability-card">
            <div class="slice-cap-num">03</div>
            <h3 class="slice-cap-title">Tariff & Peak Load Optimization</h3>
            <p class="slice-cap-body">Calculates real-time active power draw, power factor harmonics, and dynamic utility slabs with automated non-critical load shedding.</p>
          </div>
        </aside>
      </div>

      <!-- Footer Strip -->
      <footer class="slice-footer">
        <span class="slice-footer-copy">© VOLTRA Energy Systems · Smart Panel Architecture</span>
        <span class="slice-footer-tagline">Autonomous circuit breaker protection.</span>
        <span class="slice-footer-scroll-hint">Scroll up to return ↑</span>
      </footer>
    `;

    slide.appendChild(content);
    this.rootContainer.appendChild(slide);
    this.slideElement = slide;
  }

  private bindEvents(): void {
    const closeBtn = this.slideElement?.querySelector("#sliceCloseBtn");
    closeBtn?.addEventListener("click", () => this.close());

    const ctaBtn = this.slideElement?.querySelector("#sliceCtaBtn");
    ctaBtn?.addEventListener("click", () => {
      console.log("[VOLTRA] Platform CTA clicked — launching Grid Intelligence dashboard.");
      this._navigateToPlatform();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) this.close();
    });

    // Wheel open/close
    let wheelAcc = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener(
      "wheel",
      (e) => {
        if (!this.isOpen && e.deltaY > 30) {
          wheelAcc += e.deltaY;
          if (wheelAcc > 70) {
            this.open();
            wheelAcc = 0;
          }
          if (wheelTimer) clearTimeout(wheelTimer);
          wheelTimer = setTimeout(() => {
            wheelAcc = 0;
          }, 400);
        } else if (this.isOpen && e.deltaY < -40) {
          const c = this.slideElement?.querySelector(".voltra-slice-content") as HTMLElement | null;
          if (c && c.scrollTop <= 5) this.close();
        }
      },
      { passive: true },
    );

    // Touch swipe
    let touchY = 0;
    window.addEventListener(
      "touchstart",
      (e) => {
        touchY = e.touches[0].clientY;
      },
      { passive: true },
    );
    window.addEventListener(
      "touchend",
      (e) => {
        const delta = touchY - e.changedTouches[0].clientY;
        if (!this.isOpen && delta > 60) {
          this.open();
        } else if (this.isOpen && delta < -60) {
          const c = this.slideElement?.querySelector(".voltra-slice-content") as HTMLElement | null;
          if (c && c.scrollTop <= 5) this.close();
        }
      },
      { passive: true },
    );
  }

  public open(): void {
    if (this.isOpen || !this.slideElement) return;
    this.isOpen = true;
    this.slideElement.classList.add("slice-approaching");
    this.slideElement.classList.remove("slice-leaving");
    this.slideElement.setAttribute("aria-hidden", "false");
    document.body.classList.add("voltra-slide-open");
    this.onOpenCallback?.();
  }

  public close(): void {
    if (!this.isOpen || !this.slideElement) return;
    this.isOpen = false;
    this.slideElement.classList.remove("slice-approaching");
    this.slideElement.classList.add("slice-leaving");
    this.slideElement.setAttribute("aria-hidden", "true");
    document.body.classList.remove("voltra-slide-open");
    setTimeout(() => {
      if (!this.isOpen && this.slideElement) this.slideElement.classList.remove("slice-leaving");
    }, 800);
    this.onCloseCallback?.();
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public setTheme(theme: Theme): void {
    this.currentTheme = theme;
    if (!this.slideElement) return;
    if (theme === "dark") {
      this.slideElement.classList.remove("slice-theme-light");
      this.slideElement.classList.add("slice-theme-dark");
    } else {
      this.slideElement.classList.remove("slice-theme-dark");
      this.slideElement.classList.add("slice-theme-light");
    }
  }

  public getTheme(): Theme {
    return this.currentTheme;
  }
  public getIsOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Smooth full-page fade-out then navigate to the React dashboard.
   * In dev: proxy at /app rewrites to localhost:3000
   * In prod: /app is the React build sub-path
   */
  private _navigateToPlatform(): void {
    // Create a full-screen black overlay for the transition
    const overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:99999",
      "background:#000",
      "opacity:0",
      "transition:opacity 0.55s cubic-bezier(0.4,0,0.2,1)",
      "pointer-events:all",
    ].join(";");
    document.body.appendChild(overlay);

    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = "1";
      });
    });

    // Navigate after fade-in completes
    setTimeout(() => {
      window.location.href = "/app";
    }, 580);
  }

  public destroy(): void {
    if (this.slideElement?.parentElement) {
      this.slideElement.parentElement.removeChild(this.slideElement);
      this.slideElement = null;
    }
    document.body.classList.remove("voltra-slide-open");
  }
}

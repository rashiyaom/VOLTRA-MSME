import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import appCss from "../styles.css?url";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster } from "@/components/ui/sonner";
import { GridAdvisorChat } from "@/components/GridAdvisorChat";
import { CinematicLanding } from "@/cinematic/CinematicLanding.tsx";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">404</span>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Page Not Found</h1>
        <p className="mt-4 text-muted-foreground">The requested panel route does not exist.</p>
        <div className="mt-6">
          <Link to="/" className="pill inline-flex items-center bg-ink px-5 py-2.5 text-sm text-cream hover:bg-ink/90">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("Signal error caught in root boundary:", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">The telemetry signal was interrupted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Attempting automated reconnect to local VOLTRA hardware gateway.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="pill bg-ink px-5 py-2.5 text-sm text-cream hover:bg-ink/90"
          >
            Reconnect Telemetry
          </button>
          <a href="/" className="pill border border-border px-5 py-2.5 text-sm text-foreground hover:bg-surface">
            Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { title: "VOLTRA — Smart Energy & Circuit Protection System" },
      { name: "description", content: "VOLTRA is an IoT Smart Energy Monitoring and Intelligent Circuit Protection System with real-time AC telemetry, 5-relay smart breaker control, and autonomous overcurrent protection." },
      { name: "author", content: "VOLTRA Smart Energy Systems" },
      { property: "og:title", content: "VOLTRA — Smart Energy Telemetry & Circuit Automation" },
      { property: "og:description", content: "Real-time electrical telemetry, sub-second breaker actuation, and intelligent overload protection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg?v=20260918", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico?v=20260918" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png?v=20260918" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png?v=20260918" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png?v=20260918" },
      { rel: "manifest", href: "/site.webmanifest?v=20260918" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@700;800;900&display=swap" },
      { rel: "preload", as: "image", href: "/assets/cinematic/first-frame.webp", type: "image/webp" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const { location } = useRouterState();
  const path = location.pathname;
  const isHome = path === "/";
  const isLogin = path === "/login";
  const showsAssistant = ["/dashboard", "/breakers", "/analytics"].includes(path);

  useEffect(() => {
    const native = Boolean(
      (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.(),
    );
    if (native && location.pathname === "/") {
      void router.navigate({ to: "/dashboard", replace: true });
    }
  }, [location.pathname, router]);

  // Login page: no SiteNav, SiteFooter, or cinematic wrapper
  if (isLogin) {
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <CinematicLanding isHomePage={isHome}>
        <div className="min-h-screen flex flex-col bg-background text-foreground">
          <SiteNav />
          <main className="voltra-app-content flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      </CinematicLanding>
      {showsAssistant && <GridAdvisorChat />}
      <Toaster />
    </QueryClientProvider>
  );
}

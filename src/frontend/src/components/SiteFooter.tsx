import { Link } from "@tanstack/react-router";
import { VoltraLogo } from "@/components/VoltraLogo";

export function SiteFooter() {
  return (
    <footer className="voltra-site-footer mt-8 border-t border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <VoltraLogo size={32} showText={true} subtitle="IoT Smart Energy & Protection" />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Understand your energy use, monitor connected circuits, and keep your device setup in
            one place.
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Platform</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link to="/" className="hover:underline">
                Home
              </Link>
            </li>
            <li>
              <Link to="/dashboard" className="hover:underline">
                Dashboard
              </Link>
            </li>
            <li>
              <Link to="/breakers" className="hover:underline">
                Circuit controls
              </Link>
            </li>
            <li>
              <Link to="/analytics" className="hover:underline">
                Energy analytics
              </Link>
            </li>
            <li>
              <Link to="/settings" className="hover:underline">
                Device settings
              </Link>
            </li>
            <li>
              <Link to="/stream" className="hover:underline">
                Live stream
              </Link>
            </li>
            <li>
              <Link to="/patterns" className="hover:underline">
                Usage patterns
              </Link>
            </li>
            <li>
              <Link to="/bill-plan" className="hover:underline">
                Monthly bill plan
              </Link>
            </li>
            <li>
              <Link to="/guide" className="hover:underline">
                Field guide
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Contact</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>telemetry@voltra.energy</li>
            <li>Built for smart home &amp; distribution circuit protection</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-3 items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} VOLTRA Smart Energy Intelligence</span>
          <span>Energy monitoring. Clearly connected.</span>
        </div>
      </div>
    </footer>
  );
}

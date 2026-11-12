import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";

const capacitorBuild = process.env.VOLTRA_CAPACITOR_BUILD === "1";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
      ...(capacitorBuild
        ? {
            spa: {
              enabled: true,
              prerender: { outputPath: "index.html" },
            },
          }
        : {}),
    }),
    react(),
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    nitro(),
  ],
  server: {
    port: 3000,
    host: true,
  },
  base: capacitorBuild ? "./" : "/",
  ssr: {
    // maplibre-gl uses browser globals (window, navigator, WebGL).
    // Externalising it from the SSR bundle means Node never tries to execute it.
    noExternal: [],
    external: ["maplibre-gl"],
  },
});

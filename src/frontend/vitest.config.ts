import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["locationValidator.test.ts", "src/**/*.test.ts"],
  },
  define: {
    // Stub import.meta.env.DEV for test runtime
    "import.meta.env.DEV": "false",
  },
});

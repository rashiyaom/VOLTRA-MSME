import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const backendPort = Number(process.env.PORT || 8000);
const frontendPort = Number(process.env.FRONTEND_PORT || 3000);
const python = process.env.VOLTRA_PYTHON || "python3";
const children = new Map();
let stopping = false;

const color = {
  green: "\u001b[32m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
};

function log(message, tone = "cyan") {
  process.stdout.write(`${color[tone] || ""}${message}${color.reset}\n`);
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host: "0.0.0.0" }, () => {
      server.close(() => resolve(true));
    });
  });
}

function networkAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal)
        addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

function launch(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    // Keep all services in npm's foreground group so Ctrl+C reaches Vite,
    // Uvicorn, its reloader, and this supervisor at the same time.
    detached: false,
  });
  children.set(name, child);
  child.once("error", (error) => {
    log(`[VOLTRA] Could not start ${name}: ${error.message}`, "yellow");
    void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (!stopping) {
      log(
        `[VOLTRA] ${name} stopped unexpectedly (${signal || `exit ${code ?? 1}`}).`,
        "yellow",
      );
      void shutdown(code || 1);
    }
  });
}

async function waitFor(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return true;
    } catch {
      // A dev server normally needs a few attempts while dependencies are prepared.
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  log("\n[VOLTRA] Stopping frontend and backend…", "dim");
  for (const child of children.values()) {
    if (!child.pid) continue;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // The process may already have exited.
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  process.exit(exitCode);
}

async function main() {
  const [backendFree, frontendFree] = await Promise.all([
    portAvailable(backendPort),
    portAvailable(frontendPort),
  ]);
  if (!backendFree || !frontendFree) {
    const busy = [
      !backendFree && `backend port ${backendPort}`,
      !frontendFree && `frontend port ${frontendPort}`,
    ].filter(Boolean);
    log(
      `[VOLTRA] Cannot start: ${busy.join(" and ")} already in use.`,
      "yellow",
    );
    log("Stop the existing process, then run npm run dev again.", "dim");
    process.exit(1);
  }

  log("\n⚡ VOLTRA development environment", "green");
  log("Starting FastAPI and Vite together…", "dim");

  launch(
    "backend",
    python,
    [
      "-m",
      "uvicorn",
      "src.backend.main:app",
      "--host",
      "0.0.0.0",
      "--port",
      String(backendPort),
      "--reload",
    ],
    { AUTO_START_RAG: "false" },
  );
  launch(
    "frontend",
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "--prefix",
      "src/frontend",
      "run",
      "dev",
      "--",
      "--host",
      "0.0.0.0",
      "--port",
      String(frontendPort),
      "--strictPort",
    ],
    { VITE_API_BASE: `http://localhost:${backendPort}` },
  );

  const [backendReady, frontendReady] = await Promise.all([
    waitFor(`http://127.0.0.1:${backendPort}/api/health`),
    waitFor(`http://127.0.0.1:${frontendPort}/`),
  ]);
  if (!backendReady || !frontendReady) {
    log(
      "[VOLTRA] One or more services did not become ready within 30 seconds.",
      "yellow",
    );
    await shutdown(1);
    return;
  }

  const line = "─".repeat(58);
  log(`\n${line}`, "green");
  log("  VOLTRA is ready", "green");
  log(`  App:      http://localhost:${frontendPort}`, "cyan");
  log(`  API:      http://localhost:${backendPort}`, "cyan");
  log(`  API docs: http://localhost:${backendPort}/docs`, "cyan");
  for (const address of networkAddresses()) {
    log(`  Network:  http://${address}:${frontendPort}`, "cyan");
  }
  log(`${line}\n`, "green");
  log("Press Ctrl+C once to stop every service.", "dim");
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));
process.once("SIGHUP", () => void shutdown(0));

void main();

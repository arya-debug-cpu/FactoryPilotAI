/**
 * Server-side helper that keeps the FastAPI backend running.
 * Used only from Next.js instrumentation (node runtime).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = process.env.API_PORT ?? "8000";
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;
const LOG_FILE = process.env.API_LOG_FILE ?? "/tmp/factorypilot-api.log";

const state = globalThis as typeof globalThis & { __fpBackendBooted?: boolean };

async function probe(timeoutMs = 1500): Promise<boolean> {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    } as RequestInit);
    return response.ok;
  } catch {
    return false;
  }
}

function spawnBackend(): void {
  const cwd = path.join(/* turbopackIgnore: true */ process.cwd(), "backend");
  if (!fs.existsSync(path.join(cwd, "start.sh"))) {
    console.warn("[factorypilot] backend directory not found at", cwd);
    return;
  }
  let fd: number;
  try {
    fd = fs.openSync(LOG_FILE, "a");
  } catch {
    fd = fs.openSync("/dev/null", "a");
  }
  const child = spawn("bash", ["start.sh"], {
    cwd,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env, PORT },
  });
  child.on("error", (error) => console.warn("[factorypilot] backend spawn failed:", error.message));
  child.unref();
}

/** Start FastAPI once, then confirm it answers. */
export async function ensureBackend(): Promise<boolean> {
  if (state.__fpBackendBooted) return true;
  state.__fpBackendBooted = true;

  if (await probe()) return true;
  spawnBackend();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    if (await probe()) {
      console.log("[factorypilot] FastAPI backend is up on port", PORT);
      return true;
    }
  }
  console.warn(
    `[factorypilot] FastAPI backend did not respond on port ${PORT}. See ${LOG_FILE}`,
  );
  return false;
}

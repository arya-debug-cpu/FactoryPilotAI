/**
 * Boots the FastAPI backend together with the Next.js server so the React
 * dashboard always has a live API to talk to.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.FACTORYPILOT_NO_BACKEND === "true") return;

  const { ensureBackend } = await import("./lib/backend");
  ensureBackend();
}

/**
 * Health check used by the platform.
 * Confirms the React host is serving *and* the FastAPI backend is answering.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND = `${process.env.API_ORIGIN ?? "http://127.0.0.1:8000"}/api/health`;

export async function GET(): Promise<Response> {
  const deadline = Date.now() + 18_000;
  let lastError = "not attempted";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(BACKEND, { cache: "no-store" });
      if (response.ok) {
        const backend = await response.json().catch(() => ({}));
        return Response.json({
          status: "ok",
          service: "factorypilot-frontend",
          backend,
          time: new Date().toISOString(),
        });
      }
      lastError = `backend responded ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  return Response.json(
    { status: "degraded", service: "factorypilot-frontend", error: lastError },
    { status: 503 },
  );
}

import { healthResponseSchema, type HealthResponse } from "@amazon-2/contracts";
import { useEffect, useState } from "react";

type HealthState =
  | { kind: "checking" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "unavailable" };

export function App() {
  const [health, setHealth] = useState<HealthState>({ kind: "checking" });

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch("/api/health", { signal: controller.signal });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error("The API health check failed.");
        }

        setHealth({ kind: "ready", health: healthResponseSchema.parse(payload) });
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setHealth({ kind: "unavailable" });
        }
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <section aria-labelledby="page-title" className="panel">
        <p className="eyebrow">Amazon 2.0</p>
        <h1 id="page-title">Platform scaffold</h1>
        <p>
          React, Express 5, PostgreSQL, Prisma, and shared Zod contracts are connected.
          Product features are intentionally still to come.
        </p>
        <HealthStatus health={health} />
      </section>
    </main>
  );
}

function HealthStatus({ health }: { health: HealthState }) {
  if (health.kind === "checking") {
    return <p aria-live="polite">Checking API and database connection…</p>;
  }

  if (health.kind === "unavailable") {
    return (
      <p aria-live="assertive" className="status status--error">
        API or database unavailable. Start Docker Compose and try again.
      </p>
    );
  }

  return (
    <p aria-live="polite" className="status status--ready">
      API and PostgreSQL are healthy as of {new Date(health.health.timestamp).toLocaleTimeString()}.
    </p>
  );
}

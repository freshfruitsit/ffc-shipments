import { randomUUID } from "crypto";

const SLOW_THRESHOLD_MS = 500;

/**
 * Wraps an async operation (an RPC call, a Server Action's core logic)
 * with duration logging. Deliberately minimal — this logs to the
 * console (which Vercel and Supabase both capture in their own log
 * viewers already), not a separate paid observability product, per "Do
 * not require a paid observability product for the app to run."
 *
 * Logs: operation name, duration, success/failure, a correlation ID,
 * and the route if provided. Never logs request bodies, tokens, document
 * contents, or signed URLs — only the operation name and outcome.
 */
export async function withPerformanceLogging<T>(
  operationName: string,
  fn: () => PromiseLike<T>,
  context?: { route?: string; userId?: string }
): Promise<T> {
  const correlationId = randomUUID();
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    logResult({ operationName, durationMs, success: true, correlationId, ...context });
    return result;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    logResult({ operationName, durationMs, success: false, correlationId, ...context });
    throw err;
  }
}

function logResult(entry: {
  operationName: string;
  durationMs: number;
  success: boolean;
  correlationId: string;
  route?: string;
  userId?: string;
}) {
  const line = {
    op: entry.operationName,
    ms: entry.durationMs,
    ok: entry.success,
    cid: entry.correlationId,
    route: entry.route,
    // userId only, never email/name — safe to log, useful for tracing a
    // specific user's slow request without exposing anything sensitive.
    uid: entry.userId,
  };

  if (entry.durationMs > SLOW_THRESHOLD_MS) {
    console.warn(`[slow-operation] ${JSON.stringify(line)}`);
  } else if (!entry.success) {
    console.error(`[operation-failed] ${JSON.stringify(line)}`);
  } else if (process.env.NODE_ENV !== "production") {
    console.log(`[operation] ${JSON.stringify(line)}`);
  }
}

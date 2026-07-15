"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured server-side logging happens where the error actually
    // originates (Server Components/Actions); this client-side log is a
    // fallback so nothing is silently swallowed, tagged with Next.js's own
    // digest so it's correlate-able with server logs for the same failure.
    console.error("[app-error]", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-light text-danger">
        <AlertTriangle className="h-6 w-6" strokeWidth={2} />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          We hit an unexpected error loading this page. Try again — if it keeps happening, contact
          FFC IT with the reference below.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-muted">Reference: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
      >
        Try again
      </button>
    </div>
  );
}

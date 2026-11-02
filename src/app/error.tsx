"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? "client-error");
  }, [error]);
  return (
    <div role="alert" className="mx-auto mt-20 max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
      <h1 className="font-serif text-2xl font-semibold text-plum-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">Please try again. If the problem continues, contact support{error.digest ? ` and mention reference ${error.digest}` : ""}.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">Try again</button>
    </div>
  );
}

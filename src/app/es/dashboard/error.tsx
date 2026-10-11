"use client";
import { useEffect } from "react";

export default function DashboardErrorEs({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] erro de página:", error.message, error.stack);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <p className="text-4xl mb-4">⚠️</p>
      <h2 className="text-lg font-semibold text-ink mb-2">Algo salió mal</h2>
      <p className="text-sm text-muted mb-2 max-w-sm">
        Ocurrió un error en esta página. Intenta de nuevo o recarga la plataforma.
      </p>
      <p className="text-xs text-subtle mb-5 max-w-lg font-mono bg-surface-muted border border-line rounded-xl px-3 py-2">
        {error.message || String(error)}
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary-hover transition"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}

"use client";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] erro de página:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <p className="text-4xl mb-4">⚠️</p>
      <h2 className="text-lg font-semibold text-slate-800 mb-2">Algo deu errado</h2>
      <p className="text-sm text-slate-500 mb-5 max-w-sm">
        Ocorreu um erro nesta página. Tente novamente ou recarregue a plataforma.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
      >
        Tentar novamente
      </button>
    </div>
  );
}

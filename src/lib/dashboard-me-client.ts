"use client";

export type DashboardMe = {
  user?: {
    name: string;
    plan: string;
    status: string;
    activeMode: string;
    trialEndsAt: string;
  };
};

let currentRequest: Promise<DashboardMe> | null = null;

/** Compartilha a mesma chamada de /api/me entre o layout e a página atual.
 *  Sem isso, ambos montam juntos e duplicam a consulta ao Supabase. */
export function fetchDashboardMe(): Promise<DashboardMe> {
  if (!currentRequest) {
    currentRequest = fetch("/api/me")
      .then(response => response.ok ? response.json() : {})
      .catch(error => {
        currentRequest = null;
        throw error;
      });
  }
  return currentRequest;
}

/** Reload only after the server confirms the mode was persisted. */
export async function updateDashboardMode(mode: "personal" | "business"): Promise<void> {
  const response = await fetch("/api/admin/user-mode", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({mode})});
  const result = await response.json();
  if (!response.ok || result.activeMode !== mode) throw new Error("MODE_NOT_SAVED");
  currentRequest = null;
}

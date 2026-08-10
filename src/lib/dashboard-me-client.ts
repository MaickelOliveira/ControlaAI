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

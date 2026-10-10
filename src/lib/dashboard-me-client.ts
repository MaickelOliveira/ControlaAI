"use client";

export type DashboardMe = {
  user?: {
    name: string;
    plan: string;
    status: string;
    activeMode: string;
    trialEndsAt: string;
    previewOnly?: boolean;
    previewBusinessEnabled?: boolean;
  };
};

let currentRequest: Promise<DashboardMe> | null = null;
const PREVIEW_MODE_KEY="zelo-open-finance-preview-mode";
export function rememberPreviewDashboardMode(mode:"personal"|"business"):boolean {
  try{sessionStorage.setItem(PREVIEW_MODE_KEY,mode);return true;}catch{return false;}
}

/** Compartilha a mesma chamada de /api/me entre o layout e a página atual.
 *  Sem isso, ambos montam juntos e duplicam a consulta ao Supabase. */
export function fetchDashboardMe(): Promise<DashboardMe> {
  if (!currentRequest) {
    currentRequest = fetch("/api/me")
      .then(response => response.ok ? response.json() : {})
      .then((data:DashboardMe)=>{
        if(data.user?.previewOnly){
          try{
            const mode=sessionStorage.getItem(PREVIEW_MODE_KEY);
            if(mode==="personal"||mode==="business"&&data.user.previewBusinessEnabled===true)return {...data,user:{...data.user,activeMode:mode}};
          }catch{/* Keep the server default when browser storage is unavailable. */}
        }
        return data;
      })
      .catch(error => {
        currentRequest = null;
        throw error;
      });
  }
  return currentRequest;
}

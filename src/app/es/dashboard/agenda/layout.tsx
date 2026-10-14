import type {ReactNode} from "react";
import {GoogleSettingsWorkspaceProvider} from "@/components/GoogleSettingsWorkspace";
import {loadGoogleSettingsPageTarget} from "@/lib/google-settings-page-target";
export default async function GoogleAgendaLayout({children}:{children:ReactNode}){
 const target=await loadGoogleSettingsPageTarget();
 return <GoogleSettingsWorkspaceProvider key={target?.workspaceKey??"unavailable"} target={target}>{children}</GoogleSettingsWorkspaceProvider>;
}

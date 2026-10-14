"use client";
import {createContext,useContext,type ReactNode} from "react";
import type {GoogleSettingsTarget} from "@/lib/google-settings-client";
const GoogleSettingsWorkspace=createContext<GoogleSettingsTarget|null>(null);
export function GoogleSettingsWorkspaceProvider({target,children}:{target:GoogleSettingsTarget|null;children:ReactNode}){
 return <GoogleSettingsWorkspace.Provider value={target}>{children}</GoogleSettingsWorkspace.Provider>;
}
export function useGoogleSettingsWorkspace(){return useContext(GoogleSettingsWorkspace);}

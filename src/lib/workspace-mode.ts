/** Browser workspace preference is owner-bound and independent of WhatsApp. */
export const WORKSPACE_MODE_COOKIE="zelo_workspace_mode";
export function workspaceModeCookieValue(userId:string,mode:"personal"|"business"){return `${userId}:${mode}`;}
export function browserWorkspaceMode(userId:string,value?:string):"personal"|"business"|undefined{
 if(!value)return undefined;
 const [owner,mode,extra]=value.split(":");
 return owner===userId&&extra===undefined&&(mode==="personal"||mode==="business")?mode:undefined;
}

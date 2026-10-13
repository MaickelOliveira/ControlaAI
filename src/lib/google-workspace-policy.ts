import type {CompanyScope} from "./company-scope-policy";

export type GoogleWorkspace=Readonly<{
  userId:string;
  mode:"personal"|"business";
  companyId:string|null;
}>;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value:unknown):string {
  if(typeof value!=="string"||!UUID.test(value))throw Error("GOOGLE_WORKSPACE_INVALID");
  return value.toLowerCase();
}
function record(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("GOOGLE_WORKSPACE_REQUIRED");
  return value as Record<string,unknown>;
}
function mode(value:unknown):GoogleWorkspace["mode"] {
  if(value!=="personal"&&value!=="business")throw Error("GOOGLE_WORKSPACE_INVALID");
  return value;
}
function permission(value:unknown):boolean {
  if(value!==undefined&&typeof value!=="boolean")throw Error("GOOGLE_WORKSPACE_INVALID");
  return value!==false;
}
function canonicalWorkspace(value:unknown):GoogleWorkspace {
  const input=record(value),userId=uuid(input.userId),selectedMode=mode(input.mode);
  if(selectedMode==="personal"){
    if(input.companyId!==null)throw Error("GOOGLE_WORKSPACE_INVALID");
    return {userId,mode:selectedMode,companyId:null};
  }
  return {userId,mode:selectedMode,companyId:uuid(input.companyId)};
}

/** Input must come from the authenticated request/participant or authorized job
 * record. Validation here does not turn a user-supplied context into authority. */
export function googleWorkspaceFromContext(ownerId:string,context:CompanyScope|null|undefined):GoogleWorkspace {
  const owner=uuid(ownerId),input=record(context);
  if(input.trusted!==undefined)throw Error("GOOGLE_WORKSPACE_REQUIRED");
  if(uuid(input.userId)!==owner)throw Error("GOOGLE_WORKSPACE_OWNER_MISMATCH");
  const selectedMode=mode(input.mode),personalAllowed=permission(input.allowPersonal),businessAllowed=permission(input.allowBusiness);
  const archived=input.archivedCompanyIds;
  if(archived!==undefined&&!Array.isArray(archived))throw Error("GOOGLE_WORKSPACE_INVALID");
  const archivedIds=Array.from(archived??[],uuid);
  if(selectedMode==="personal"){
    if(!personalAllowed)throw Error("GOOGLE_WORKSPACE_ACCESS_DENIED");
    // A remembered business company never changes the personal Google binding.
    return Object.freeze({userId:owner,mode:selectedMode,companyId:null});
  }
  const companyId=uuid(input.companyId);
  if(!businessAllowed||archivedIds.includes(companyId))throw Error("GOOGLE_WORKSPACE_ACCESS_DENIED");
  return Object.freeze({userId:owner,mode:selectedMode,companyId});
}

export function googleWorkspaceKey(workspace:GoogleWorkspace):string {
  const scope=canonicalWorkspace(workspace);
  return `${scope.userId}:${scope.mode}:${scope.companyId??"personal"}`;
}

/** Stored event and binding references must retain their original workspace. */
export function assertGoogleWorkspaceMatch(expected:GoogleWorkspace,stored:GoogleWorkspace):void {
  if(googleWorkspaceKey(expected)!==googleWorkspaceKey(stored))throw Error("GOOGLE_WORKSPACE_MISMATCH");
}

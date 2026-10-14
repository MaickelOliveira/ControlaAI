import {isValidElement} from "react";
import {beforeEach,expect,it,vi} from "vitest";
const deps=vi.hoisted(()=>({auth:vi.fn(),scope:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./auth",()=>({getSession:deps.auth}));
vi.mock("./company-context",()=>({companyScopeFor:deps.scope,runWithCompanyRequest:(callback:()=>Promise<unknown>)=>callback()}));
import {loadGoogleSettingsPageTarget} from "./google-settings-page-target";
import {googleSettingsWorkspaceView} from "./google-settings-service";
import LayoutBR from "../app/dashboard/configuracoes/layout";
import LayoutPT from "../app/pt/dashboard/configuracoes/layout";
import LayoutES from "../app/es/dashboard/configuracoes/layout";
import {GoogleSettingsWorkspaceProvider} from "../components/GoogleSettingsWorkspace";
const owner="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",company="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const context={userId:owner,mode:"business" as const,companyId:company,companyName:"Fixture empresa",allowBusiness:true};
beforeEach(()=>{vi.resetAllMocks();deps.auth.mockResolvedValue({sub:owner,role:"client"});deps.scope.mockResolvedValue({...context});});
it("serializes only the authenticated canonical scope digest and display label",async()=>{
 const target=await loadGoogleSettingsPageTarget();expect(target).toEqual({...googleSettingsWorkspaceView({userId:owner,mode:"business",companyId:company}),label:"Fixture empresa"});
 expect(Object.isFrozen(target)).toBe(true);expect(JSON.stringify(target)).not.toContain(owner);expect(deps.scope).toHaveBeenCalledWith(owner);
});
it("keeps personal independent of the remembered or archived company",async()=>{
 deps.scope.mockResolvedValue({...context,mode:"personal",allowBusiness:false,archivedCompanyIds:[company]});
 expect(await loadGoogleSettingsPageTarget()).toEqual({...googleSettingsWorkspaceView({userId:owner,mode:"personal",companyId:null}),label:"Pessoal"});
});
it("uses UUID identity rather than equal names or renamed companies",async()=>{
 const first=await loadGoogleSettingsPageTarget();deps.scope.mockResolvedValue({...context,companyName:"Renamed fixture"});const renamed=await loadGoogleSettingsPageTarget();
 expect(renamed!.workspaceKey).toBe(first!.workspaceKey);expect(renamed!.label).toBe("Renamed fixture");
 deps.scope.mockResolvedValue({...context,companyId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"});expect((await loadGoogleSettingsPageTarget())!.workspaceKey).not.toBe(first!.workspaceKey);
});
it.each([null,{sub:owner,role:"admin"},{sub:owner,role:"unexpected"}])("does not disclose a target to an absent/non-client session %#",async auth=>{
 deps.auth.mockResolvedValue(auth);expect(await loadGoogleSettingsPageTarget()).toBeNull();expect(deps.scope).not.toHaveBeenCalled();
});
it.each([undefined,{trusted:true},{...context,userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"},{...context,allowBusiness:false},{...context,archivedCompanyIds:[company]},{...context,companyId:null},{...context,companyName:""},{...context,companyName:"private\nfixture"}])("fails closed for unavailable/untrusted/denied targets without breaking the page %#",async scope=>{
 deps.scope.mockResolvedValue(scope);expect(await loadGoogleSettingsPageTarget()).toBeNull();
});
it("suppresses raw authentication and context diagnostics",async()=>{
 deps.auth.mockRejectedValueOnce(Error("private fixture authentication diagnostic"));expect(await loadGoogleSettingsPageTarget()).toBeNull();
 deps.scope.mockRejectedValueOnce(Error("private fixture database diagnostic"));expect(await loadGoogleSettingsPageTarget()).toBeNull();
});
it.each([LayoutBR,LayoutPT,LayoutES])("the actual localized settings layout keys the provider by server target",async Layout=>{
 const element=await Layout({children:"fixture settings"});expect(isValidElement(element)).toBe(true);expect(element.type).toBe(GoogleSettingsWorkspaceProvider);
 expect(element.key).toBe(element.props.target!.workspaceKey);expect(element.props.target!.label).toBe("Fixture empresa");expect(element.props.children).toBe("fixture settings");
 deps.scope.mockResolvedValueOnce(undefined);const unavailable=await Layout({children:"fixture settings"});expect(unavailable.props.target).toBeNull();expect(unavailable.key).toBe("unavailable");expect(unavailable.props.children).toBe("fixture settings");
});

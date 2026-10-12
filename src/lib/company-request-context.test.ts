import {AsyncLocalStorage} from "node:async_hooks";
import {afterEach,beforeEach,expect,it,vi} from "vitest";

const mocked=vi.hoisted(()=>({cookies:vi.fn(),auth:vi.fn(),admin:vi.fn(),company:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:mocked.cookies}));
vi.mock("./auth",()=>({getSessionWithUser:mocked.auth,getAdminSession:mocked.admin}));
vi.mock("./companies",()=>({multiCompanyEnabled:()=>process.env.MULTI_COMPANY_ENABLED==="true",COMPANY_COOKIE:"zelo_company",companyContextData:mocked.company}));
import {resolveCompanyContext,runWithCompanyRequest,runWithCompanyContext,runWithTrustedCompanyJob,setCompanyContext} from "./company-context";

const ownerA="11111111-1111-4111-8111-111111111111",ownerB="22222222-2222-4222-8222-222222222222";
const companyA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",companyB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type TestRequest={owner:string;company:string;mode:"personal"|"business"};
const requests=new AsyncLocalStorage<TestRequest>();
const requestA={owner:ownerA,company:companyA,mode:"business" as const};

beforeEach(()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","true");vi.resetAllMocks();
 mocked.cookies.mockImplementation(async()=>({get:(name:string)=>name==="ca_session"?{value:"fictitious-session"}:name==="zelo_company"?{value:`${requests.getStore()!.owner}:${requests.getStore()!.company}`} :undefined}));
 mocked.auth.mockImplementation(async()=>({session:{role:"client"},user:{id:requests.getStore()!.owner,activeMode:requests.getStore()!.mode}}));
 mocked.company.mockImplementation(async(_owner:string,id:string)=>({company:{id,name:"Empresa de teste"},archivedCompanyIds:[]}));
});
afterEach(()=>vi.unstubAllEnvs());

it("resolves concurrent protected reads only once inside one HTTP request",async()=>{
 const scopes=await requests.run(requestA,()=>runWithCompanyRequest(()=>Promise.all(Array.from({length:6},()=>resolveCompanyContext()))));
 expect(scopes).toHaveLength(6);expect(scopes.every(s=>s&&"companyId" in s&&s.userId===ownerA&&s.companyId===companyA)).toBe(true);
 expect(mocked.auth).toHaveBeenCalledTimes(1);expect(mocked.company).toHaveBeenCalledTimes(1);
});

it("keeps concurrent clients and two companies of one client independent",async()=>{
 const inputs=[requestA,{owner:ownerA,company:companyB,mode:"business" as const},{owner:ownerB,company:companyA,mode:"personal" as const}];
 const outputs=await Promise.all(inputs.map(input=>requests.run(input,()=>runWithCompanyRequest(async()=>{const first=await resolveCompanyContext();await Promise.resolve();const second=await resolveCompanyContext();expect(second).toEqual(first);return first;}))));
 expect(outputs.map(s=>s&&"companyId" in s?[s.userId,s.companyId,s.mode]:null)).toEqual(inputs.map(s=>[s.owner,s.company,s.mode]));
 expect(mocked.company).toHaveBeenCalledTimes(3);
});

it("reads updated company permissions again on the next HTTP request",async()=>{
 const first=await requests.run(requestA,()=>runWithCompanyRequest(resolveCompanyContext));
 mocked.company.mockResolvedValueOnce({company:{id:companyA,name:"Empresa de teste",archivedAt:"2026-10-12"},archivedCompanyIds:[companyA]});
 const second=await requests.run(requestA,()=>runWithCompanyRequest(resolveCompanyContext));
 expect(first).toMatchObject({allowBusiness:true});expect(second).toMatchObject({allowBusiness:false,archivedCompanyIds:[companyA]});
 expect(mocked.company).toHaveBeenCalledTimes(2);
});

it("fails all dependent reads closed and retries authentication in a new request",async()=>{
 mocked.auth.mockResolvedValueOnce(null);
 const failures=await requests.run(requestA,()=>runWithCompanyRequest(()=>Promise.allSettled([resolveCompanyContext(),resolveCompanyContext()])));
 expect(failures.every(s=>s.status==="rejected")).toBe(true);expect(mocked.company).not.toHaveBeenCalled();
 expect(await requests.run(requestA,()=>runWithCompanyRequest(resolveCompanyContext))).toMatchObject({userId:ownerA,companyId:companyA});
 expect(mocked.auth).toHaveBeenCalledTimes(2);
});

it("does not create a global cache for callers without an HTTP context",async()=>{
 await requests.run(requestA,()=>Promise.all(Array.from({length:6},()=>resolveCompanyContext())));
 expect(mocked.company).toHaveBeenCalledTimes(6);
});

it("preserves explicit participant scopes and trusted server jobs",async()=>{
 const scope={userId:ownerA,companyId:companyA,mode:"personal" as const,allowBusiness:false};
 expect(await runWithCompanyContext(async()=>{setCompanyContext(scope);return resolveCompanyContext();})).toEqual(scope);
 expect(await runWithTrustedCompanyJob(resolveCompanyContext)).toEqual({trusted:true});
 await expect(runWithCompanyContext(resolveCompanyContext)).rejects.toThrow("COMPANY_CONTEXT_MISSING");
 expect(mocked.auth).not.toHaveBeenCalled();expect(mocked.company).not.toHaveBeenCalled();
});

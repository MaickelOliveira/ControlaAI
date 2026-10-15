import {AsyncLocalStorage} from "node:async_hooks";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocked=vi.hoisted(()=>({cookies:vi.fn(),auth:vi.fn(),admin:vi.fn(),session:vi.fn()}));
vi.mock("next/headers",()=>({cookies:mocked.cookies}));
vi.mock("./auth",()=>({getSessionWithUser:mocked.auth,getAdminSession:mocked.admin,getSession:mocked.session}));
import {GET as ledger} from "../app/api/finances/ledger/route";
import {GET as banks} from "../app/api/open-finance/route";
import {GET as dashboard} from "../app/api/dashboard/route";
import {configureCompanyDatabaseScope} from "./supabase";
import {resolveCompanyContext,runWithCompanyContext,runWithCompanyRequest,setCompanyContext} from "./company-context";
import {getOpenFinanceAccess} from "./open-finance-access";

const ownerA="11111111-1111-4111-8111-111111111111",ownerB="22222222-2222-4222-8222-222222222222";
const companyA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",companyB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",companyC="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
type Scope={owner:string;company:string;mode:"personal"|"business"};
const requests=new AsyncLocalStorage<Scope>();
const business={owner:ownerA,company:companyA,mode:"business" as const};
let reads:{path:string;owner:string|null;companyHeader:string|null;predicate:string|null}[];
let failCompanies=false,archived=false;

beforeEach(()=>{
 vi.resetAllMocks();reads=[];failCompanies=false;archived=false;
 for(const [name,value] of Object.entries({MULTI_COMPANY_ENABLED:"true",OPEN_FINANCE_ENABLED:"true",OPEN_FINANCE_PUBLIC_ENABLED:"true",POLP_PRODUCTION_CLIENT_ID:"fictitious-id",POLP_PRODUCTION_CLIENT_SECRET:"fictitious-provider-value",SUPABASE_URL:"https://database.test",SUPABASE_SERVICE_ROLE_KEY:"fictitious-database-value",OPEN_FINANCE_CONNECT_ENABLED:"false"}))vi.stubEnv(name,value);
 mocked.cookies.mockImplementation(async()=>({get:(name:string)=>name==="ca_session"?{value:"fictitious-session"}:name==="zelo_company"?{value:`${requests.getStore()!.owner}:${requests.getStore()!.company}`}:undefined}));
 mocked.auth.mockImplementation(async()=>({session:{role:"client"},user:{id:requests.getStore()!.owner,name:"Cliente de teste",email:"client@example.test",plan:"business",status:"active",activeMode:requests.getStore()!.mode}}));
 mocked.session.mockImplementation(async()=>({role:"client",sub:requests.getStore()!.owner}));
 configureCompanyDatabaseScope(resolveCompanyContext);
 vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  const headers=new Headers(init?.headers);
  reads.push({path:url.pathname,owner:url.searchParams.get("user_id"),companyHeader:headers.get("x-zelo-company"),predicate:url.searchParams.get("and")});
  if(url.pathname==="/rest/v1/companies"){
   if(failCompanies)return Response.json({message:"fictitious outage"},{status:400});
   const ids=url.searchParams.get("user_id")===`eq.${ownerA}`?[companyA,companyB]:[companyC];
   return Response.json(ids.map((id,index)=>({id,name:"Mesmo nome de empresa",document:null,is_default:index===0,created_at:"2026-10-01",archived_at:archived?"2026-10-12":null,custom_categories_expense:[],custom_categories_income:[]})));
  }
  if(url.pathname==="/rest/v1/rpc/zelo_of_access")return Response.json({enabled:true,country_code:"BR",country_verified_at:"2026-10-01"});
  if(url.pathname==="/rest/v1/rpc/zelo_of_report")return Response.json({from:"2026-10-01",to:"2026-10-31",totals:[],movements:[],next:null,history_complete:false});
  if(url.pathname==="/rest/v1/rpc/zelo_of_overview")return Response.json({connections:[],resources:[],limits:[],bills:[],credit:[],sync:[]});
  if(url.pathname==="/rest/v1/rpc/zelo_of_installment_anchors")return Response.json({items:[],incomplete:false});
  if(["/rest/v1/finances","/rest/v1/tasks","/rest/v1/accounts","/rest/v1/wpp_phone_links"].includes(url.pathname))return Response.json([],{headers:{"content-range":"*/0"}});
  throw Error("UNEXPECTED_TEST_READ");
 }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

function readLedger(scope:Scope=business){return requests.run(scope,()=>ledger(new Request(`https://zelo.test/api/finances/ledger?mode=${scope.mode}&from=2026-10-01&to=2026-10-31`)));}
function readBanks(scope:Scope=business){return requests.run(scope,()=>banks(new Request(`https://zelo.test/api/open-finance?mode=${scope.mode}`)));}
const companyReads=()=>reads.filter(r=>r.path==="/rest/v1/companies");

it("loads the financial GET with real access/storage services and one company read",async()=>{
 const response=await readLedger();expect(response.status).toBe(200);expect((await response.json()).finances).toEqual([]);
 expect(companyReads()).toHaveLength(1);
 const protectedReads=reads.filter(r=>["/rest/v1/finances","/rest/v1/accounts"].includes(r.path));
 expect(protectedReads.length).toBeGreaterThan(0);expect(protectedReads.every(r=>r.owner===`eq.${ownerA}`&&r.companyHeader===companyA&&r.predicate?.includes(companyA))).toBe(true);
 expect(reads.find(r=>r.path==="/rest/v1/rpc/zelo_of_installment_anchors")?.companyHeader).toBe(companyA);
});

it("loads the bank GET with one authorized company snapshot",async()=>{
 expect((await readBanks()).status).toBe(200);expect(companyReads()).toHaveLength(1);
 expect(reads.find(r=>r.path==="/rest/v1/rpc/zelo_of_overview")?.companyHeader).toBe(companyA);
});

it("shares the Dashboard company read across tasks and finances",async()=>{
 const response=await requests.run(business,()=>dashboard());expect(response.status).toBe(200);
 expect(companyReads()).toHaveLength(1);
 expect(reads.filter(r=>["/rest/v1/finances","/rest/v1/tasks"].includes(r.path)).every(r=>r.companyHeader===companyA)).toBe(true);
});

it("keeps concurrent real bank reads scoped to their client and selected company",async()=>{
 const scopes=[business,{...business,company:companyB},{owner:ownerB,company:companyC,mode:"business" as const}];
 const responses=await Promise.all(scopes.map(readBanks));expect(responses.every(r=>r.status===200)).toBe(true);
 expect(companyReads()).toHaveLength(3);
 expect(reads.filter(r=>r.path==="/rest/v1/rpc/zelo_of_overview").map(r=>r.companyHeader).sort()).toEqual([companyA,companyB,companyC].sort());
});

it("rechecks archiving on the next request and retains personal-mode selection",async()=>{
 expect((await readBanks()).status).toBe(200);archived=true;
 expect((await readBanks()).status).toBe(503);
 expect((await readBanks({...business,mode:"personal"})).status).toBe(200);
 expect(companyReads()).toHaveLength(3);
});

it("returns an unavailable ledger on a company read failure, then recovers without stale state",async()=>{
 failCompanies=true;expect((await readLedger()).status).toBe(503);
 expect(reads.filter(r=>r.path==="/rest/v1/rpc/zelo_of_overview")).toHaveLength(0);
 failCompanies=false;expect((await readLedger()).status).toBe(200);expect(companyReads()).toHaveLength(2);
});

it("does not resolve or read company data before authenticating the GET",async()=>{
 mocked.auth.mockResolvedValue(null);expect((await readLedger()).status).toBe(401);expect((await readBanks()).status).toBe(401);
 expect(reads).toEqual([]);
});

it("still revalidates an explicit WhatsApp company against current storage",async()=>{
 archived=true;
 await expect(runWithCompanyContext(async()=>{
  setCompanyContext({userId:ownerA,companyId:companyA,mode:"business",allowBusiness:true});
  return getOpenFinanceAccess({id:ownerA,email:"client@example.test",plan:"business",status:"active",activeMode:"business"},"business",{throwOnStorageError:true});
 })).rejects.toThrow("OF_ACCESS_UNAVAILABLE");
 expect(companyReads()).toHaveLength(1);
});

it("checks an explicitly requested worker company separately from the HTTP selection",async()=>{
 const identity={id:ownerA,email:"client@example.test",plan:"business",status:"active",activeMode:"business"} as const;
 const scope=await requests.run(business,()=>runWithCompanyRequest(async()=>{
  await resolveCompanyContext();
  return getOpenFinanceAccess(identity,"business",{companyId:companyB,throwOnStorageError:true});
 }));
 expect(scope).toMatchObject({userId:ownerA,companyId:companyB});expect(companyReads()).toHaveLength(2);
 await expect(getOpenFinanceAccess(identity,"business",{companyId:companyC,throwOnStorageError:true})).rejects.toThrow("OF_ACCESS_UNAVAILABLE");
});

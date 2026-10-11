import {afterEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const company=vi.hoisted(()=>vi.fn());
vi.mock("./companies",()=>({multiCompanyEnabled:()=>process.env.MULTI_COMPANY_ENABLED==="true",requireCompany:company}));
import {companyAppointmentPhones,companyNoticeDescription} from "./company-notices";
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
const links=[{phone:"personal",access:"personal" as const},{phone:"business",access:"business" as const},{phone:"both",access:"both" as const}];
it("labels business notices with their own company, retaining personal text",async()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","true");company.mockResolvedValue({name:"Empresa Dois"});
 expect(await companyNoticeDescription("owner","company-two","Salário")).toBe("Empresa Dois · Salário");expect(company).toHaveBeenCalledWith("owner","company-two");
 expect(await companyNoticeDescription("owner",undefined,"Consulta médica")).toBe("Consulta médica");
});
it("does not leak new business appointments to personal-only phones and preserves legacy sharing",()=>{
 vi.stubEnv("MULTI_COMPANY_ENABLED","true");expect(companyAppointmentPhones({companyId:"two",workspaceLegacy:false},links)).toEqual(["business","both"]);
 expect(companyAppointmentPhones({workspaceLegacy:false},links)).toEqual(["personal","both"]);
 expect(companyAppointmentPhones({companyId:"default",workspaceLegacy:true},links)).toEqual(["personal","business","both"]);
 vi.stubEnv("MULTI_COMPANY_ENABLED","false");expect(companyAppointmentPhones({},links)).toHaveLength(3);
});

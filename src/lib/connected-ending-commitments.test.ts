import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({access:vi.fn(),overview:vi.fn(),credit:vi.fn(),anchors:vi.fn()}));
vi.mock("./open-finance-access",()=>({getOpenFinanceAccess:m.access}));
vi.mock("./finance-ledger-storage",()=>({readBankOverview:m.overview,readCreditData:m.credit,readBankInstallmentAnchors:m.anchors}));
import {connectedEndingCommitmentsAnswer} from "./connected-ending-commitments";
const user={id:"fixture",email:"fixture@example.test",plan:"business",status:"active",activeMode:"personal"} as const;
const scope={userId:user.id,companyId:"authorized-company",companyName:"Empresa fictícia",mode:"business",environment:"production"};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED","true");m.access.mockResolvedValue(scope);m.overview.mockResolvedValue({connections:[{id:"bank",status:"active",institution_name:"Banco fictício"}],resources:[{id:"loan",connection_id:"bank",resource_type:"loan",name:"Crédito fictício"}],credit:[{resource_id:"loan",currency:"BRL",outstanding_amount:"90",next_installment_amount:"30",due_date:"2027-01-15"}]});m.credit.mockResolvedValue({plans:[],progress:[{resource_id:"loan",periodicity:"MENSAL"}]});m.anchors.mockResolvedValue({items:[],incomplete:false});});
it("uses the authorized mode/company for all bank readers and includes loans ending by the cutoff",async()=>{
 const result=await connectedEndingCommitmentsAnswer(user,"business","2026-11-02","2027-01-31",[],[]);
 expect(m.access).toHaveBeenCalledWith(user,"business",{throwOnStorageError:true});
 for(const reader of [m.overview,m.anchors])expect(reader).toHaveBeenCalledWith(scope);
 expect(m.credit).toHaveBeenCalledWith(scope,{from:"2026-11-02",to:"2026-11-02"});
 expect(result).toContain("R$ 30,00 por mês");expect(result).toContain("Empresa fictícia");expect(result).toContain("Crédito fictício");expect(result).not.toContain("Assinaturas recorrentes");
});
it("never substitutes a complete zero when bank readers fail",async()=>{
 m.overview.mockRejectedValue(Error("private failure"));
 const reply=await connectedEndingCommitmentsAnswer(user,"personal","2026-11-02","2027-01-31",[],[]);
 expect(reply).toContain("subtotal conhecido");expect(reply).toContain("não esteve disponível");expect(reply).not.toContain("private failure");
});

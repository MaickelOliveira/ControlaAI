import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ user: vi.fn(), owner: vi.fn(), links: vi.fn(), workspace: vi.fn(), list: vi.fn(), require: vi.fn(), create: vi.fn(), pending: vi.fn(), savePending: vi.fn(), clear: vi.fn(), send: vi.fn(), scope: vi.fn(), paused: vi.fn(), enabled: vi.fn() }));
vi.mock("./users", () => ({ getUserById: m.user, hasAccess: () => true }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: m.owner, getPhonesForUser: m.links, setPhoneWorkspace: m.workspace }));
vi.mock("./companies", () => ({ multiCompanyEnabled: m.enabled, getCompanies: m.list, requireCompany: m.require, createCompany: m.create }));
vi.mock("./conversations", () => ({ addMessage: vi.fn(), getAiPaused: m.paused, phoneVariants: (phone: string) => [phone] }));
vi.mock("./pending-actions", () => ({ getPendingAction: m.pending, setPendingAction: m.savePending, clearPendingAction: m.clear }));
vi.mock("./rate-limit", () => ({ checkRateLimit: async () => true }));
vi.mock("./whatsapp", () => ({ sendText: m.send }));
vi.mock("./company-context", () => ({ runWithCompanyContext: (callback: () => Promise<void>) => callback(), setCompanyContext: m.scope, currentCompanyContext: () => undefined }));
import { companyChoice, withWhatsAppCompany } from "./whatsapp-company";
const companies = [{ id: "a", name: "Empresa A", isDefault: true }, { id: "b", name: "Empresa B", isDefault: false }];
beforeEach(() => {
  vi.clearAllMocks(); m.enabled.mockReturnValue(true); m.owner.mockResolvedValue("owner"); m.user.mockResolvedValue({ id: "owner", activeMode: "business", locale: "pt-BR" });
  m.links.mockResolvedValue([{ phone: "5511", userId: "owner", access: "both" }]); m.list.mockResolvedValue(companies); m.pending.mockResolvedValue(null); m.paused.mockResolvedValue(false);
  m.require.mockImplementation(async (_owner, id) => companies.find(company => company.id === id));
});
it("asks before using an ambiguous company and resumes a held request after selection", async () => {
  const next = vi.fn(); await withWhatsAppCompany({ from: "5511", text: "gastei 50 em farmácia" }, next);
  expect(next).not.toHaveBeenCalled(); expect(m.savePending).toHaveBeenCalledWith("5511", expect.objectContaining({ type: "company_selection", resume: expect.objectContaining({ text: "gastei 50 em farmácia" }) }));
  m.pending.mockResolvedValue({ type: "company_selection", userId: "owner", resume: { text: "gastei 50 em farmácia" } });
  await withWhatsAppCompany({ from: "5511", text: "2" }, next);
  expect(m.workspace).toHaveBeenCalledWith("owner", "5511", "b", "business"); expect(m.scope).toHaveBeenCalledWith(expect.objectContaining({ companyId: "b" }));
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ text: "gastei 50 em farmácia" }));
});
it("switches only the sending participant and cancels the old pending action", async () => {
  m.links.mockResolvedValue([{ phone: "5511", access: "both", activeCompanyId: "a" }, { phone: "5522", access: "both", activeCompanyId: "a" }]);
  const next = vi.fn(); await withWhatsAppCompany({ from: "5511", text: "usar empresa Empresa B" }, next);
  expect(m.workspace).toHaveBeenCalledExactlyOnceWith("owner", "5511", "b", "business"); expect(m.clear).toHaveBeenCalledWith("5511"); expect(next).not.toHaveBeenCalled();
});
it("never exposes businesses to a personal-only participant", async () => {
  m.links.mockResolvedValue([{ phone: "5511", access: "personal" }]); await withWhatsAppCompany({ from: "5511", text: "listar empresas" }, vi.fn());
  expect(m.list).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledWith("5511", expect.stringContaining("somente ao modo pessoal"));
});
it("does not execute a pending action from another company", async () => {
  m.links.mockResolvedValue([{ phone: "5511", access: "both", activeCompanyId: "b", activeWorkspaceMode: "business" }]);
  m.pending.mockResolvedValue({ type: "recurring_confirmation", userId: "owner", companyId: "a" }); const next = vi.fn();
  await withWhatsAppCompany({ from: "5511", text: "sim" }, next); expect(m.clear).toHaveBeenCalledWith("5511"); expect(next).not.toHaveBeenCalled();
});
it("leaves a paused conversation and a disabled feature untouched", async () => {
  const next = vi.fn(); m.paused.mockResolvedValue(true); await withWhatsAppCompany({ from: "5511", text: "usar empresa Empresa B" }, next);
  expect(m.workspace).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
  m.enabled.mockReturnValue(false); await withWhatsAppCompany({ from: "5511", text: "gastei 50" }, next); expect(m.list).not.toHaveBeenCalled();
});
it("does not guess similar company names", () => {
  expect(companyChoice("Empresa", companies)).toBeUndefined(); expect(companyChoice("2", companies)).toBe("b"); expect(companyChoice("empresa a", companies)).toBe("a");
});
it("does not silently move a participant to another company after removal",async()=>{
 m.links.mockResolvedValue([{phone:"5511",access:"both"}]);m.list.mockResolvedValue([{id:"a",name:"Old",isDefault:false,archivedAt:"2026-10-11"},companies[1]]);
 const next=vi.fn();await withWhatsAppCompany({from:"5511",text:"gastei 20"},next);
 expect(next).not.toHaveBeenCalled();expect(m.savePending).toHaveBeenCalledWith("5511",expect.objectContaining({type:"company_selection"}));expect(m.send).toHaveBeenCalledWith("5511",expect.not.stringContaining("Old"));
});
it("keeps personal requests working when every enterprise is archived and refuses business requests",async()=>{
 m.list.mockResolvedValue([{...companies[0],archivedAt:"2026-10-11"}]);m.links.mockResolvedValue([{phone:"5511",access:"both",activeWorkspaceMode:"personal"}]);
 const next=vi.fn();await withWhatsAppCompany({from:"5511",text:"gastei 20"},next);expect(next).toHaveBeenCalledOnce();expect(m.scope).toHaveBeenCalledWith(expect.objectContaining({mode:"personal",allowBusiness:false,archivedCompanyIds:["a"]}));
 m.links.mockResolvedValue([{phone:"5511",access:"business"}]);next.mockClear();await withWhatsAppCompany({from:"5511",text:"gastei 20"},next);expect(next).not.toHaveBeenCalled();expect(m.send).toHaveBeenCalledWith("5511",expect.stringContaining("não tem empresas ativas"));
});
it("continues a personal multi-turn request after the last company is archived",async()=>{
 m.list.mockResolvedValue([{...companies[0],archivedAt:"2026-10-11"}]);m.links.mockResolvedValue([{phone:"5511",access:"both",activeWorkspaceMode:"personal"}]);
 const next=vi.fn(async()=>{m.pending.mockResolvedValue({type:"slot_fill",userId:"owner",companyId:"a",workspaceMode:"personal"});});
 await withWhatsAppCompany({from:"5511",text:"registre uma despesa"},next);
 await withWhatsAppCompany({from:"5511",text:"50 reais na farmácia"},next);
 expect(next).toHaveBeenCalledTimes(2);expect(m.clear).not.toHaveBeenCalled();
 m.pending.mockResolvedValue({type:"slot_fill",userId:"owner",companyId:"a",workspaceMode:"business"});
 await withWhatsAppCompany({from:"5511",text:"sim"},next);expect(next).toHaveBeenCalledTimes(2);expect(m.clear).toHaveBeenCalledWith("5511");
});
it("does not continue a pending request from another workspace or owner",async()=>{
 m.links.mockResolvedValue([{phone:"5511",access:"both",activeCompanyId:"a",activeWorkspaceMode:"personal"}]);
 m.pending.mockResolvedValue({type:"slot_fill",userId:"owner",companyId:"a",workspaceMode:"business"});const next=vi.fn();
 await withWhatsAppCompany({from:"5511",text:"50"},next);expect(next).not.toHaveBeenCalled();expect(m.clear).toHaveBeenCalled();
 m.pending.mockResolvedValue({type:"slot_fill",userId:"foreign",companyId:"a",workspaceMode:"personal"});
 await expect(withWhatsAppCompany({from:"5511",text:"50"},next)).rejects.toThrow("COMPANY_OWNER_MISMATCH");expect(next).not.toHaveBeenCalled();
});
it("discards a held business request after the participant becomes personal-only",async()=>{
 m.links.mockResolvedValue([{phone:"5511",access:"personal"}]);
 m.pending.mockResolvedValue({type:"company_selection",userId:"owner",resume:{text:"paguei fornecedor 500"}});
 m.require.mockResolvedValue(companies[0]);const next=vi.fn();
 await withWhatsAppCompany({from:"5511",text:"gastei 20 na farmácia"},next);
 expect(m.clear).toHaveBeenCalledWith("5511");
 expect(m.scope).toHaveBeenCalledWith(expect.objectContaining({mode:"personal"}));
 expect(next).toHaveBeenCalledExactlyOnceWith({from:"5511",text:"gastei 20 na farmácia"});
 expect(m.workspace).not.toHaveBeenCalled();
});
it("marks a dedicated business participant as unable to access personal rows",async()=>{
 m.links.mockResolvedValue([{phone:"5511",access:"business",activeCompanyId:"a",activeWorkspaceMode:"business"}]);
 const next=vi.fn();await withWhatsAppCompany({from:"5511",text:"quanto gastei"},next);
 expect(next).toHaveBeenCalledOnce();
 expect(m.scope).toHaveBeenCalledWith(expect.objectContaining({mode:"business",allowPersonal:false,allowBusiness:true}));
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  rpc: vi.fn(), config: vi.fn(), user: vi.fn(), byPhone: vi.fn(), owner: vi.fn(), links: vi.fn(), access: vi.fn(),
  scope: vi.fn(), claim: vi.fn(), ready: vi.fn(), finish: vi.fn(), send: vi.fn(), text: vi.fn(), history: vi.fn(), paused: vi.fn(),
}));
vi.mock("./supabase", () => ({ getSupabase: () => ({ rpc: m.rpc }) }));
vi.mock("./whatsapp-config", () => ({ getConfig: m.config }));
vi.mock("./users", () => ({ getUserById: m.user, getUserByPhone: m.byPhone, hasAccess: (u: { status: string }) => u.status === "active" }));
vi.mock("./wpp-phone-links", () => ({ getUserIdByPhone: m.owner, getPhonesForUser: m.links, getPhoneAccess: m.access }));
vi.mock("./open-finance-access", () => ({ getOpenFinanceAccess: m.scope, isPublicOpenFinanceEnabled: () => true }));
vi.mock("./open-finance-http", () => ({
  openFinanceRpc: async (scope: { userId: string; mode: string }, name: string, args: Record<string, unknown> = {}) => {
    const result = await m.rpc(name, { ...args, p_user: scope.userId, p_mode: scope.mode });
    if (result.error) throw Error("OF_STORAGE_ERROR");
    return result.data;
  },
}));
vi.mock("./whatsapp-activity", () => ({ claimWhatsAppQuestion: m.claim }));
vi.mock("./waba", () => ({ sendCreditPixButtons: m.send }));
vi.mock("./whatsapp", () => ({ sendText: m.text, sendCreditPixButtons: m.send }));
vi.mock("./conversations", () => ({ addMessage: m.history, getAiPaused: m.paused, phoneVariants: (phone: string) => [phone.replace(/\D/g, "")] }));

import { answerCreditPixQuestion, parseCreditPixAnswer, runCreditPixQuestions } from "./credit-pix-whatsapp";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const QUESTION = "00000000-0000-4000-8000-000000000003";
const TOKEN = "00000000-0000-4000-8000-000000000004";
const COMPANY = "00000000-0000-4000-8000-000000000005";
const PHONE = "5511999990000";
const GET = "zelo_of_get_credit_pix_question";
const CLAIM = "zelo_of_claim_credit_pix_question";
const ARM = "zelo_of_arm_credit_pix_question";
const FINISH = "zelo_of_finish_credit_pix_question";
const ANSWER = "zelo_of_answer_credit_pix_question";
const target = () => ({ id: QUESTION, userId: USER, mode: "personal", companyId: null, phone: PHONE });
const user = () => ({ id: USER, phone: PHONE, status: "active", activeMode: "personal", plan: "business", locale: "pt-BR", email: "fixture@example.invalid" });
const link = () => ({ phone: PHONE, userId: USER, relation: "titular", access: "both", activeWorkspaceMode: "personal" });
const facts = () => ({ id: QUESTION, status: "pending", valid: true, credit: OTHER, payment: COMPANY,
  gross: "850.16", paymentAmount: "821.48", charges: "28.68", date: "2026-10-12", paymentDate: "2026-10-12",
  name: "Pix no crédito | Loja Fictícia", paymentName: "Pix enviado | Loja Fictícia", bank: "Banco Exemplo" });
let targets: unknown[];
let question: Record<string, unknown>;
let hooks: Record<string, (() => unknown | Promise<unknown>) | undefined>;
const calls = (name: string) => m.rpc.mock.calls.filter(([operation]) => operation === name);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_WHATSAPP_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_ENABLED", "true");
  vi.stubEnv("OPEN_FINANCE_PUBLIC_ENABLED", "true");
  vi.stubEnv("MULTI_COMPANY_ENABLED", "false");
  targets = [target()]; question = facts(); hooks = {};
  m.config.mockResolvedValue({ provider: "waba" }); m.paused.mockResolvedValue(false);
  m.user.mockResolvedValue(user()); m.byPhone.mockResolvedValue(user()); m.owner.mockResolvedValue(USER);
  m.links.mockResolvedValue([link()]); m.access.mockResolvedValue("both");
  m.scope.mockResolvedValue({ userId: USER, mode: "personal", environment: "production" });
  m.ready.mockResolvedValue(true); m.finish.mockResolvedValue(undefined);
  m.claim.mockResolvedValue({ ready: m.ready, finish: m.finish });
  m.send.mockResolvedValue(true); m.history.mockResolvedValue(undefined); m.text.mockResolvedValue(true);
  m.rpc.mockImplementation(async (name: string) => {
    if (hooks[name]) return { data: await hooks[name]!(), error: null };
    if (name === "zelo_of_credit_pix_targets") return { data: targets, error: null };
    if (name === GET) return { data: { ...question }, error: null };
    if (name === CLAIM) return { data: TOKEN, error: null };
    if (name === ANSWER) return { data: { status: "confirmed" }, error: null };
    return { data: true, error: null };
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("structured credit Pix answers", () => {
  it.each([["yes", true], ["no", false]] as const)("parses only the %s button payload", (suffix, confirmed) => {
    expect(parseCreditPixAnswer(`zelo-credit-pix:${QUESTION}:${suffix}`)).toEqual({ questionId: QUESTION, confirmed });
  });
  it.each(["sim", "não", "yes", "", `other:${QUESTION}:yes`, "zelo-credit-pix:not-a-uuid:yes",
    `zelo-credit-pix:${QUESTION}:true`, `zelo-credit-pix:${QUESTION}:YES`, `zelo-credit-pix:${QUESTION}:yes:extra`,
    `prefix zelo-credit-pix:${QUESTION}:yes`, `zelo-credit-pix:${QUESTION}:yes\n`])("does not reinterpret ordinary or malformed text: %j", payload => {
    expect(parseCreditPixAnswer(payload)).toBeUndefined();
  });
});

describe("quiet, private credit Pix delivery", () => {
  it.each([undefined, "false", "TRUE", "1"])("does nothing unless explicitly enabled: %j", async flag => {
    vi.stubEnv("OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED", flag);
    expect(await runCreditPixQuestions()).toBe(0);
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("never sends through Evolution", async () => {
    m.config.mockResolvedValue({ provider: "evolution" });
    expect(await runCreditPixQuestions()).toBe(0);
    expect(m.rpc).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(m.text).not.toHaveBeenCalled();
  });
  it("reserves silence before claiming/arming, rereads after arm, and saves only private accepted history", async () => {
    expect(await runCreditPixQuestions()).toBe(1);
    expect(m.claim).toHaveBeenCalledWith(PHONE);
    const rpcOrder = (name: string) => m.rpc.mock.invocationCallOrder[m.rpc.mock.calls.findIndex(([operation]) => operation === name)];
    expect(m.claim.mock.invocationCallOrder[0]).toBeLessThan(rpcOrder(CLAIM));
    expect(rpcOrder(CLAIM)).toBeLessThan(rpcOrder(ARM));
    expect(calls(GET).length).toBeGreaterThanOrEqual(2);
    const lastGet = m.rpc.mock.calls.map(([name], index) => name === GET ? m.rpc.mock.invocationCallOrder[index] : -1).filter(n => n >= 0).at(-1)!;
    expect(lastGet).toBeGreaterThan(rpcOrder(ARM));
    expect(m.ready.mock.invocationCallOrder.at(-1)).toBeGreaterThan(rpcOrder(ARM));
    expect(m.send).toHaveBeenCalledWith(PHONE, QUESTION, expect.any(String));
    expect(m.history).toHaveBeenCalledWith(PHONE, expect.objectContaining({ role: "assistant", privateFinancial: true, content: expect.any(String) }));
    expect(m.history.mock.invocationCallOrder[0]).toBeGreaterThan(m.send.mock.invocationCallOrder[0]);
    expect(calls(FINISH).at(-1)?.[1]).toEqual(expect.objectContaining({ p_user: USER, p_mode: "personal", p_question: QUESTION, p_token: TOKEN, p_status: "asked" }));
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("asks the holder to confirm the same payment and the extra card charges", async () => {
    await runCreditPixQuestions();
    const body=m.send.mock.calls[0][2];
    expect(body).toContain("é só de juros e taxas?");
    expect(body).toContain("somente se for o mesmo pagamento");
  });
  it("does not claim a question or send when the conversation is busy/closed", async () => {
    m.claim.mockResolvedValue(null);
    expect(await runCreditPixQuestions()).toBe(0);
    expect(calls(CLAIM)).toHaveLength(0); expect(calls(ARM)).toHaveLength(0); expect(m.send).not.toHaveBeenCalled();
  });
  it("releases the quiet reservation when another worker owns the question", async () => {
    hooks[CLAIM] = function unclaimedQuestion() { return null; };
    expect(await runCreditPixQuestions()).toBe(0);
    expect(m.send).not.toHaveBeenCalled(); expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it.each([false, null, "true"])("requires strict valid=true for the question: %j", async valid => {
    question.valid = valid;
    expect(await runCreditPixQuestions()).toBe(0); expect(m.send).not.toHaveBeenCalled();
  });
  it("fresh facts invalidated during arm are returned to pending without transport", async () => {
    hooks[ARM] = () => { question.valid = false; return true; };
    expect(await runCreditPixQuestions()).toBe(0);
    expect(m.send).not.toHaveBeenCalled(); expect(m.history).not.toHaveBeenCalled();
    expect(calls(FINISH).at(-1)?.[1]).toEqual(expect.objectContaining({ p_status: "pending" }));
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("an inbound that wins after arm prevents transport and leaves a pending question", async () => {
    hooks[ARM] = () => { m.ready.mockResolvedValue(false); return true; };
    expect(await runCreditPixQuestions()).toBe(0);
    expect(m.send).not.toHaveBeenCalled(); expect(calls(FINISH).at(-1)?.[1]).toEqual(expect.objectContaining({ p_status: "pending" }));
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it.each(["false", "throw"])("an ambiguous transport result (%s) is uncertain with no alternate transport", async result => {
    if (result === "throw") m.send.mockRejectedValue(Error("network interrupted")); else m.send.mockResolvedValue(false);
    expect(await runCreditPixQuestions().catch(() => 0)).toBe(0);
    expect(m.send).toHaveBeenCalledTimes(1); expect(m.text).not.toHaveBeenCalled(); expect(m.history).not.toHaveBeenCalled();
    expect(calls(FINISH).at(-1)?.[1]).toEqual(expect.objectContaining({ p_status: "uncertain" }));
    expect(m.finish).toHaveBeenCalledTimes(1);
    targets = []; await runCreditPixQuestions(); expect(m.send).toHaveBeenCalledTimes(1);
  });
  it("history storage failure after acceptance never restores pending or sends again", async () => {
    m.history.mockRejectedValue(Error("history unavailable"));
    await runCreditPixQuestions().catch(() => undefined);
    expect(m.send).toHaveBeenCalledTimes(1);
    expect(calls(FINISH).some(([, args]) => args.p_status === "pending")).toBe(false);
    expect(m.finish).toHaveBeenCalledTimes(1);
  });
  it("fails closed on more than twenty targets rather than an unbounded dispatch", async () => {
    targets = Array.from({ length: 21 }, () => target());
    await Promise.resolve().then(runCreditPixQuestions).catch(() => undefined);
    expect(m.send).not.toHaveBeenCalled(); expect(m.claim).not.toHaveBeenCalled();
  });
  it.each(["id", "userId", "companyId"])("rejects malformed target %s before claiming", async field => {
    targets = [{ ...target(), [field]: "not-an-id" }];
    await runCreditPixQuestions().catch(() => undefined); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it.each(["inactive", "trial"])("does not deliver to a non-active account (%s)", async status => {
    m.user.mockResolvedValue({ ...user(), status });
    await runCreditPixQuestions(); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("rejects a linked delegate even when the number has both-mode permission", async () => {
    m.links.mockResolvedValue([{ ...link(), relation: "contador" }]);
    await runCreditPixQuestions(); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it.each([
    { userId: OTHER, mode: "personal", environment: "production" },
    { userId: USER, mode: "business", environment: "production" },
    { userId: USER, mode: "personal", environment: "sandbox" },
  ])("rejects a scope that differs from the target: %j", async scope => {
    m.scope.mockResolvedValue(scope);
    await runCreditPixQuestions(); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("does not send an old-company question after the holder switches company", async () => {
    targets = [{ ...target(), mode: "business", companyId: COMPANY }];
    m.links.mockResolvedValue([{ ...link(), activeWorkspaceMode: "business", activeCompanyId: OTHER }]);
    m.scope.mockResolvedValue({ userId: USER, mode: "business", environment: "production", companyId: COMPANY });
    await runCreditPixQuestions(); expect(m.claim).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
  });
  it("rechecks the holder link after arming, before sending financial facts", async () => {
    hooks[ARM] = () => { m.links.mockResolvedValue([]); return true; };
    await runCreditPixQuestions(); expect(m.send).not.toHaveBeenCalled(); expect(m.finish).toHaveBeenCalledTimes(1);
    expect(calls(FINISH).at(-1)?.[1]).toEqual(expect.objectContaining({ p_status: "pending" }));
  });
});

describe("answering as the currently authorized holder", () => {
  it.each([true, false])("passes only structured confirmation=%j to the scoped RPC", async confirmed => {
    expect(await answerCreditPixQuestion(PHONE, { questionId: QUESTION, confirmed })).toBe(true);
    expect(calls(ANSWER)).toHaveLength(1);
    expect(calls(ANSWER)[0][1]).toEqual(expect.objectContaining({ p_user: USER, p_mode: "personal", p_question: QUESTION, p_phone: PHONE, p_confirmed: confirmed }));
    expect(m.send).not.toHaveBeenCalled();
  });
  it("does not mutate when the phone has been unlinked", async () => {
    m.owner.mockResolvedValue(null); m.byPhone.mockResolvedValue(null); m.links.mockResolvedValue([]);
    await answerCreditPixQuestion(PHONE, { questionId: QUESTION, confirmed: true });
    expect(calls(ANSWER)).toHaveLength(0);
  });
  it("does not mutate for a delegate or a disabled Open Finance scope", async () => {
    m.links.mockResolvedValue([{ ...link(), relation: "contador" }]);
    await answerCreditPixQuestion(PHONE, { questionId: QUESTION, confirmed: true });
    expect(calls(ANSWER)).toHaveLength(0);
    m.links.mockResolvedValue([link()]); m.scope.mockResolvedValue(null);
    await answerCreditPixQuestion(PHONE, { questionId: QUESTION, confirmed: true });
    expect(calls(ANSWER)).toHaveLength(0);
  });
  it("does not treat a string confirmation as a typed boolean", async () => {
    await answerCreditPixQuestion(PHONE, { questionId: QUESTION, confirmed: "true" as unknown as boolean });
    expect(calls(ANSWER)).toHaveLength(0);
  });
});

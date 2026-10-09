/**
 * Prova de conceito de leitura Open Finance. Esta integração nunca recebe uma
 * base URL por configuração: consentimentos e dados ficam sempre no sandbox.
 * Não importa nem altera lançamentos do Zelo.
 */
const API_ORIGIN = "https://api.polp.com.br";
const SANDBOX_BASE = `${API_ORIGIN}/api/v2/sandbox`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEST_CLIENT_ID = "zelo-admin-sandbox";
// Documento fictício publicado no exemplo da própria documentação do sandbox.
const TEST_CPF = "12345678900";

export type PolpPage<T> = { data: T[]; meta?: { next_cursor?: string | null } };
export type PolpInstitution = {
  id: string; name: string; type: "PERSONAL" | "BUSINESS" | "BOTH"; status: string;
};
export type PolpConsent = {
  id: string; institution_id: string; cliente_user_id?: string | null;
  status: string; execution_status?: string | null;
};
export type PolpAmount = { amount: string | number; currency: string };
export type PolpAccount = {
  id: string; consent_id: string; number: string; branch_code?: string | null;
  type: string; balance?: { available_amount?: PolpAmount | null } | null;
};
export type PolpTransaction = {
  id: string; transaction_name: string; transaction_date_time: string;
  credit_debit_type: string; transaction_amount: PolpAmount;
  category_ref?: string | null;
};
export type PolpCard = { id: string; name: string; credit_card_network?: string; limits?: Array<{ available_amount?: PolpAmount; used_amount?: PolpAmount }> };
export type PolpCardTransaction = {
  id: string; transaction_name: string; transaction_date_time: string;
  credit_debit_type: string; transaction_type?: string | null;
  brazilian_amount: PolpAmount; bill_id?: string | null; bill_forecast_date?: string | null;
  charge_identificator?: number | null; charge_number?: number | null;
};
export type PolpResource = { type: string; status: string; status_label?: string; resource_id?: string | null };
export type PolpRecord = { id: string; [key: string]: unknown };
export type PolpSnapshot = {
  resources: PolpResource[]; accounts: PolpAccount[]; accountTransactions: Array<PolpTransaction & { accountId: string }>;
  cards: PolpCard[]; cardTransactions: Array<PolpCardTransaction & { cardId: string }>;
  bills: PolpRecord[]; loans: PolpRecord[]; financings: PolpRecord[];
  investments: Record<string, PolpRecord[]>;
  investmentTransactions: Record<string, PolpRecord[]>;
};

export class PolpSandboxError extends Error {
  constructor(message: string, public readonly status = 502) { super(message); }
}

export function requirePolpUuid(value: string): string {
  if (!UUID.test(value)) throw new PolpSandboxError("Identificador inválido.", 400);
  return value;
}

function credentials(): HeadersInit {
  const clientId = process.env.POLP_SANDBOX_CLIENT_ID;
  const secret = process.env.POLP_SANDBOX_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new PolpSandboxError("Configure as chaves de teste da Polp no servidor.", 503);
  }
  return { "x-api-client": clientId, "x-api-secret": secret };
}

async function request<T>(path: string, options?: { body?: object; public?: boolean }): Promise<T> {
  const url = `${options?.public ? `${API_ORIGIN}/api/v2` : SANDBOX_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options?.body ? "POST" : "GET",
      headers: {
        ...(options?.public ? {} : credentials()),
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof PolpSandboxError) throw error;
    throw new PolpSandboxError("Não foi possível conectar ao sandbox da Polp.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PolpSandboxError("A Polp recusou as credenciais ou a conta ainda não foi aprovada.", 502);
    }
    throw new PolpSandboxError(`O sandbox da Polp respondeu com HTTP ${response.status}.`);
  }
  try { return await response.json() as T; }
  catch { throw new PolpSandboxError("Resposta inválida do sandbox da Polp."); }
}

function cursorQuery(cursor?: string): string {
  if (!cursor) return "";
  if (cursor.length > 1000 || !/^[\w=+/-]+$/.test(cursor)) {
    throw new PolpSandboxError("Cursor inválido.", 400);
  }
  return `?cursor=${encodeURIComponent(cursor)}`;
}

export function listPolpInstitutions(cursor?: string) {
  return request<PolpPage<PolpInstitution>>(`/institutions${cursorQuery(cursor)}`, { public: true });
}

export function listSandboxConsents(cursor?: string) {
  return request<PolpPage<PolpConsent>>(`/consents${cursorQuery(cursor)}`);
}

export function createSandboxConsent(institutionId: string) {
  return request<{ data: PolpConsent }>("/consents", {
    body: {
      institution_id: requirePolpUuid(institutionId),
      cpf: TEST_CPF,
      cliente_user_id: TEST_CLIENT_ID,
      products: ["ACCOUNT", "CREDIT_CARD_ACCOUNT", "CREDIT_OPERATIONS", "INVESTMENTS"],
      avoidDuplicates: true,
    },
  });
}

export function listSandboxAccounts(consentId: string, cursor?: string) {
  return request<PolpPage<PolpAccount>>(
    `/consents/${requirePolpUuid(consentId)}/accounts${cursorQuery(cursor)}`
  );
}

export function listSandboxTransactions(accountId: string, cursor?: string) {
  return request<PolpPage<PolpTransaction>>(
    `/accounts/${requirePolpUuid(accountId)}/transactions${cursorQuery(cursor)}`
  );
}

/** Busca todas as páginas; exceder o limite falha visivelmente, sem mostrar um extrato incompleto. */
async function allPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 30; page++) {
    const response = await request<PolpPage<T>>(`${path}${cursorQuery(cursor)}`);
    if (!Array.isArray(response.data)) throw new PolpSandboxError("Lista inesperada no sandbox da Polp.");
    items.push(...response.data);
    cursor = response.meta?.next_cursor || undefined;
    if (!cursor) return items;
    if (cursors.has(cursor)) throw new PolpSandboxError("A paginação da Polp repetiu um cursor.");
    cursors.add(cursor);
  }
  throw new PolpSandboxError("Há mais dados do que o limite deste teste. Consulte por período.");
}

/** Consulta ampla para inspeção. Não persiste dados, nem vincula as contas manuais do Zelo. */
export async function getSandboxSnapshot(consentId: string): Promise<PolpSnapshot> {
  const id = requirePolpUuid(consentId);
  const resources = (await request<{ data: PolpResource[] }>(`/consents/${id}/resources`)).data;
  const accounts = await allPages<PolpAccount>(`/consents/${id}/accounts`);
  const cards = await allPages<PolpCard>(`/consents/${id}/credit-cards`);
  const accountTransactions: PolpSnapshot["accountTransactions"] = [];
  for (const account of accounts) {
    const transactions = await allPages<PolpTransaction>(`/accounts/${requirePolpUuid(account.id)}/transactions`);
    accountTransactions.push(...transactions.map(item => ({ ...item, accountId: account.id })));
  }
  const cardTransactions: PolpSnapshot["cardTransactions"] = [];
  const bills: PolpRecord[] = [];
  for (const card of cards) {
    const cardId = requirePolpUuid(card.id);
    const transactions = await allPages<PolpCardTransaction>(`/credit-cards/${cardId}/transactions`);
    cardTransactions.push(...transactions.map(item => ({ ...item, cardId })));
    bills.push(...await allPages<PolpRecord>(`/credit-cards/${cardId}/bills`));
  }
  const loans = await allPages<PolpRecord>(`/consents/${id}/loans`);
  const financings = await allPages<PolpRecord>(`/consents/${id}/financings`);
  const investments: Record<string, PolpRecord[]> = {};
  const investmentTransactions: Record<string, PolpRecord[]> = {};
  for (const type of ["bank-fixed-incomes", "credit-fixed-incomes", "funds", "treasure-titles", "variable-incomes"]) {
    investments[type] = await allPages<PolpRecord>(`/consents/${id}/${type}`);
    for (const investment of investments[type]) {
      const investmentId = requirePolpUuid(investment.id);
      investmentTransactions[`${type}:${investmentId}`] = await allPages<PolpRecord>(`/${type}/${investmentId}/transactions`);
    }
  }
  return { resources, accounts, accountTransactions, cards, cardTransactions, bills, loans, financings, investments, investmentTransactions };
}

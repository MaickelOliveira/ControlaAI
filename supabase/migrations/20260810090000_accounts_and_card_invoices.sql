-- Controle de contas: contas bancárias e cartão de crédito, associados aos
-- lançamentos de Finanças, com modo pessoal/empresarial (mesmo padrão de
-- mode já usado no resto do sistema) e ciclo de fatura completo pra cartão.
--
-- ⚠️ IMPORTANTE: esta migration precisa ser rodada MANUALMENTE no SQL
-- Editor do Supabase (não existe runner/CLI automático neste projeto —
-- já mordeu o projeto 3x nesta sessão assumir que schema.sql documentado
-- = migration aplicada em produção). Rode este arquivo por completo, uma
-- única vez.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  mode text not null default 'personal' check (mode in ('personal', 'business')),
  name text not null,
  type text not null check (type in ('bank', 'credit_card')),
  is_default boolean not null default false,
  -- só fazem sentido quando type = 'credit_card'; ficam null pra conta bancária
  credit_limit numeric,
  -- restrito a 1-28 de propósito — evita o caso de dia 29/30/31 não existir
  -- em fevereiro/meses curtos; ver findOrCreateInvoiceForDate em accounts.ts
  closing_day int check (closing_day between 1 and 28),
  due_day int check (due_day between 1 and 28),
  created_at timestamptz not null default now()
);
create index if not exists accounts_user_idx on accounts(user_id);
create index if not exists accounts_user_mode_idx on accounts(user_id, mode);
create unique index if not exists accounts_user_mode_name_uidx on accounts(user_id, mode, lower(name));
-- no máximo 1 conta padrão ("coringa") por usuário+modo — índice único
-- parcial, só considera linhas com is_default = true
create unique index if not exists accounts_user_mode_default_uidx on accounts(user_id, mode) where is_default;

-- Uma linha por ciclo de fatura de uma conta type='credit_card'.
create table if not exists card_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  period_start date not null,
  period_end date not null,   -- data de fechamento do ciclo
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists card_invoices_account_idx on card_invoices(account_id);
create index if not exists card_invoices_account_status_idx on card_invoices(account_id, status);
-- no máximo 1 fatura por ciclo (mesma conta + mesmo period_end)
create unique index if not exists card_invoices_account_period_uidx on card_invoices(account_id, period_end);

-- Nullable nas duas — lançamentos antigos (sem conta) e usuários que nunca
-- cadastraram conta continuam com account_id/card_invoice_id null pra
-- sempre, sem quebrar nada. on delete set null: apagar conta/fatura nunca
-- apaga o lançamento financeiro, só desvincula (mesmo padrão já usado em
-- grocery_purchases.finance_id).
alter table finances add column if not exists account_id uuid references accounts(id) on delete set null;
alter table finances add column if not exists card_invoice_id uuid references card_invoices(id) on delete set null;
create index if not exists finances_account_idx on finances(account_id);
create index if not exists finances_card_invoice_idx on finances(card_invoice_id);

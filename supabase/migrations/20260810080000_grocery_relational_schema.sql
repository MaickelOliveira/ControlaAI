-- Migra o Supermercado do blob único `grocery.data jsonb` (linha id=1,
-- todos os usuários juntos) para tabelas relacionais por usuário.
--
-- Motivo: comparação de preço por item entre mercados e ranking de mercado
-- mais barato (features novas) exigem agregação SQL por produto×loja, que
-- um blob único reprocessado inteiro em JS a cada leitura não escala nem é
-- seguro sob escrita concorrente (load-modify-save da linha inteira).
--
-- ⚠️ IMPORTANTE: esta migration precisa ser rodada MANUALMENTE no SQL
-- Editor do Supabase (não existe runner/CLI automático neste projeto).
-- Rode este arquivo por completo, na ordem, uma única vez.
--
-- Backup manual recomendado antes de rodar:
--   create table grocery_backup_20260810 as table grocery;

-- ── 1. Tabelas novas ──────────────────────────────────────────────

create table if not exists grocery_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  location text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists grocery_stores_user_idx on grocery_stores(user_id);
create unique index if not exists grocery_stores_user_name_uidx
  on grocery_stores(user_id, lower(name));

create table if not exists grocery_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  category text not null default 'Outros',
  default_unit text not null default 'un',
  created_at timestamptz not null default now()
);
create index if not exists grocery_products_user_idx on grocery_products(user_id);
create index if not exists grocery_products_user_normalized_idx
  on grocery_products(user_id, normalized_name);

create table if not exists grocery_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  store_id uuid not null references grocery_stores(id) on delete cascade,
  date date not null,
  total numeric not null default 0,
  source text not null default 'manual', -- 'manual' | 'whatsapp_text' | 'whatsapp_receipt' | 'whatsapp_quick'
  finance_id uuid references finances(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists grocery_purchases_user_idx on grocery_purchases(user_id);
create index if not exists grocery_purchases_user_date_idx on grocery_purchases(user_id, date desc);
create index if not exists grocery_purchases_store_idx on grocery_purchases(store_id);

create table if not exists grocery_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references grocery_purchases(id) on delete cascade,
  product_id uuid references grocery_products(id) on delete set null,
  product_name text not null,
  category text not null default 'Outros',
  price numeric not null default 0,
  quantity numeric not null default 1,
  unit text not null default 'un',
  price_estimated boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists grocery_purchase_items_purchase_idx on grocery_purchase_items(purchase_id);
create index if not exists grocery_purchase_items_product_idx on grocery_purchase_items(product_id);

create table if not exists grocery_shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  product_id uuid references grocery_products(id) on delete set null,
  name text not null,
  category text not null default 'Outros',
  quantity text not null default '1',
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists grocery_shopping_list_items_user_idx on grocery_shopping_list_items(user_id);
create index if not exists grocery_shopping_list_items_user_checked_idx
  on grocery_shopping_list_items(user_id, checked);

-- ── 2. Backfill dos dados existentes no blob `grocery` (linha id=1) ──
-- Idempotente (ON CONFLICT/NOT EXISTS), pode ser rodado mais de uma vez.

insert into grocery_stores (id, user_id, name, location, created_at)
select
  (elem->>'id')::uuid,
  (elem->>'userId')::uuid,
  coalesce(elem->>'name', 'Sem nome'),
  coalesce(elem->>'location', ''),
  now()
from grocery, jsonb_array_elements(coalesce(data->'stores', '[]'::jsonb)) as elem
where id = 1
  and (elem->>'id') is not null
  and (elem->>'userId') is not null
on conflict (id) do nothing;

-- Auditoria (rode ANTES do passo abaixo pra saber se algo vai ficar de fora):
-- select p->>'id', p->>'storeId', p->>'storeName' from grocery,
--   jsonb_array_elements(data->'purchases') as p where id = 1
--   and not exists (select 1 from grocery_stores s where s.id = (p->>'storeId')::uuid);

insert into grocery_purchases (id, user_id, store_id, date, total, source, created_at)
select
  (p->>'id')::uuid,
  (p->>'userId')::uuid,
  (p->>'storeId')::uuid,
  coalesce((p->>'date')::date, current_date),
  coalesce((p->>'total')::numeric, 0),
  'manual',
  coalesce((p->>'createdAt')::timestamptz, now())
from grocery, jsonb_array_elements(coalesce(data->'purchases', '[]'::jsonb)) as p
where id = 1
  and (p->>'id') is not null
  and exists (select 1 from grocery_stores s where s.id = (p->>'storeId')::uuid)
on conflict (id) do nothing;

insert into grocery_purchase_items (purchase_id, product_name, category, price, quantity, unit, created_at)
select
  (p->>'id')::uuid,
  coalesce(item->>'productName', 'Item'),
  coalesce(item->>'category', 'Outros'),
  coalesce((item->>'price')::numeric, 0),
  coalesce((item->>'quantity')::numeric, 1),
  coalesce(item->>'unit', 'un'),
  now()
from grocery,
     jsonb_array_elements(coalesce(data->'purchases', '[]'::jsonb)) as p,
     jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) as item
where id = 1
  and exists (select 1 from grocery_purchases gp where gp.id = (p->>'id')::uuid)
  and not exists (
    select 1 from grocery_purchase_items gpi
    where gpi.purchase_id = (p->>'id')::uuid and gpi.product_name = coalesce(item->>'productName', 'Item')
  );

insert into grocery_shopping_list_items (id, user_id, name, category, quantity, checked, created_at)
select
  (elem->>'id')::uuid,
  (elem->>'userId')::uuid,
  coalesce(elem->>'name', 'Item'),
  coalesce(elem->>'category', 'Outros'),
  coalesce(elem->>'quantity', '1'),
  coalesce((elem->>'checked')::boolean, false),
  now()
from grocery, jsonb_array_elements(coalesce(data->'shoppingList', '[]'::jsonb)) as elem
where id = 1
  and (elem->>'id') is not null
  and (elem->>'userId') is not null
on conflict (id) do nothing;

-- Bootstrap do catálogo de produtos a partir do histórico. A fórmula de
-- normalização aqui (minúsculo + translate de acentos + colapso de espaços)
-- PRECISA bater com a de findOrCreateProduct() em src/lib/grocery.ts, senão
-- produtos migrados aqui param de casar com itens novos vindos do bot.
insert into grocery_products (user_id, name, normalized_name, category, default_unit, created_at)
select distinct on (gp.user_id, lower(regexp_replace(trim(translate(gpi.product_name,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuuc AAAAAEEEEIIIIOOOOOUUUUC'
  )), '\s+', ' ', 'g')))
  gp.user_id,
  gpi.product_name,
  lower(regexp_replace(trim(translate(gpi.product_name,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuuc AAAAAEEEEIIIIOOOOOUUUUC'
  )), '\s+', ' ', 'g')),
  gpi.category,
  gpi.unit,
  now()
from grocery_purchase_items gpi
join grocery_purchases gp on gp.id = gpi.purchase_id
order by gp.user_id, lower(regexp_replace(trim(translate(gpi.product_name,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuuc AAAAAEEEEIIIIOOOOOUUUUC'
  )), '\s+', ' ', 'g')), gpi.created_at asc
on conflict do nothing;

update grocery_purchase_items gpi
set product_id = gpr.id
from grocery_purchases gp, grocery_products gpr
where gp.id = gpi.purchase_id
  and gpr.user_id = gp.user_id
  and gpr.normalized_name = lower(regexp_replace(trim(translate(gpi.product_name,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuuc AAAAAEEEEIIIIOOOOOUUUUC'
    )), '\s+', ' ', 'g'))
  and gpi.product_id is null;

update grocery_shopping_list_items gsli
set product_id = gpr.id
from grocery_products gpr
where gpr.user_id = gsli.user_id
  and gpr.normalized_name = lower(regexp_replace(trim(translate(gsli.name,
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuuc AAAAAEEEEIIIIOOOOOUUUUC'
    )), '\s+', ' ', 'g'))
  and gsli.product_id is null;

-- ── 3. Conferência pós-migration (rode manualmente e compare) ──
-- select count(*) from grocery, jsonb_array_elements(data->'stores') where id=1;       -- vs select count(*) from grocery_stores;
-- select count(*) from grocery, jsonb_array_elements(data->'purchases') where id=1;    -- vs select count(*) from grocery_purchases;
-- select count(*) from grocery, jsonb_array_elements(data->'shoppingList') where id=1; -- vs select count(*) from grocery_shopping_list_items;

-- A tabela `grocery` (blob antigo) NÃO é apagada aqui — fica como backup
-- até o corte em produção ser validado. Uma migration futura separada pode
-- fazer `drop table grocery;` depois disso.

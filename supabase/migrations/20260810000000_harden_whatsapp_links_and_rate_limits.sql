-- Telefones em tabela própria: a chave primária impede que o mesmo número
-- seja vinculado simultaneamente a contas diferentes.
create table if not exists wpp_phone_links (
  phone text primary key,
  user_id uuid not null references users(id) on delete cascade,
  name text,
  relation text,
  access text not null default 'both' check (access in ('personal', 'business', 'both')),
  linked_at timestamptz not null default now()
);

create index if not exists wpp_phone_links_user_idx on wpp_phone_links(user_id);

-- Migra a lista JSON usada pelas versões anteriores.
insert into wpp_phone_links (phone, user_id, name, relation, access)
select
  phone.value,
  u.id,
  nullif(u.wpp_phone_names ->> phone.value, ''),
  nullif(u.wpp_phone_relations ->> phone.value, ''),
  case
    when u.wpp_phone_access ->> phone.value in ('personal', 'business', 'both')
      then u.wpp_phone_access ->> phone.value
    else 'both'
  end
from users u
cross join lateral jsonb_array_elements_text(coalesce(u.wpp_phones, '[]'::jsonb)) as phone(value)
where phone.value <> ''
on conflict (phone) do nothing;

-- Migra também o campo singular mais antigo quando ele ainda existir.
insert into wpp_phone_links (phone, user_id)
select u.wpp_phone, u.id
from users u
where nullif(u.wpp_phone, '') is not null
on conflict (phone) do nothing;

-- Limites de tentativa para login, cadastro e código de vinculação.
create table if not exists rate_limits (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

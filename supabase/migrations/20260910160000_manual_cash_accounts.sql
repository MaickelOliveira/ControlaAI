-- Libera contas manuais sem cartão de crédito. Todo usuário existente recebe
-- a carteira Dinheiro nos modos pessoal e empresarial. Lançamentos antigos
-- sem conta são apenas vinculados a ela; valores, datas e categorias permanecem intactos.

insert into accounts (user_id, mode, name, type, is_default)
select u.id, m.mode, 'Dinheiro', 'bank', false
from users u
cross join (values ('personal'), ('business')) as m(mode)
where not exists (
  select 1 from accounts a
  where a.user_id = u.id and a.mode = m.mode and lower(a.name) = 'dinheiro'
);

-- Dinheiro passa a ser o padrão inicial em contas antigas. O aplicativo ainda
-- pergunta qual usar sempre que houver mais de uma conta disponível.
update accounts
set is_default = false
where is_default = true
  and exists (
    select 1 from accounts cash
    where cash.user_id = accounts.user_id
      and cash.mode = accounts.mode
      and lower(cash.name) = 'dinheiro'
      and cash.id <> accounts.id
  );

update accounts
set is_default = true
where lower(name) = 'dinheiro';

-- Todo lançamento legado sem conta passa para Dinheiro no mesmo modo. Isso
-- torna as consultas por conta úteis desde o primeiro acesso, sem apagar ou
-- recalcular qualquer valor do histórico.
update finances f
set account_id = cash.id
from accounts cash
where f.account_id is null
  and cash.user_id = f.user_id
  and cash.mode = f.mode
  and lower(cash.name) = 'dinheiro';

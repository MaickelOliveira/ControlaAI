-- Idioma da conta — usado pelo bot do WhatsApp, e-mails transacionais e
-- pra decidir qual árvore de páginas (/, /es, /pt) mostrar. Aditivo puro:
-- default 'pt-BR' preserva o comportamento de toda conta já existente.
alter table public.users
  add column if not exists locale text not null default 'pt-BR';

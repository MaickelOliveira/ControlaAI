-- Bucket privado para fotos/capturas de tela enviadas pelo cliente no chat
-- de suporte. O navegador nunca acessa o Storage diretamente: as rotas do
-- app conferem a sessão antes de baixar cada arquivo com a service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket privado para os arquivos do Drive (comprovantes, contratos, fotos
-- e faturas salvos pelo cliente via WhatsApp ou painel web). Antes ficavam
-- só no disco local do servidor (perdidos a cada redeploy sem volume
-- persistente); a partir de agora vivem no Storage do Supabase. O
-- navegador nunca acessa o bucket diretamente: as rotas do app conferem a
-- sessão antes de baixar cada arquivo com a service role (mesmo modelo do
-- bucket "support-attachments").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drive-files',
  'drive-files',
  false,
  26214400, -- 25MB, mesmo teto já aplicado no upload (src/lib/upload-limits.ts)
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'application/csv', 'text/plain',
    'video/mp4', 'video/webm', 'video/quicktime',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

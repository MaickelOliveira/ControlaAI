# Open Finance Brasil: operação e liberação

A versão oficial mantém os recursos atuais da Zelo. O catálogo completo do provedor é paginado e separado por tipo: PERSONAL/BOTH em Pessoal, BUSINESS/BOTH em Empresa. Instituições com indisponibilidade aparecem sinalizadas. A presença no catálogo não garante todos os produtos ou histórico completo de cada banco.

## Implantação

1. Manter `OPEN_FINANCE_PUBLIC_ENABLED=false` e `OPEN_FINANCE_WHATSAPP_ENABLED=false` enquanto aplica e verifica `20261010230000_open_finance_public.sql`. Usar somente o projeto correto; nunca executar fixtures/testes na produção. A migração não habilita clientes.
2. Implantar a main revisada no serviço oficial existente. Preservar as credenciais e configurações atuais, com `OPEN_FINANCE_PREVIEW_ONLY=false`, a origem HTTPS oficial, CONNECT/SYNC habilitados e os secrets reais de assinatura/worker já configurados. Conferir login, Contas, Finanças, Dashboard e menus existentes.
3. A entrega assinada de eventos precisa atingir `/api/webhook/open-finance` da **Zelo oficial**. O receiver antigo da prévia reconhece apenas o proprietário e não serve ao lançamento público. Ao alterar o destino na Polp, conservar assinatura/eventos; nunca copiar secrets para arquivos, chat ou repositório. Não desativar o endpoint antigo antes de confirmar o novo destino.
4. Após confirmação da ampliação de acesso, habilitar `OPEN_FINANCE_PUBLIC_ENABLED=true`, `OPEN_FINANCE_PROVIDER_AUTH_URLS_ENABLED=true` e `OPEN_FINANCE_WHATSAPP_ENABLED=true` no serviço oficial e reimplantar. A segunda flag permite URLs HTTPS fornecidas pela API autenticada da Polp após validar titular, instituição e consentimento; não libera URLs fornecidas pelo cliente e não altera validação TLS. Sem ela, vale a lista manual de hosts.
5. Verificar a saúde recente dos dois modos com `supabase/verify/open_finance_public.sql`. Um novo titular ativo confirma que a conta bancária é brasileira em Contas; essa declaração é registrada, não inferida por idioma. PJ continua seguindo o plano Empresa. Cada titular lê os termos e autoriza pessoalmente no banco. Nenhum banco de terceiros é conectado pelo operador.

## Atualização e consultas

Eventos são verificados por HMAC antes de resolver o titular no armazenamento privado. Eventos desconhecidos ou erros de leitura recebem 503 para nova entrega. Os trabalhos usam leases persistentes e verificam o usuário atual antes de buscar uma página. Conexões revogadas não importam novos dados. A fila pública evita que um antigo proprietário sem acesso PJ bloqueie clientes elegíveis.

O painel acompanha o armazenamento a cada dez segundos enquanto visível. A IA interpreta período/filtros, e as consultas financeiras são calculadas no servidor sobre o mesmo extrato do Dashboard: conta, cartão, WhatsApp e plataforma. Perguntas não baixam novamente os dados da Polp. Respostas bancárias anteriores são removidas do contexto enviado ao modelo; o histórico autorizado da conversa conserva a resposta.

Consultas suportadas: gasto/receita/resultado por período; categoria/estabelecimento e detalhamento financeiro; saldos bancários, limites, investimentos e faturas recebidos. A consulta por pessoa continua limitada aos registros manuais; a consulta por uma conta específica orienta o filtro de Finanças. Moedas diferentes de BRL, dados desconhecidos, transferências e pagamentos de fatura excluídos não entram nos gastos. Avisos de cobertura, falha e possível duplicidade acompanham o total.

Um link de autorização vencido pode ser recriado para o mesmo consentimento e as mesmas permissões. Revogação bloqueia localmente a importação antes de pedir o cancelamento à Polp. Não cancelar uma conexão real do titular apenas para teste sem sua instrução.

## Reversão

Primeiro desligar PUBLIC/WHATSAPP/PROVIDER_AUTH_URLS e reimplantar para retornar ao acesso do proprietário. Manter o receiver oficial compatível até estabilizar entregas e preservar dados/consentimentos. Só então considerar `supabase/rollback/20261010230000_open_finance_public.sql`; ela restaura capabilities v4 e remove apenas os novos RPCs/heartbeat. Conserva o registro da declaração brasileira, os acessos registrados e o histórico bancário. Não apaga dados e não revoga consentimentos na Polp.

## Verificação

Executar testes TypeScript/Vitest, lint, compilação e os runners SQL locais, incluindo público, isolamento, sincronização/revogação e relatório. Auditar as dependências; os nove avisos preexistentes permanecem registrados em dependency-audit-followup.md e não foram corrigidos por esta mudança. A autorização real já concluída pelo titular prova o caso Inter PJ; não representa teste real de todos os bancos/produtos.

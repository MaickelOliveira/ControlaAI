# Prévia privada do Open Finance Brasil

## Destino

- Serviço: `lp/zelo-open-finance-preview`.
- Código: branch `feature/polp-sandbox-poc`, `Dockerfile.open-finance-preview`.
- Painel seguro: `https://ztcjzs.easypanel.host`.
- Aplicação: `https://lp-zelo-open-finance-preview.ztcjzs.easypanel.host`.
- Serviço existente `lp/controlaai` e branch `main` permanecem inalterados.

## Configuração

`OPEN_FINANCE_PREVIEW_ONLY=true` é obrigatório. `OPEN_FINANCE_PREVIEW_MODE=personal` seleciona o modo desta validação, sem escrever `public.users.active_mode`. `OPEN_FINANCE_OWNER_EMAIL` deve vir da configuração privada, nunca do código versionado.

As chaves novas `JWT_SECRET` e `OPEN_FINANCE_SYNC_CRON_SECRET` precisam ter pelo menos 32 caracteres e ser exclusivas da cópia. Supabase exige `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Polp usa `POLP_PRODUCTION_CLIENT_ID` e `POLP_PRODUCTION_CLIENT_SECRET`; a documentação confirma que as mesmas credenciais funcionam nas duas rotas, e que o ambiente é definido pelo caminho. A aplicação real usa exclusivamente `/api/v2`, sem `/sandbox`.

Manter as flags desativadas até a verificação correspondente. Depois do diagnóstico privado, `OPEN_FINANCE_ENABLED=true` e `OPEN_FINANCE_SYNC_ENABLED=true` foram aplicados somente na prévia. CONNECT=true foi aplicado após webhook/worker verificados, junto com o incremento 43b0c51 de preparação privada; WhatsApp continua desativado. O worker usa somente o secret próprio e o modo configurado, uma página por vez, com fila persistente, lease e limite no banco.

Para liberar um link bancário é necessário: origem HTTPS exata em `OPEN_FINANCE_APP_ORIGIN`, host de autenticação confirmado em `OPEN_FINANCE_AUTH_HOSTS`, webhook assinado da Polp com `POLP_WEBHOOK_SIGNING_SECRET` e heartbeat recente no modo escolhido. Somente com PREVIEW_ONLY=true e host ainda ausente, o primeiro pedido pode ser preparado pelo titular após o aceite: o servidor retém o link completo e retorna apenas o hostname. HTTPS, DNS, ausência de credenciais/porta inesperada e IP são verificados antes de extrair esse nome. Confirmar o host por fonte independente antes de configurá-lo. Com host já configurado, qualquer divergência falha. Refresh permite retomar o mesmo pedido após conferência, somente com identidade e estado local pendente relidos; não entrega links expirados ou de consentimentos cancelados. A falta de host continua bloqueando a preparação fora da prévia privada. Endpoint: `/api/webhook/open-finance`. O titular cria ou insere novas credenciais pela interface e realiza o aceite/autorização bancária pessoalmente. Não usar secrets fictícios para satisfazer o diagnóstico de prontidão.

## Banco aplicado

Aplicadas em Zelo Brasil, em ordem, as migrações `20261009193000`, `20261009213000`, `20261009220000`, `20261009230000` e `20261009234000`. As quatro operações finais foram aplicadas em uma transação única, com verificação prévia de ausência das funções/fila.

Verificado no servidor: nove tabelas, RLS forçado, funções sem EXECUTE para anon/authenticated, schema privado e nenhum acesso direto de service_role às tabelas. Uma única conta brasileira foi habilitada depois da autorização e confirmação do titular. Nenhuma tabela antiga de clientes foi modificada.

As funções públicas `zelo_of_*` são operações limitadas para o servidor; isso não torna o schema `open_finance` público. Cada operação deriva e filtra titular, modo e ambiente. Não conceder acesso ao schema para resolver erros de configuração.

## Verificação

Em 09/10/2026: build remoto com 141 páginas concluído e aplicação abriu em `/login`. O verificador HTTP acima passou no endereço implantado (acesso anônimo, escritas/webhooks/crons legados e login de origem inválida bloqueados). Após login do titular, área Bancos conectados foi exibida com ENABLED/SYNC=true. Polp GET /consents retornou 200 usando as credenciais do serviço; o corpo foi cancelado sem exibir dados. RPC de capabilities retornou private-sync-v4 e worker_recent=true. Endpoint público da prévia respondeu 400 a JSON inválido com HMAC válido e 401 ao mesmo corpo sem assinatura. O titular registrou webhook Celcoin com 18 eventos; secret copiado diretamente entre interfaces autorizadas, sem arquivo local. Essas verificações não equivalem a conexão bancária ou entrega real processada da Polp.

Atualização 43b0c51: build remoto concluído com sucesso; botão Conectar banco e introdução da jornada observados na sessão do titular. Verificador HTTP passou novamente. Aceite dos termos, primeiro pedido e autorização bancária aguardam ação pessoal do titular. Prova visual local sem dados bancários: `/private/tmp/zelo-conectar-banco-disponivel.png`.

1. Confirmar build e processo iniciado, sem timers/cron legados em instrumentation.
2. Executar `node scripts/check-open-finance-preview.mjs <origem>`: login acessível, leitura bancária anônima negada, escrita legada/webhooks antigos/crons negados, origem inválida recusada.
3. Entrar com a conta real do proprietário. Não criar nem alterar a conta/senha de produção. Confirmar que outra conta e sessões antigas não acessam a prévia.
4. Confirmar autenticação Polp em uma consulta limitada antes de criar consentimento. A preparação do primeiro pedido na prévia privada exige webhook/worker; o redirecionamento exige também host conferido por fonte independente. Fora da prévia, host ausente bloqueia a criação.
5. Titular autoriza um banco no Brasil; confirmar status no provedor, importação, limites/faturas/investimentos, ausência de dados sensíveis extras e ausência de duplicação manual.
6. Conferir pergunta mensal e limites usando dados persistidos, moedas separadas e aviso de cobertura parcial. Testar cancelamento e reconexão antes de liberação pública.

Nenhum dado faltante vira zero. Débitos de conta não conciliados e compras de cartão são mostrados separadamente. Reconexão ainda não foi implementada; não simular recriação criando um consentimento novo nem reativar um consentimento revogado por simples alteração de status.

## Auditoria de dependências em 09/10/2026

`npm audit`: zero críticos, cinco altos e dois moderados. Os altos vêm de braces → micromatch → fast-glob → plugin/config do ESLint, atingindo avaliação de padrões profundamente aninhados. Na prévia, padrões/caminhos de lint vêm do checkout controlado; não há entrada de clientes nesse caminho. Não executar lint com padrões de terceiros. A correção automática sugerida regride eslint-config-next para 14.2.35; não foi aplicada.

Os moderados vêm de UUID <11.1.1 via ExcelJS (bounds check quando buffer é fornecido a v3/v5/v6). A implementação instalada de ExcelJS em `lib/` usa somente `v4()` sem buffer em cf-rule-ext-xform. A prévia bloqueia importadores/escritas legadas; revisar novamente esses caminhos antes de liberação pública. Esta avaliação não equivale a atualizar as dependências. Reavaliar ambos em 10/10/2026 antes de mesclar ou liberar publicamente.

## Interrupção

Desativar primeiro as flags do serviço e parar somente a prévia. Preservar histórico recebido e consentimentos para auditoria. Não executar rollback de armazenamento ou apagar dados de produção para desfazer uma implantação. Revogar no provedor exige fluxo explícito do titular.

## Fontes

- https://polp.com.br/docs/celcoin/authentication
- https://polp.com.br/docs/celcoin/consents/create
- https://polp.com.br/docs/webhooks/signed
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-w5hq-g745-h8pq

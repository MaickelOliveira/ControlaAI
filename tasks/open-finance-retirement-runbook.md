# Encerramento de vínculos sem assinatura ativa

Aplicar `20261011090000_open_finance_connection_management.sql` e `20261011093000_open_finance_subscription_retirement.sql` antes de implantar o aplicativo.

O gatilho da tabela `users` coloca consentimentos de produção em cancelamento na transação que desativa o acesso. A migração também inclui clientes já inativos. O processo oficial faz uma operação por vez; repete falhas de 1 até 30 minutos e recupera operações interrompidas após a expiração de dois minutos do bloqueio. O pedido de encerramento permanece gravado após reativação da assinatura.

Verificar `open_finance.retirement_health.last_seen_at` (até três minutos), quantidade de conexões de produção em `revoking`, e `retirement_error_code`/`retirement_attempts`. Resultado `REVOKED` confirma o DELETE da Polp; `EXPIRED`/`REJECTED` só confirmam encerramento após uma consulta pontual ao mesmo consentimento e titular. Respostas incertas e registros não encontrados mantêm novas tentativas, sem afirmar sucesso. Uma falha persistente precisa ser tratada com o provedor; não arquivar nem apagar vínculos para esconder uma cobrança.

Sincronização e liberação pública podem ser pausadas sem parar cancelamentos. A prévia não processa encerramentos. `OPEN_FINANCE_RETIREMENT_ENABLED=false` pausa o processo como medida de contingência, mas mantém pedidos e dados. Não desativar `OPEN_FINANCE_ENABLED` nem remover credenciais enquanto houver cancelamentos a concluir.

Reversão: voltar a versão do aplicativo ou usar a pausa do processo. Não apagar as novas colunas, o gatilho ou registros privados. Consentimentos já cancelados no banco não podem ser restaurados pelo aplicativo: o titular precisa autorizar uma nova conexão. Histórico financeiro e de autorizações permanece íntegro.

A exclusão física pelo administrador é bloqueada para clientes que tenham conexões, mesmo já canceladas, para proteger histórico e a fila de encerramento. Usar Desativar. Uma solicitação específica de eliminação de dados precisa de um fluxo próprio de retenção e confirmação no provedor; não realizar uma exclusão em cascata como parte da gestão da assinatura.

Teste local: executar os runners `run-open-finance-connection-management.mjs` e `run-open-finance-retirement.mjs` passando o módulo local de PGlite. Esses testes criam dados exclusivamente em memória. Nunca usar desativação de cliente, cancelamento de banco real ou mensagens de WhatsApp como teste de implantação.

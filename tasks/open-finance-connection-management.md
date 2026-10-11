# Gestão das conexões bancárias

- Desconectar fica visível no card do banco e na linha da autorização, sem abrir detalhes. A confirmação informa que novas atualizações param e o histórico financeiro permanece.
- Remover tentativa fica disponível para conexões sem produtos recebidos, pendentes, rejeitadas, expiradas ou canceladas. Conexões inativas com dados recebidos oferecem Remover da lista, com as mesmas garantias de cancelamento e preservação do histórico. Uma conexão ativa nunca pode ser removida por essa ação.
- A remoção bloqueia importações sob o bloqueio da conexão, confirma o cancelamento no provedor e só então tira a tentativa da lista principal. Uma falha mantém a tentativa visível para nova tentativa.
- O registro permanece acessível em Histórico de conexões, com prazo, finalidade, categorias, status e data do cancelamento. Restaurar na lista desfaz somente o arquivamento, sem reconectar nem recuperar acesso bancário.
- Todas as operações exigem sessão do titular, origem válida e modo correto. A operação privada revalida status no banco, protegendo corridas com autorização/importação. Desconectar também fica disponível para autorizações rejeitadas ou expiradas que já importaram produtos.
- Verificar isolamento de titular/modo, falha do provedor, repetição, autorização concorrente, preservação dos dados e negação dos RPCs ao navegador. Nenhum banco real será desconectado só para testar os botões.

## Encerramento após desativação da assinatura

- Quando a regra atual da Zelo muda o cliente de ativo para inativo ou teste, todos os consentimentos de produção PF/PJ entram em cancelamento na mesma transação. Isso vale para webhooks de cobrança e desativação pelo administrador, sem mudar prazos ou regras de pagamento.
- O processo interno pede a revogação de cada consentimento na Polp, confirma o resultado e repete falhas com intervalo progressivo. Conexões já existentes de clientes inativos e cancelamentos manuais interrompidos também são tratados.
- O encerramento continua mesmo com sincronização ou novas conexões pausadas. A prévia não executa esse trabalho. A concessão no banco real permanece sendo uma ação do próprio titular.
- A recuperação do acesso à Zelo não restaura autorizações bancárias canceladas: o cliente deve autorizar novamente. Transações, contas, cartões, faturas e registros de autorização são preservados.
- Excluir fisicamente um cliente com conexões é bloqueado no banco e explicado no painel do administrador. Usar Desativar encerra o acesso e cancela vínculos sem apagar histórico nem perder a fila de recuperação.
- Cobranças de períodos anteriores não são estornadas por essa operação; não afirmar o encerramento no provedor quando a resposta for incerta.

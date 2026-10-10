# Dashboard financeiro integrado

Correção solicitada em 10/10/2026: reunir todas as origens no saldo principal e apresentar os gráficos financeiros na mesma área.

- O saldo do período usa o mesmo extrato e cálculo de receitas menos despesas do Financeiro, após os filtros. Conta, cartão, WhatsApp e plataforma participam do resultado.
- Posições atuais das contas não são somadas ao resultado das movimentações. Saldo disponível e crédito aparecem como gráficos informativos na mesma área; crédito não é dinheiro disponível.
- Retirar o bloco bancário separado e o segundo saldo manual do destaque. Preservar os filtros, ações, planejamento e modo pessoal/empresa.
- Não alterar APIs, armazenamento, credenciais, consentimentos ou o acesso exclusivo do proprietário ao Open Finance.

## Verificação

- 695 testes passaram; 15 testes legados permanecem ignorados. TypeScript e compilação de produção passaram. Lint sem erros, com três avisos existentes em arquivos fora desta mudança.
- Dois testes novos verificam a renderização do saldo com as quatro origens e um resultado negativo. Revisão independente aprovada, sem correções obrigatórias.
- Navegador com dados fictícios e componentes reais: um saldo principal, uma área de gráficos, busca alterando o saldo; tela de 390 × 844 sem rolagem horizontal.
- Nenhuma dependência, migração ou configuração de acesso alterada.

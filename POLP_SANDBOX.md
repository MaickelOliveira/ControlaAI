# Open Finance da Polp: teste isolado

Este branch implementa somente leitura no sandbox. O Zelo mantém as contas manuais e a conta Dinheiro, mesmo para quem nunca conectar banco. A interface de teste é `/admin/polp-sandbox`, acessível só a administradores quando `POLP_SANDBOX_ENABLED=true`.

Configure no servidor de teste, sem prefixo `NEXT_PUBLIC_`:

```text
POLP_SANDBOX_ENABLED=true
POLP_SANDBOX_CLIENT_ID=<chave de API da conta Polp>
POLP_SANDBOX_CLIENT_SECRET=<segredo de API da conta Polp>
POLP_SANDBOX_TEST_USER_ID=<UUID do usuário Zelo de teste, opcional>
```

O teste chama exclusivamente `/api/v2/sandbox` da Polp, salvo a lista pública `/api/v2/institutions`. Cria consentimento fictício para `ACCOUNT`, `CREDIT_CARD_ACCOUNT`, `CREDIT_OPERATIONS` e `INVESTMENTS`. Consulta todas as páginas de contas, transações, cartões, faturas, empréstimos, financiamentos e investimentos, incluindo movimentações dos investimentos. A tela mostra o status de recursos ainda indisponíveis. Se a paginação exceder o limite de segurança, informa erro, sem fingir que os dados estão completos.

A conferência compara as transações com o histórico do único usuário de teste configurado. Usa valor, data da compra, descrição e parcela para sinalizar possível repetição. Pagamento de fatura e transferência são separados das compras; nenhum lançamento é gravado pela integração. Os dados de uma pessoa real só podem ser conectados futuramente por consentimento explícito dela e pelo fluxo de autorização bancária, fora deste teste.

Para liberar a importação em produção, ainda serão necessários vínculo do consentimento ao usuário, autorização no banco, sincronização de webhooks, identidade persistida de cada transação da Polp com unicidade no banco por usuário/origem/ID, e conciliação revisável para compras feitas pela IA, fatura importada ou cartão. Cartões e contas manuais precisam continuar funcionando sem Open Finance. Não copie dados fictícios para o histórico real.

A importação existente de fatura agora repete a verificação de duplicados na confirmação; se a IA registrou a compra após a prévia, devolve HTTP 409 e pede uma nova conferência. Uma operação simultânea ainda exige, para garantia transacional completa, uma chave única no banco quando a importação Open Finance for implementada.

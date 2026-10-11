# Avisos financeiros com Open Finance

Pedido: todos os avisos financeiros existentes devem considerar os bancos autorizados, no mesmo modo e com as mesmas permissões do titular. A liberação brasileira, consultas, publicação e implantação oficiais já foram autorizadas.

## Capacidade e ordem

Uma agenda financeira compartilhada conecta sincronização, avisos de vencimento e resumos. Primeiro importar dados derivados; depois entregar avisos persistentes; por fim integrar consultas e verificar a implantação.

## Comportamento

- Faturas: vencimento recebido, valor informado e evidência de pagamentos. Ausência de pagamento no retorno não comprova inadimplência. Não somar faturas às compras realizadas ou ao total manual a pagar. Não criar lançamento ao notificar.
- Assinaturas: a API Celcoin v2 fornece previsões detectadas após três meses. Mostrar como cobrança prevista, com data e valor estimados. A previsão não é dívida nem pagamento realizado. Atualizações completas substituem previsões antigas; páginas incompletas não ficam visíveis.
- Parcelas: mostrar quantidade observada e restante estimado. A maior parcela observada não prova pagamento. A API não fornece próximo vencimento; nenhuma data será inventada. O vencimento da fatura fornece o aviso do cartão.
- Conta corrente: o extrato integra resultados/resumos. Um débito histórico não comprova agendamento futuro. Contas e recorrências confirmadas pelo cliente continuam usando os vencimentos cadastrados.
- Resumo diário/semanal e próximos pagamentos: usar resultado realizado unificado, mantendo previsões bancárias identificadas e fora dos totais de obrigações confirmadas. Não esconder movimentos por semelhança de valor/descrição.
- Aviso às 9h de Brasília para fatura/assinatura prevista no dia, somente com dados recentes e consentimento ativo. Não cobrar diariamente fatura antiga com situação desconhecida. Avisos registrados por ocorrência, titular, modo e telefone; resposta incerta do transporte não gera nova tentativa automática.
- Verificar vínculo atual do telefone, acesso ao modo, plano, usuário ativo e consentimento antes de enviar. Nunca enviar dados bancários a contatos de lembretes para terceiros. Conteúdo bancário fica fora do histórico enviado ao modelo de IA.

## Ajustes autorizados durante a execução

Conta, cartão e demais produtos do mesmo banco em um card, mantendo valores e identidades distintos. IA atende pedidos de fatura: a API documentada fornece JSON, sem arquivo PDF original ou linha digitável. Gerar demonstrativo identificado como Zelo, com dados recebidos, cobertura e sem afirmar que serve para pagamento. Se o pedido identificar vários cartões/faturas, solicitar escolha, nunca enviar documento de outra conta/modo.

## Limites

Sem dependências novas, produto pago, coleta de documento ou novas permissões bancárias. Sem testes de envio a clientes reais. SQL privado com RLS, operações apenas service_role e testes em PostgreSQL local; nenhum fixture em produção. Tarefas/agenda/drive continuam intactos.

## Estrutura, estilo e testes

Next 16/TypeScript, funções pequenas em src/lib, testes Vitest adjacentes, migração e runner SQL em supabase. Exemplo: `readFinancialAgenda(user, mode, range)` retorna compromissos, previsões e resultado; erros de armazenamento não viram zero.

Executar `npm test -- --run`, `npx tsc --noEmit`, `npm run lint`, `npm run build` e runners `supabase/tests/run-open-finance*.mjs` com PGlite local. Revisão independente antes de mesclar, CI, implantação e verificação na Zelo oficial.

## Fontes

https://polp.com.br/docs/celcoin/credit-cards/recurrings
https://polp.com.br/docs/celcoin/credit-cards/installments
https://polp.com.br/docs/celcoin/credit-cards/bills

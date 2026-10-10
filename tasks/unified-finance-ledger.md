# Extrato único e Dashboard com bancos

Pedido de 10/10/2026: juntar registros do WhatsApp/plataforma e movimentos da conta/cartão no Financeiro, identificando a origem. Incluir contas, crédito e gastos no Dashboard oficial, mantendo o Open Finance exclusivo do proprietário.

- O provedor e o painel oficial já contêm Pix da conta Inter PJ. O extrato separado fazia o painel principal parecer vazio. Não recriar consentimentos nem duplicar importações.
- Ler os registros existentes em public e open_finance, sem copiar movimentos bancários para public ou alterar lançamentos existentes. Preservar PF/PJ, edição, agendamentos e importação.
- Uma lista ordenada por data, filtros comuns e resumos em BRL. Pagamentos de fatura, transferências identificadas pelo provedor, investimentos e dados desconhecidos ficam visíveis com indicação de que não entram no resultado. Estornos do cartão reduzem despesas.
- IDs bancários repetidos não repetem na lista. Sem deduplicação destrutiva por valor/data: possíveis coincidências com registros manuais são sinalizadas para conferência.
- Histórico bancário paginado lido com limite explícito; nunca apresentar apenas a primeira página como extrato completo. Erros não viram valores zero.
- Dashboard: análises de receitas/gastos usam o extrato único. Saldo disponível das contas separado do resultado de lançamentos; limite de cartão não é dinheiro e linhas compartilhadas não são somadas. Moedas e valores não informados ficam identificados.
- Testar cálculo, fronteiras, paginação, moedas, acesso e gráfico. Revisar antes da publicação autorizada. Verificar versão oficial no navegador e acesso de outras contas bloqueado.

# Extrato único e Dashboard com bancos

Pedido de 10/10/2026: juntar registros do WhatsApp/plataforma e movimentos da conta/cartão no Financeiro, identificando a origem. Incluir contas, crédito e gastos no Dashboard oficial, mantendo o Open Finance exclusivo do proprietário.

- O provedor e o painel oficial já contêm movimentos da conta. O extrato separado fazia o painel principal parecer vazio. Não recriar consentimentos nem duplicar importações.
- Ler os registros existentes em public e open_finance, sem copiar movimentos bancários para public ou alterar lançamentos existentes. Preservar PF/PJ, edição, agendamentos e importação.
- Uma lista ordenada por data, filtros comuns e resumos em BRL. Pagamentos de fatura, transferências identificadas pelo provedor, investimentos e dados desconhecidos ficam visíveis com indicação de que não entram no resultado. Estornos do cartão reduzem despesas.
- IDs bancários repetidos não repetem na lista. Sem deduplicação destrutiva por valor/data: possíveis coincidências com registros manuais são sinalizadas para conferência.
- Histórico bancário paginado lido com limite explícito; nunca apresentar apenas a primeira página como extrato completo. Erros não viram valores zero.
- Dashboard: análises de receitas/gastos usam o extrato único. Saldo disponível das contas separado do resultado de lançamentos; limite de cartão não é dinheiro e linhas compartilhadas não são somadas. Moedas e valores não informados ficam identificados.
- Testar cálculo, fronteiras, paginação, moedas, acesso e gráfico. Revisar antes da publicação autorizada. Verificar versão oficial no navegador e acesso de outras contas bloqueado.

## Verificação em 10/10/2026

- 693 testes passaram; 15 testes legados permanecem ignorados. TypeScript, lint dos arquivos alterados e compilação de produção (138 páginas) passaram.
- Revisão independente: aprovado após correções de falhas de armazenamento, histórico concorrente, recuperação por filtros, precisão de moedas, estornos e disponibilidade de agendamentos durante falhas bancárias.
- Navegador local com componentes reais e dados fictícios: filtros alteram o resumo e os gráficos; origens aparecem na mesma lista; apenas registros manuais podem ser selecionados/editados; formulário de criação preservado.
- Falha 503 simulada: valores indisponíveis aparecem como “—”; agendamentos e suas ações continuam acessíveis; Dashboard mantém os filtros editáveis.
- Tela de 390 × 844: Dashboard, contas, crédito e Financeiro sem rolagem horizontal. Tamanho normal restaurado após a verificação.
- Nenhuma dependência, credencial, consentimento ou migração adicionada. Auditoria de dependências mantém 9 ocorrências anteriores (7 altas, 2 moderadas, nenhuma crítica), com tratamento separado em dependency-audit-followup.md.

# Categorias de movimentações bancárias

Correção de 10/10/2026: o extrato usava a origem (“Movimentações da conta”/“Cartão de crédito”) como categoria, impedindo os gráficos de combinar gastos bancários com registros da plataforma e do WhatsApp.

- Preservar origem, valores, datas e descrição bancária. Categoria não altera o cálculo nem reclassifica transferências excluídas como despesas.
- Prioridade: escolha do titular, categoria recebida da Polp, sugestão por descrição explícita, “Outros”. Nomes de pessoas, intermediários de pagamento e Pix genéricos recebem “Outros” quando não permitem identificar uma categoria específica. Nenhuma movimentação bancária fica sem categoria.
- Aproveitar source_category já armazenada, expondo apenas esse código no relatório privado. Taxonomia consultada em https://polp.com.br/docs/celcoin/categories.
- Persistir user_category separadamente em open_finance.movements. O upsert do provedor preserva esse campo. Permitir escolher categoria padrão/personalizada e restaurar a classificação automática.
- Alterações passam pela sessão, acesso brasileiro privado, Origin, UUID e lista de categorias do titular. Operação SQL restrita a service_role e à combinação de titular/modo/produção. Sem ampliar a liberação do Open Finance.
- Descrições são processadas localmente; nenhuma nova chamada ao provedor ou envio de dados bancários para IA.

## Verificação

- 717 testes passaram; 15 legados ignorados. TypeScript, lint sem erros (três avisos existentes) e compilação de produção passaram.
- 15 testes de categorias e sete testes da nova API cobrem agrupamento das quatro origens, escolhas, padrão Outros para casos ambíguos/dados ausentes, estornos, exclusões, acesso, origem, validação e falhas.
- Runner SQL real passou: categoria do provedor no relatório; usuário e modo isolados; ausência de permissão para authenticated; restaurar automática; escolha preservada durante o upsert real de sincronização.
- Revisão independente aprovada. Formulário verificado com dados fictícios em 390 × 844, sem rolagem horizontal; tamanho normal restaurado.
- Dependências inalteradas. Auditoria mantém nove avisos anteriores, registrados com tratamento separado em dependency-audit-followup.md.

## Padrão Outros — 10/10/2026

A pedido do titular, transações bancárias sem categoria específica recebem Outros automaticamente, tanto para despesas quanto para receitas. O extrato identifica essa classificação como automática e oferece Alterar categoria. Os gráficos combinam esses movimentos com Outros já usado na plataforma/WhatsApp. Categorias do provedor, descrições reconhecíveis e escolhas do titular têm prioridade; dados bancários, totais e exclusões continuam iguais. Nenhuma migração ou configuração de acesso foi alterada. Revisão independente aprovada, com 28 testes focados passando.

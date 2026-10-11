# Avisos e demonstrativos bancários: implantação e retorno

## Implantação

1. Aplicar apenas `supabase/migrations/20261011030000_open_finance_notifications.sql` em Zelo Brasil. A transação não habilita clientes, não altera public.finances e não enfileira produtos antes do worker atualizado. Os testes e seus fixtures são somente locais.
2. Implantar a main revisada no serviço oficial lp/controlaai, preservando chaves, origem e flags de acesso atuais. O worker prepara cartões autorizados atuais e novos, no máximo 20 por passagem, três produtos por cartão e atualização a cada 12 horas. As perguntas da IA consultam o banco salvo, sem varrer a API novamente.
3. Os avisos às 9h usam OPEN_FINANCE_PUBLIC_ENABLED, OPEN_FINANCE_WHATSAPP_ENABLED e o opt-out OPEN_FINANCE_NOTICES_ENABLED=false. Faturas e previsões aparecem separadas das obrigações confirmadas nos resumos, sem criar despesa. Pagamentos associados ao ciclo não comprovam quitação dessa fatura.
4. Conferir worker PF/PJ, RPCs novas apenas service_role, RLS nas tabelas privadas, esquema inalterado de lançamentos manuais e acesso negado sem sessão. Não gerar registros fictícios ou enviar teste WhatsApp a clientes reais.
5. Na conta autorizada: Contas agrupa produtos por banco. Finanças → pergunta de fatura retorna um download autenticado. O demonstrativo inclui somente dados recebidos, informa cobertura, não substitui o documento original do banco e não serve para pagamento.

## Retorno

Para interromper somente novos avisos, salvar OPEN_FINANCE_NOTICES_ENABLED=false e reimplantar o mesmo serviço. Consultas e funções atuais continuam disponíveis.

Para voltar toda a aplicação para a versão anterior 808d637, primeiro interromper o serviço/worker e aplicar `supabase/rollbacks/20261011030000_open_finance_notifications.sql`, depois implantar essa versão pelo painel. A operação pausa apenas os novos tipos de fila, sem apagar documentos, dados bancários, recibos ou finanças. As colunas adicionais e RPCs privadas podem permanecer: a versão anterior ignora os campos novos. Não desfazer a liberação brasileira ou alterar os secrets como parte deste retorno.

Para retomar depois de um retorno completo, restaurar a implementação de zelo_of_prepare_schedules desta migração, implantar a versão atual e reativar avisos conforme a autorização. A manutenção cria novas importações completas; recibos permanecem e impedem repetição da mesma ocorrência.

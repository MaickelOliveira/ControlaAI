# Fila: histórico de compras do Supermercado

Pedido em 11/10/2026: compras existentes não permitem ver, editar ou excluir. Executar depois das alterações em andamento.

- [x] Abrir detalhes da compra com mercado, data, itens, quantidades, preços e total.
- [x] Editar compra/itens, recalcular totais e manter histórico de preços correto.
- [x] Excluir mediante confirmação; tratar financeiro vinculado de forma explícita e preservar os demais dados.
- [x] Autorizar pelo titular/ID, nunca pelo nome. Não alterar compras reais em testes.
- [x] Validar histórico atual em leitura, fluxo completo com dados fictícios, celular e WhatsApp.
- [x] Compras do mercado devem aparecer em Finanças e ser encontradas com os filtros adequados. Diagnosticar lançamento ausente versus filtro incorreto; corrigir e reconciliar compras antigas sem duplicar despesas existentes.

Implementação: compra e despesa são salvas/editadas/excluídas na mesma transação; operação identificada impede repetição; finalizar lista consome somente os IDs originais. Testes locais com compras fictícias, isolamento no PostgreSQL, 969 testes da suíte e compilação passaram. Publicado na Zelo oficial (PR 54). Migração aplicada e três compras antigas reconciliadas de forma idempotente: despesas de R$ 517,90 vinculadas, itens preservados, quatro conexões bancárias e trinta vínculos de WhatsApp intactos.

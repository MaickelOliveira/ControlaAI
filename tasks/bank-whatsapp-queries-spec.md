# Consultas bancárias pelo WhatsApp

Objetivo: corrigir a resposta de gastos enviada para pedidos de empréstimos e atender consultas de crédito por banco, usando apenas os dados já recebidos na Zelo.

## Critérios

- Reconhecer linguagem comum, inclusive o prefixo Zelo/Rita: empréstimos, financiamentos, limite disponível/total/utilizado, saldos, investimentos e faturas. Manter as consultas existentes de gastos por período.
- Gastos por banco/mês usam só movimentos bancários do banco identificado; estabelecimento como mercado não pode ser confundido com Mercado Pago. Filtragem por final do cartão nos gastos não é suportada pelo DTO atual e não deve ser descartada.
- Filtrar banco e final de cartão quando mencionados. Sem filtro, listar cada banco autorizado no modo atual; uma empresa nunca inclui dados de outra. Não somar linhas de cartão, limites compartilhados, moedas distintas ou valores desconhecidos.
- Empréstimos: mostrar operação, saldo devedor, valor contratado, próxima parcela e total conhecido por banco/moeda; ausência de dados não significa dívida zero. Informar data de atualização, importação pendente e truncamento.
- Consultas ambíguas, filtros incompatíveis e pedidos históricos de posições bancárias recebem orientação, em vez de um resumo de gastos. Pagamentos, registros e outras mutações mantêm seus fluxos atuais.
- A mensagem primeiro vira um pedido estruturado (`kind`, banco, final do cartão, período), depois a Zelo resolve titular/telefone/modo/empresa, lê o armazenamento e calcula a resposta. Valores bancários não são enviados ao modelo para cálculo.
- Não chamar Polp nem modelo para calcular a resposta, não alterar vínculos, não enviar mensagens reais de teste.

## Execução e validação

1. Reproduzir as frases do cliente em testes Vitest e adicionar matriz de consultas/negações.
2. Separar interpretação e formatação das consultas da leitura autenticada existente; manter a integração antes do classificador geral.
3. Validar o handler completo com armazenamento/transporte fictícios, permissões de telefones e contexto de empresas.
4. Executar `npm run test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build` e `npm audit --json`; revisão independente, PR/CI e implantação oficial autorizada.

Código em `src/lib/bank-question-*`, orquestração em `open-finance-question.ts`/`open-finance-whatsapp.ts`, testes junto dos módulos. Sem dependências, credenciais ou migrações novas.

## Interpretação ampla e parcelamentos

O classificador agora tem `bank_query` com argumentos validados para os tipos abaixo. O parser direto continua atendendo perguntas conhecidas; outras formas de pedir chegam ao modelo. O modelo entrega filtros e a Zelo consulta o armazenamento autorizado, sem enviar posições bancárias ao modelo para cálculo.

| Tipo | Exemplos | Fonte da resposta |
|---|---|---|
| Saldos | Quanto tenho nos bancos? Qual meu saldo no Inter? | Posição atual das contas |
| Cartões | Quanto ainda posso comprar no Nubank? Qual meu limite usado/total? | Linhas de crédito, sem somar limites compartilhados |
| Empréstimos/financiamentos | Quanto devo de empréstimo em cada banco? Meus financiamentos | Operações, dívida e próxima parcela informadas |
| Investimentos | Como estão minhas aplicações? | Posição bruta/líquida informada |
| Faturas | Valor e vencimento das faturas; envio da fatura pelo fluxo existente | Ciclos de cartão recebidos |
| Parcelados/recorrentes | Quanto tenho de parcelados? Minhas parcelas no cartão | Cadastros manuais e observações dos bancos, sem inferir quitação |
| Movimentações | Extrato do Nubank; quanto entrou na conta ontem? | Histórico recebido por período; extrato inclui linhas fora dos totais |
| Estabelecimento | Quanto gastei no Amazonas? Quanto gastei com Zé Delivery este mês? | Extrato unificado de contas/cartões/WhatsApp/plataforma, com descrição, acentos e separadores normalizados |

- `bank_query` termina antes da conciliação de pagamentos. Todas as intenções de consulta ignoram essa conciliação: perguntar quanto pagou nunca confirma uma parcela.
- O modelo não controla titular, empresa, valores, endereços ou operações no provedor. Banco, final do cartão, fonte, categoria, palavra-chave e período são validados; filtros incompatíveis recebem orientação sem ampliar a consulta.
- Posição histórica não é substituída pela atual. O extrato não exclui transferências, moedas estrangeiras ou valores desconhecidos da visualização; só os cálculos usam movimentos elegíveis.
- Todas as saídas de `recurring_query`, inclusive palavra-chave e término, recebem o mesmo apêndice bancário privado. Parcelas observadas (inclusive 12/12) não comprovam pagamento. Moeda e vencimento ausentes permanecem desconhecidos; não se multiplica observações por valor para inventar saldo devedor ou término.
- Buscas de marcas conhecidas preservam o estabelecimento mesmo se o modelo escolher categoria ampla ou histórico de supermercado. A resposta mostra os movimentos encontrados; o total bancário por estabelecimento não depende da categoria automática estar correta.
- Respostas que contêm dados bancários continuam privadas e não alimentam o contexto enviado ao modelo. Erro de armazenamento não produz total zero. Sem novas chaves, tabelas, chamadas ao provedor ou logs de valores.

Validação desta ampliação: 1.122 testes passaram; 15 testes opcionais de serviços reais não foram executados. Revisão independente aprovada após corrigir filtros incompatíveis de parcelas e a visualização de transferências/moedas/valores desconhecidos no extrato. Auditoria de dependências permanece igual à versão anterior, sem alterações no lockfile; manutenção registrada em `tasks/dependency-audit-followup.md`.

Validação local: 1.079 testes passaram (15 testes opcionais de serviços reais seguem sem execução), tipos/lint/compilação concluídos. Revisão independente aprovada. Os exemplos de armazenamento/transporte são fictícios; nenhuma mensagem real foi enviada nos testes.

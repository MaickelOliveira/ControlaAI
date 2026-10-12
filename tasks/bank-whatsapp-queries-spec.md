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

Validação local: 1.079 testes passaram (15 testes opcionais de serviços reais seguem sem execução), tipos/lint/compilação concluídos. Revisão independente aprovada. Os exemplos de armazenamento/transporte são fictícios; nenhuma mensagem real foi enviada nos testes.

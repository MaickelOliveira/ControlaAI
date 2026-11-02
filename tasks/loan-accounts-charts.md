# Empréstimos e parcelas do veículo em Contas

Contratos bancários de empréstimo e financiamento ganham resumo visível e gráfico de saldo devedor em Contas, Finanças e no dashboard. Contas tem filtros separados para Empréstimos e financiamentos e Parcelas do veículo. A lista de contas do Financeiro inclui os contratos mesmo sem uma movimentação lançada.

Parcelas do veículo é uma categoria de despesa própria. A classificação usa a finalidade do produto ou a descrição explícita da parcela, sem depender do nome do banco. Crédito pessoal e consignado permanecem em Empréstimos. Juros e IOF continuam em Encargos bancários; seguro, IPVA e manutenção não são classificados como financiamento de veículo. Categorias manuais e exclusões prevalecem. Descrições sem evidência da finalidade não são adivinhadas.

Os saldos são somados com oito casas decimais, separados por categoria e moeda. Contratos sem saldo continuam visíveis com Não informado; contratos com saldo exatamente zero e conexões arquivadas ficam fora do novo resumo. O histórico original continua disponível nos detalhes dos bancos.

O resumo mostra valor contratado, próxima parcela informada e vencimento final. Vencimento final não é a data da próxima parcela. Posições contratuais independem do período do extrato e não são transformadas em despesas lançadas ou em obrigações com vencimento inventado. Nenhum dado bancário, migração, credencial ou webhook foi alterado.

Validação: 3.772 testes aprovados e 15 ignorados; tipos e lint aprovados, com dois avisos preexistentes. Testes cobrem financiamento de veículo em Sicredi, Banco do Brasil, Itaú, Santander e banco independente, além de categorias, moedas, dados ausentes, histórico, precisão e filtros por ID. Navegador com dados fictícios: 320, 390, 768 e 1440 pixels sem overflow; filtro de veículo exclui empréstimos pessoais e vice-versa. A prévia temporária foi removida.

A suíte de consultas de Delivery recebeu uma correção isolada para fixar a data em outubro de 2026: suas expectativas de mês passado eram setembro e falhavam quando executadas em novembro. Não houve mudança no comportamento de Delivery do produto.

Compilação de produção aprovada (147 páginas). A auditoria de dependências bloqueou a liberação por alertas existentes em glob, minimatch, node-forge, qs e uuid, incluindo a expiração das duas exceções restritas em 31/10/2026. Bibliotecas e exceções não foram alteradas por esta implementação. Não considerar a alteração publicada.

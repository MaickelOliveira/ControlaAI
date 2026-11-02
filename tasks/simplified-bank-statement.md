# Extrato bancário simplificado

- Contas mostra um mapa da Zelo ligada a cada instituição, com estado textual e cor verde/vermelha. Produtos, limites e saldos não ocupam mais essa tela.
- Autorizações e contas manuais continuam disponíveis em opções recolhidas de gerenciamento.
- O filtro de Finanças oferece uma opção por banco, incluindo seus cartões, contas e contratos. Identificadores de produtos permanecem compatíveis internamente.
- Removidos os blocos de saldos devedores de Contas, Finanças e Dashboard.
- Parcelas mensais de empréstimos aparecem como previsões no extrato e no gráfico circular de despesas, com categoria de veículo separada.
- Parcelas atuais só são projetadas no mês atual completo selecionado, uma vez por contrato. O vencimento final não é usado como vencimento da parcela. Não há projeção inventada em meses históricos/futuros ou intervalos parciais.
- Valores ausentes, outras moedas e contratos desconectados não geram despesa em reais. Previsões não alteram saldos realizados nem criam registros no banco de dados.
- Um pagamento bancário inequivocamente reconhecido por contrato ou por banco/categoria/valor único no mês entra uma vez no gráfico. Linhas reais do extrato são preservadas.
- Recorrências e parcelamentos bancários usam linhas compactas dentro do extrato. Previsões já representadas por uma linha identificada não recebem outra linha de resumo.

Validação: 3.785 testes passaram, 15 ignorados; tipos e compilação passaram. Lint sem erros, com dois avisos anteriores fora do escopo. Verificação de padrões de credenciais executada antes da publicação. Conferência visual em produção após a implantação.

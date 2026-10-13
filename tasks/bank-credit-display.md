# Crédito de cartão nas movimentações recentes

Quando o extrato contém crédito de cartão, o ledger representa sua contribuição
como despesa negativa: reduz as despesas sem aumentar receitas. O Dashboard usava
apenas type=expense na apresentação, exibindo vermelho, seta de saída e dois sinais
negativos. O Financeiro já considerava a direção recebida do banco.

As duas telas agora usam a mesma apresentação: direção bancária controla seta,
cor e sinal; o valor aparece em módulo com um único sinal. Crédito de cartão traz
“Crédito no cartão · não é receita”. Ajustes de Pix financiado continuam mostrando
apenas encargos confirmados. Registros manuais respeitam o sinal do valor.

Não modifica classificação, categorias, totais, sincronização, acesso, originais
ou armazenamento. Não une registros por valor/data nem interpreta uma descrição
como confirmação de pagamento. Faturas identificadas pelo provedor continuam
fora do resultado; créditos não identificados continuam seguindo a regra existente
de redução das despesas. A correspondência de pagamentos reais exige evidência.

A documentação oficial diferencia indicador de direção e tipo de transação:
https://polp.com.br/docs/celcoin/credit-cards/transactions

Validação: reprodução com componentes reais falhou com o antigo Dashboard exibindo
−-R$ para o crédito. Regressão cobre consistência das telas, manutenção de duas
compras de mesmo valor, estorno, pagamento de fatura excluído e cálculo sem receita
adicional; cobre também manual com sinais positivos/negativos, direção/moeda/valor
ausentes, USD e encargos de Pix. Todos os dados dos testes são fictícios.

# Pix feito com crédito do cartão

## Resultado e limites

Uma cobrança no cartão que financia um Pix já registrado na conta não pode contar o mesmo pagamento duas vezes. A confirmação do titular liga apenas os dois IDs escolhidos no mesmo proprietário, ambiente, modo e empresa. Valor, data, descrição, dívida, fatura e histórico recebidos do banco permanecem intactos.

O Pix continua como despesa pelo seu valor. A cobrança do cartão contribui ao resultado apenas com os juros/taxas expressamente confirmados. Empréstimo recebido, dinheiro gasto e pagamento da dívida são fatos diferentes; gastar dinheiro emprestado nunca reduz o saldo devedor. Nenhuma regra por nome, data ou semelhança de valores fará vínculos automáticos.

## Contrato

- Anotação privada e reversível, com IDs e valores/datas originais, confirmação e desfazimento. Não copiar registros nem alterar fatos bancários. Manter histórico até a exclusão da conta de origem, pela mesma retenção dos movimentos.
- RPC de confirmação aceita IDs e três valores em BRL: cobrança do cartão, Pix, encargos. Exige confirmação explícita, operação de crédito no cartão e débito PIX não excluído na conta, cobrança/Pix positivos, encargos não negativos e diferença exata, sempre em centavos inteiros. RPC de desfazimento só altera a anotação.
- Autorizar por sessão e acesso Open Finance; verificar a mesma empresa também no banco de dados. Bloquear reutilização de qualquer movimento em outro vínculo ativo, inclusive sob concorrência. Repetir a mesma confirmação não cria nova despesa.
- O relatório mantém os valores originais e inclui metadados do vínculo. Se o banco corrigir qualquer valor/data/tipo relevante, deixar o ajuste suspenso para conferência; não aplicar confirmação antiga a fatos novos.
- O extrato, gráficos, Dashboard e consultas financeiras pelo WhatsApp usam o mesmo resultado corrigido. Faturas e limites continuam usando os dados originais.
- Em Finanças: ação em operações de crédito elegíveis, escolha do Pix entre dados já recebidos do mesmo espaço, confirmação em linguagem simples com os valores, opção para desfazer. Sem nova consulta externa ou varredura em outros clientes.
- Pergunta: “Você pegou dinheiro do cartão, pelo Pix, para fazer esse pagamento?” Depois confirmar a cobrança e a diferença em juros/taxas. Nunca apresentar sugestão como fato confirmado.

## Validação

Testes de reprodução antes da lógica; 850,16 no cartão + 821,48 no Pix passam a totalizar 850,16 (821,48 + 28,68). Sem confirmação, não alterar total. Verificar outras compras, clientes, empresas, moedas, fatos corrigidos, concorrência, repetição, desfazimento, permissões e totais paginados. Revisão independente, compilação, navegador e verificação privada antes/depois da aplicação autorizada no par confirmado pelo titular.

## Verificação do ajuste financeiro em 12/10/2026

- Reprodução independente: total duplicado 1.671,64 antes; 850,16 após confirmação explícita, dados originais intactos. Desfazer restabelece o efeito original e preserva auditoria.
- PostgreSQL isolado: oito blocos aprovados, incluindo isolamento por titular/modo/empresa, permissões privadas, concorrência por ordem de locks e índices exclusivos, confirmação idempotente, valores/datas alterados, centavos exatos e totais paginados. Concorrência foi examinada no código, não simulada em duas sessões neste runner.
- Dois revisores independentes aprovaram após corrigir o valor mostrado ao abrir pelo Pix e exigir as datas da tela na confirmação sob lock.
- Navegador com dados fictícios: seleção e aceite explícitos, botão bloqueado antes de confirmar, valor correto pelos dois lados, tema claro/escuro e largura 390 sem rolagem horizontal. Mensagens locais de depuração causadas pela extensão cz-shortcut-listen e pela CSP do desenvolvimento; nenhuma proteção de produção foi enfraquecida. Prévia removida do código entregue.
- 1.357 testes passaram; 15 testes opcionais anteriores permanecem ignorados. Lint sem erros, com dois avisos anteriores; compilação de produção passou.
- Nenhuma dependência nova. Auditoria de produção mantém cinco avisos anteriores (três altos, dois moderados), sem alteração no lockfile; alcance e tratamento separados em dependency-audit-followup.md.

## Próxima entrega: pergunta pendente no WhatsApp

Pedido do titular: aguardar a janela de 24h abrir e só perguntar quando a conversa estiver ociosa, sem interromper mensagens/respostas ou outra confirmação. Usar uma fila privada, reserva por telefone e resposta correlacionada ao ID da pergunta; um “sim” de outro assunto não poderá mudar o ajuste. Fora da janela, manter pendente sem template. A entrega financeira desta alteração já funciona nas consultas pelo WhatsApp através do extrato unificado; o envio automático da pergunta requer esta próxima entrega.

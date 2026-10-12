# Pergunta de Pix do cartão sem interromper o cliente

Pedido de 12/10/2026: confirmar com linguagem leiga se um Pix foi feito com dinheiro do cartão; fora da janela de 24h manter pendente; não perguntar enquanto o cliente conversa, a IA responde, processa áudio/arquivo ou aguarda outra confirmação.

## Regras aceitas

- A pergunta é uma sugestão para conferência, nunca uma vinculação automática. Usar apenas operação de crédito explicitamente informada no cartão e um único possível Pix recebido no mesmo titular, modo, empresa e instituição. Nome/data servem só para escolher um candidato para perguntar. Ambiguidade, fatos ausentes ou outro candidato deixam a conferência na plataforma.
- Preparar candidatos recentes na sincronização já existente, sem novas chamadas ao provedor. Conferir todos os possíveis pagamentos no intervalo, não apenas uma página. Confirmados/rejeitados não geram a mesma pergunta de novo.
- Fila privada durável. Um aviso por titular/dia; confirmação restrita a telefone vinculado como Titular com acesso ao modo e à empresa atualmente escolhidos. Conta sem acesso, IA pausada, telefone revinculado, empresa arquivada ou outra ação pendente impedem o envio.
- Janela abre somente pela última mensagem recebida; mensagens da Zelo não a renovam. Exigir dois minutos sem atividade recebida ou enviada e nenhuma mensagem/áudio/arquivo em processamento. Instrumentar a atividade antes de baixar/transcrever mídia.
- Reservar por token com prazo, comparar token para concluir/cancelar, compartilhar a reserva com perguntas de recorrências. Revalidar imediatamente antes do envio. Se um novo atendimento começar durante a reserva, devolver à fila; atendimento do cliente nunca deve ser descartado.
- Não usar modelo/template fora da janela. Falha de transporte ambígua não recebe repetição automática. Valores da pergunta são privados e não seguem ao contexto do modelo.
- Pergunta mostra nome, data, instituição, valor do Pix, cobrança no cartão e diferença de juros/taxas. Botões “Sim, foi do cartão” e “Não, são diferentes” carregam o ID próprio da pergunta; “sim” de outro assunto não confirma nada. Outro comando continua pelo atendimento normal. O canal WABA ativo foi conferido sem acessar suas chaves.
- Ao confirmar, revalidar titular/telefone/modo/empresa e snapshots pelo mesmo RPC financeiro já revisado. Mudanças bancárias exigem conferência novamente. Rejeitar preserva os dados e o resultado anterior.

## Entregas pequenas

1. Atividade/reserva persistida de conversa e predicado de janela/ociosidade, incluindo início antes da mídia e perguntas de recorrências. Testes de disputa, encerramento por token, expiração, mídia lenta e atendimento preservado.
2. Fila de candidatos, envio correlacionado e confirmação pelo WhatsApp com dados do banco. Testes de escopo, unicidade fora da primeira página, janela fechada/aberta, conversa ativa, envio ambíguo, reinício e resposta de outro assunto.

Sem envio manual de mensagens reais nos testes. Habilitar o processamento apenas depois de validar as migrações privadas e a implantação da reserva de conversa.

## Validação e operação

Implementação em 12/10/2026: atividade antes do ACK/mídia, origem WABA e instante recebido, reserva de silêncio, fila privada e rotação de lotes de 20, conferência específica por botões. A cota por titular contempla todas as empresas. Repetir uma resposta não recria confirmação desfeita ou alterada pelo banco. Nenhuma anotação financeira é feita na preparação da pergunta.

- 1500 testes de aplicação passaram; 15 verificações opcionais já existentes permaneceram ignoradas. Build de produção concluiu. Lint: zero erros e duas advertências preexistentes.
- PostgreSQL isolado: 10 blocos de atividade e 11 de fila, incluindo aliases, nonce, silêncio após mídia, janela WABA, RLS/ACL, candidatos ambíguos além de uma página, empresas, cota diária, rotação, reinício, fatos alterados e replay após desfazer. Concorrência revisada com locks e tokens; o executor isolado não simula duas sessões reais.
- Transporte Meta verificado contra o exemplo oficial de botões de resposta; testes usam credenciais e mensagens fictícias. Sem envio manual para clientes.

Aplicar primeiro `20261012060000_whatsapp_quiet_activity.sql` e `20261012070000_credit_pix_questions.sql`; implantar o código e somente então definir `OPEN_FINANCE_CREDIT_PIX_QUESTIONS_ENABLED=true` no serviço oficial. A flag ausente mantém a fila desligada.

Rollback operacional: definir a flag como `false` e reiniciar o serviço; a fila, os fatos bancários e as confirmações anteriores são preservados. Não apagar tabelas de histórico. Reservas de atividade expiram; a liberação usa o nonce exato, sem limpar o processamento de outra mensagem.

A API só permite observar mensagens recebidas. A reserva é revalidada imediatamente antes do envio; os botões com ID próprio impedem que uma resposta sobre outro assunto confirme esta operação.

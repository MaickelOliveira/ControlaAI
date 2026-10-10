# Open Finance na Zelo oficial, exclusivo do proprietário

## Pedido em 10/10/2026

O titular autorizou Inter PJ e pediu um visual melhor, confirmação automática mesmo quando a autorização termina no celular e implantação na Zelo oficial para sua própria avaliação, com todas as funções existentes disponíveis. A autorização mais recente permite alterar a versão oficial para esse acesso individual; não autoriza liberação pública.

## Escopo e validação

1. Trazer apenas o módulo Open Finance para a versão atual de main. Não trazer o aplicativo sandbox, isolamento de menus, proxy privado, instrumentação ou mudanças no WhatsApp/importadores existentes.
2. Atualizar Contas/Financeiro consultando somente o armazenamento da Zelo. Sem sobreposição, sem requisições quando a aba está oculta, cancelamento na troca de modo e revalidação ao voltar à aba. Confirmação pelo provedor/worker, nunca pelo retorno do navegador.
3. Redesenhar os cartões e a lista de movimentos; preservar valores desconhecidos, moedas separadas, informação de cobertura e distinção de lançamentos manuais. Testar nomes legíveis, atualização automática e isolamento.
4. Revisar, executar testes/build e comparar as funções legadas com main. Preparar configuração de produção com PREVIEW_ONLY ausente, proprietário único e Brasil verificado. O worker/webhook privado existente pode continuar recebendo dados no mesmo armazenamento; não duplicar processos.
5. Publicar uma revisão dedicada e implantar somente após gates de segurança/configuração. Verificar painel completo e acesso exclusivo do proprietário no endereço oficial.

## Diagnóstico do Inter

O link inicialmente aberto e uma primeira renovação foram recusados com invalid_request_uri. Uma nova emissão em 10/10/2026 15:07:48 UTC, seguida de abertura imediata, redirecionou para a tela oficial do Inter com QR Code. O titular concluiu no aplicativo e a Zelo mostrou Autorizado e uma conta PJ com saldo. O prazo real do ticket bancário é mais curto que o prazo de uma hora informado pela Polp; a duração exata não foi confirmada. Não reutilizar URLs antigas nem tratar refresh como recriação. A renovação geral segura e a revogação real continuam sendo gates para uma liberação pública.

Sem CPF/CNPJ, tokens, URLs de autorização ou valores financeiros neste registro.

## Verificação do incremento

- 675 testes passaram; 15 testes legados ignorados. TypeScript e lint dos componentes alterados passaram.
- Compilação de produção com Next 16.3.8 passou, gerando 138 páginas. Falhas iniciais foram de acesso/resposta do Google Fonts; a compilação real com rede funcionou.
- Revisão independente: nenhum Critical. Conflito de paginação identificado e corrigido; revisão posterior sem achados obrigatórios.
- Prova no navegador com produtos e valores fictícios locais: cartões/limites/investimentos/crédito e Financeiro. Celular com 390 px sem transbordamento horizontal. Paginação com resposta atrasada: Atualizar lista bloqueado durante carregamento, preservação da página adicional e retomada automática com primeira página fresca.
- Arquivos legados de menus, autenticação, WhatsApp, instrumentação/crons, importadores e demais recursos não alterados. Contas e Financeiro recebem apenas import e um componente adicional.
- Serviço oficial ainda sem configuração Open Finance de produção. A ativação e as credenciais serão preparadas por interface segura e dependem da confirmação exigida para conceder esse acesso ao serviço oficial. Nada liberado a outros clientes.

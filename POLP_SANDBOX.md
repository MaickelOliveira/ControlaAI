# Open Finance da Polp: teste isolado

## Prévia privada do painel do cliente

A raiz do serviço separado mostra uma prévia navegável de Contas, Movimentações,
Cartões/Faturas, Investimentos, Empréstimos/Financiamentos, Conexões e Conferência.
Usa o mesmo código privado e sessão do sandbox; `/diagnostico` preserva o painel
anterior. Não foi adicionado nenhum link, permissão ou rota no aplicativo publicado.

Todos os dados são fictícios. A criação de conexão usa apenas a Polp sandbox e
uma identidade fictícia fixa. A tela de autorização é uma simulação explicitamente
identificada. Decisões de importar, ignorar e vincular vivem somente na memória
da tela e reiniciam no reload. Um lançamento fictício da IA é gerado a partir
de uma compra do teste para experimentar possíveis duplicados; nenhum dado real
de usuário é consultado. Os demais detalhes recebidos de cartões, faturas,
reservas, investimentos e crédito podem ser abertos individualmente.

**Regra do produto: Open Finance exclusivo para o Brasil.** A prévia é brasileira.
Na futura liberação, restringir tanto a interface quanto cada API à conta com
país de operação Brasil confirmado, além da autorização por usuário. Não inferir
país pelo idioma `locale`, prefixo do navegador ou IP. O modelo atual de usuário
tem idioma, mas ainda não possui um campo explícito de país; essa identificação
e os testes BR/fora-BR são requisitos antes de incorporar a função ao aplicativo.
Nenhuma disponibilidade é prometida para Portugal ou países de língua espanhola.

A IA ainda não consulta estes dados. A futura integração deverá consultar apenas
dados autorizados do usuário solicitante, usar os dados sincronizados conforme
a pergunta, informar pendências/data da posição e cobrir todos os produtos
disponíveis, sem enviar indiscriminadamente o histórico completo a um modelo.

## Instalação privada independente

Para testar sem publicar nada no Zelo atual, crie outro serviço no EasyPanel,
usando esta branch e `Dockerfile.sandbox`. O Dockerfile copia apenas o painel
Polp e suas bibliotecas: não inclui banco de clientes, cron, WhatsApp, pagamentos
ou rotas do aplicativo principal. Não copie volumes nem o ambiente de produção.
Mantenha uma réplica (o limite de tentativas de login é local ao processo).

Configure somente `POLP_SANDBOX_ENABLED=true`, `POLP_SANDBOX_CLIENT_ID`,
`POLP_SANDBOX_CLIENT_SECRET`, `SANDBOX_APP_URL` (endereço HTTPS do novo serviço)
e `SANDBOX_ACCESS_CODE` (32 bytes aleatórios em hexadecimal, privado).
O endereço exige o código de acesso, não é indexável e não é vinculado no painel
dos clientes. Sessões duram oito horas. Credenciais de produção no ambiente
fazem o acesso falhar de propósito. Não altere o serviço `controlaai`, seus
domínios, variáveis, branch ou implantação.

A instalação independente não compara com dados reais nem persiste lançamentos.
Não existe ainda conexão Open Finance no painel do cliente; autorização bancária,
sincronização e importação definitiva continuam fora desta prova de conceito.
Liberar para clientes exige validação posterior e autorização explícita do dono.

Validação real em 09/10/2026: credenciais aceitas, consentimento fictício
autorizado, 2 contas, 2 cartões, 100 transações de conta, 100 de cartão, 4 faturas,
2 saldos reservados, 1 empréstimo, 1 financiamento, 9 investimentos e 27
movimentações de investimento. Sem IDs repetidos nas duas listas de transações,
sem gravação no Zelo. Isto não comprova a futura unicidade transacional de importação.

Auditoria do lockfile em 09/10/2026: há alertas preexistentes em Next, Sharp,
source-map-js e ExcelJS/uuid. Para **esta imagem isolada**, os caminhos críticos
de geração de imagem `next/og` não existem; o otimizador de imagens fica
desativado (`images.unoptimized`); não há ingestão de SVG ou source maps externos;
ExcelJS não é importado nem incluído nas rotas. Não se usa Draft Mode, `use cache`
ou conteúdo privado em SSG/ISR. Por isso as rotas afetadas não são alcançáveis
neste serviço. Não é uma aprovação da segurança do aplicativo principal.
Revisar os patches em 16/10/2026 ou antes de ampliar o teste/liberar clientes,
o que acontecer primeiro. Nenhuma atualização de dependências de produção foi feita.

## Painel do branch completo

Este branch implementa somente leitura no sandbox. O Zelo mantém as contas manuais e a conta Dinheiro, mesmo para quem nunca conectar banco. A interface de teste é `/admin/polp-sandbox`, acessível só a administradores quando `POLP_SANDBOX_ENABLED=true`.

Configure no servidor de teste, sem prefixo `NEXT_PUBLIC_`:

```text
POLP_SANDBOX_ENABLED=true
POLP_SANDBOX_CLIENT_ID=<chave de API da conta Polp>
POLP_SANDBOX_CLIENT_SECRET=<segredo de API da conta Polp>
POLP_SANDBOX_TEST_USER_ID=<UUID do usuário Zelo de teste, opcional>
```

O teste chama exclusivamente `/api/v2/sandbox` da Polp, salvo a lista pública `/api/v2/institutions`. Cria consentimento fictício para `ACCOUNT`, `CREDIT_CARD_ACCOUNT`, `CREDIT_OPERATIONS` e `INVESTMENTS`. Consulta todas as páginas de contas, transações, cartões, faturas, empréstimos, financiamentos e investimentos, incluindo movimentações dos investimentos. A tela mostra o status de recursos ainda indisponíveis. Se a paginação exceder o limite de segurança, informa erro, sem fingir que os dados estão completos.

A conferência compara as transações com o histórico do único usuário de teste configurado. Usa valor, data da compra, descrição e parcela para sinalizar possível repetição. Pagamento de fatura e transferência são separados das compras; nenhum lançamento é gravado pela integração. Os dados de uma pessoa real só podem ser conectados futuramente por consentimento explícito dela e pelo fluxo de autorização bancária, fora deste teste.

Para liberar a importação em produção, ainda serão necessários vínculo do consentimento ao usuário, autorização no banco, sincronização de webhooks, identidade persistida de cada transação da Polp com unicidade no banco por usuário/origem/ID, e conciliação revisável para compras feitas pela IA, fatura importada ou cartão. Cartões e contas manuais precisam continuar funcionando sem Open Finance. Não copie dados fictícios para o histórico real.

A importação existente de fatura agora repete a verificação de duplicados na confirmação; se a IA registrou a compra após a prévia, devolve HTTP 409 e pede uma nova conferência. Uma operação simultânea ainda exige, para garantia transacional completa, uma chave única no banco quando a importação Open Finance for implementada.

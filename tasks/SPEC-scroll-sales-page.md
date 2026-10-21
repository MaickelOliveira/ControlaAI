# Página de vendas Zelo: produto, funções e equipe

O titular autorizou o redesenho com backup e depois pediu uma hero sem agentes, os agentes mais abaixo, explicações melhores de cada função e destaque explícito ao Open Finance. São revisões da direção visual anterior, mantida no histórico Git.

## Backups

- Original publicado: `../backups/zelo-pagina-2026-10-18-9367ec2/`, 1.063 arquivos verificados da revisão 9367ec2, HTML, captura e manifesto de hashes.
- Versão anterior da apresentação: `../backups/zelo-pre-hero-produto-2026-10-18-1187d85.zip`, incluindo página, componentes e os 12 retratos da revisão 1187d85.

## Contrato visual

Página brasileira `/`. Público: pessoas que querem organizar a vida e o negócio no WhatsApp. Ação: entender o produto, conhecer os recursos e escolher uma das ofertas brasileiras existentes.

Ordem: hero do produto → Open Finance → funções detalhadas → espaços pessoal/empresas → equipe virtual → planos → perguntas → compra. A hero não contém nomes nem imagens dos agentes. Ela usa um telefone em perspectiva, conversa de exemplo, visualizações financeiras e núcleo orbital WebGL. Três etapas reversíveis: mensagem digitada, aproximação da conversa e trajeto das informações, registro do gasto. A digitação, o zoom, o trajeto luminoso e a revelação do registro usam a mesma posição de rolagem; ao subir, todos recuam. O exemplo mostra R$ 85 em supermercado, no débito, no espaço Pessoal. A informação é ilustrativa e não cria um registro real. Preto profundo e dourado da marca; tipografia e exemplos legíveis em 1440x900 e 390x844.

## Conteúdo e comportamento

- Open Finance aparece na hero, menu, seção dedicada e FAQ. Explicar contas, saldos, transações, cartões/faturas/limites/parcelas, investimentos e operações de crédito. Mostrar o fluxo Contas → banco → permissões/autorização → dados no painel e WhatsApp. Fonte: OpenFinanceConnect, OpenFinanceEligibility, open-finance-access e open-finance-whatsapp. Contas brasileiras; PF/PJ por espaço; disponibilidade conforme conta, plano, liberação e instituição. Autenticação no banco, conexão Celcoin; não pedir senha. Não afirmar liberação universal sem verificar configuração. Campos não recebidos não são zero.
- Explicar finanças e agenda com pedido de exemplo e resultado. Cada um dos 12 cartões complementares traz objetivo, pedido, funcionamento e onde acompanhar. Incluir importação de PDF/foto/CSV/Excel, recorrências/parcelas, tarefas, lembretes, arquivos/Drive, metas, clientes, funcionários, mercado, veículos, contatos e pesquisa pública.
- Espaços: mostrar seleção do contexto e conexões Google por espaço; colaboração conforme acessos. Meet não implica gravação automática; resumos dependem do conteúdo enviado. NFS-e somente preparação de rascunhos até homologação.
- Equipe mais abaixo, após recursos e espaços: 13 cenas (12 agentes canônicos + conjunto final). Zoe, Rita, Lucas, Theo, Bia, Nina, Dora, Lia, Caio, Clara, Hugo e Otto. Nomes e funções de virtual-team.ts. Os 12 retratos exclusivos já existentes permanecem; prompts em tasks/zelo-team-images.json.
- Rolagem determina integralmente as duas apresentações, inclusive no retorno. Sem reprodução automática nem interceptação de wheel/touch. Atalhos por etapa/agente e acesso direto aos planos. Cenas inativas inertes. Explicações expansíveis usam details/summary nativos.
- Movimento reduzido/telas baixas: leitura estática e controles manuais. WebGL indisponível: núcleo CSS. Sem JavaScript: conteúdo, exemplos, details e compra acessíveis.
- Preservar ofertas, valores, UTMs/fbclid e atributos de conversão. Não mudar backend, traduções, banco, autenticação, autorizações bancárias ou CI. Não fazer compras, consultas financeiras privadas ou consentimentos reais na validação.

## Verificação

8 testes da geometria: 13 destinos dos agentes, 3 etapas do produto, reversão, limites, equipe canônica e hashes únicos dos retratos. Lint, tipos, build, segredos e CI. Inspecionar renderização 1440x900 e 390x844, largura 320px e paisagem. Confirmar ausência de agentes na hero e ordem do conteúdo; explicações abrem; dados fictícios identificados; teclado, foco e contraste; retorno correto nas duas apresentações. Salvar evidências locais e executar o verificador do skill frontend-design-direction. Produção permanece preservada enquanto a PR #200 está em avaliação.

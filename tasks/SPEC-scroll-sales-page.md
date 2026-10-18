# Apresentação Zelo com equipe virtual e rolagem reversível

O titular autorizou refazer a página e pediu backup antes de qualquer alteração. Backup verificado em `../backups/zelo-pagina-2026-10-18-9367ec2/`: 1.063 arquivos da revisão 9367ec2, HTML público e manifesto de hashes. Depois de avaliar a primeira versão, pediu uma direção visual mais forte, 3D real e retratos individuais sem repetição, usando os nomes e funções já existentes na plataforma.

## Contrato visual e de produto

Superfície: página brasileira `/`. Público: pessoas que querem organizar a vida e o negócio pelo WhatsApp. Ação principal: conhecer a equipe, ver planos e comprar nas ofertas brasileiras existentes da Hotmart. Hierarquia: promessa e núcleo orbital 3D; apresentação individual dos agentes; recursos e demonstrações; espaços; planos; perguntas e compra.

Direção: editorial tecnológica, preto profundo e dourado, retratos fotográficos fictícios com figurino e objetos por especialidade. Detalhe próprio: um núcleo orbital WebGL conectado a uma constelação de personagens reais do produto, seguido por cenas individuais. Referências locais: marca Zelo, `src/lib/virtual-team.ts`, funções implementadas e preços de `checkout-markets.ts`. Alvos visuais: 390x844 e 1440x900; verificar também 320px e paisagem.

## Critérios de aceitação

- 14 cenas: abertura, os 12 agentes canônicos e conjunto final. Nenhum nome ou função é inventado: Zoe, Rita, Lucas, Theo, Bia, Nina, Dora, Lia, Caio, Clara, Hugo e Otto.
- 12 imagens geradas em solicitações individuais, com rostos, cabelos, roupas e objetos diferentes. Cada arquivo deve ter hash diferente; revisão visual do conjunto também é necessária. Prompts em `tasks/zelo-team-images.json`.
- A posição da rolagem determina cena, transformação e núcleo 3D; ao subir, tudo volta ao mesmo estado. Sem reprodução automática nem interceptação de wheel/touch. Navegação direta por nomes e link para sair da apresentação.
- Desktop com composição editorial e retrato amplo. Celular com retrato acima da explicação, controles acessíveis sem esconder o conteúdo. Sem overflow horizontal da página.
- Redução de movimento e telas baixas apresentam todas as cenas estaticamente. Falha de WebGL usa núcleo CSS. Conteúdo e compra disponíveis antes da hidratação. Cenas inativas ficam ocultas e inertes.
- Os personagens são identificados como virtuais. Exemplos fictícios de conversa; nenhuma consulta a dados privados nem chamada real aos agentes. Emissão direta e PDF de NFS-e aguardam homologação. Agenda não implica gravação automática de reuniões.
- Preservar preços, ofertas, UTMs, fbclid e atributos de conversão. Não alterar aplicativo autenticado, traduções, banco, CI ou conexões dos usuários.

## Estados e verificação

Carga do 3D: núcleo CSS estável até o canvas ficar pronto. Erro/perda de contexto: mesmo núcleo de reserva, navegação continua. Sucesso: objeto real com materiais metálicos e rotação determinada pelo scroll. Redução de movimento: cenas estáticas com fotos. Estados vazio/parcial/permissão remotos não se aplicam: conteúdo estático, sem APIs privadas.

Testes de comportamento para os 14 destinos, reversão, geometria e identidade dos agentes; hashes únicos das imagens. Verificar tipos, lint, testes, build de produção, segredos e dependências. Inspecionar computador, celular, teclado, links e movimento reduzido. Evidências renderizadas devem ser salvas antes de entregar. A página pública original fica preservada; entregar revisão na PR existente #200 e prévia local para avaliação.

# Página de vendas Zelo com apresentação por rolagem

Proposta de seis cenas aprovada pelo titular em 18/10/2026. Backup anterior verificado em `../backups/zelo-pagina-2026-10-18-9367ec2/`: 1.063 arquivos, revisão 9367ec2, HTML público e manifesto de hashes.

## Objetivo e direção

Apresentar o produto brasileiro em seis cenas reversíveis: conversa, registro, finanças conectadas, espaços separados, rotina e visão completa. Preto/grafite, dourado e telas de produto claras; fontes e marca locais existentes. Ação principal: ver os planos e comprar no checkout brasileiro existente.

## Critérios

- Posição de rolagem determina integralmente o estado, inclusive ao subir, recarregar no meio, usar teclado ou redimensionar. Sem timers, reprodução automática ou bloqueio de wheel/touch.
- Seis cenas em um palco fixado temporariamente, seguido de conteúdo normal, recursos, planos e FAQ. Navegação direta por cenas e acesso aos planos.
- 390x844 e 1440x900 como alvos. Conteúdo sem overflow em 320px e paisagem. Redução de movimento usa apresentação estática legível; sem JavaScript, conteúdo e compra seguem acessíveis.
- Demonstrações fictícias e identificadas. Sem acesso a dados privados, chamadas a APIs ou mensagens reais. Recursos financeiros dependem dos dados disponibilizados pelas instituições; emissão NFS-e continua em preparação.
- Conteúdo inclui finanças/bancos/cartões/faturas/parcelas/recorrências; modos e empresas; clientes/equipe/contatos; Google Agenda/Meet; tarefas/lembretes/metas; Drive/documentos; supermercado e veículos; preparação fiscal.
- Preservar preços, ofertas Hotmart, UTMs/fbclid e atributos de conversão. Escopo: somente página brasileira `/`; traduções e aplicativo autenticado não mudam.

## Implementação e verificação

1. Testar modelo puro de progresso e reversibilidade (Vitest), implementar e verificar.
2. Construir palco e demonstrações em componentes próprios, com CSS Module.
3. Substituir página brasileira e atualizar catálogo/FAQ; reutilizar ícones, marca e helper de checkout.
4. Verificar tipos, lint, testes, build e segredos; inspecionar computador/celular, movimento reduzido, teclado, anchors e compra sem concluir pagamento. Revisar diff antes de enviar PR.

Comandos: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run security:secrets`, `npm run build`, `npm run dev -- --hostname 127.0.0.1 --port 3090`.

Arquivos: `src/app/page.tsx`; `src/components/landing/`; `src/lib/landing-story.ts` e teste vizinho. Sem dependência nova, mudança de banco, autenticação ou CI. Estados de dados remotos (carga, vazio, erro, parcial, permissão) não se aplicam à demonstração local; sucesso é visual e fictício. O estado estático cobre JS desativado e movimento reduzido.

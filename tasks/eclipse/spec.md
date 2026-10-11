# Zelo Eclipse

## Objetivo
Aplicar a referência Eclipse escolhida pelo cliente ao painel completo, com tema claro e escuro, preferência persistente e experiência responsiva. Navegação, formulários, filtros, ações financeiras e isolamento dos titulares permanecem funcionais. Interface pública de vendas permanece fora deste redesign do produto.

## Stack e estrutura
Next 16.3.8, React 19, Tailwind 4, TypeScript e Recharts. Telas em src/app/{dashboard,pt/dashboard,es/dashboard,admin}; componentes compartilhados em src/components. Sem novas dependências ou alterações de banco/API.

## Estilo
Tokens semânticos para superfícies, texto, bordas e ação dourada. Cards arredondados, navegação compacta, ícones lineares, hierarquia clara, estados vazios reais. Área financeira em carvão, azul para entradas e coral para saídas. Tema escuro deve cobrir formulários, tabelas, diálogos e gráficos sem inverter imagens.

## Critérios
- Seletor Claro/Escuro acessível, persistência local e sincronização entre abas; falha de armazenamento não impede o uso.
- Seletores Pessoal/Empresa e Claro/Escuro juntos no cabeçalho de todas as páginas cliente. Troca de modo confirma a gravação; páginas compartilhadas permanecem abertas, exclusivas retornam ao Dashboard da mesma variante de idioma.
- Dashboard reorganizado com números reais, filtros no topo, análise completa sempre visível e consultas à IA somente pelo WhatsApp, crédito sem somar limites compartilhados, planejamento e transações unificadas. Saldo disponível nunca é inventado a partir do resultado.
- Todas as páginas pessoais/empresa, variantes de idioma e admin usam o sistema visual. Cabeçalhos simples e ações preservadas.
- Desktop e celular sem corte de conteúdo; foco visível e movimento reduzido respeitados.
- Nenhuma credencial ou dado privado nos artefatos públicos.

## Verificação
npm test; npx tsc --noEmit; npm run lint; npm run build. Testes de preferência do tema e SSR dos componentes, verificação visual das rotas, formulários e persistência no navegador, revisão independente antes de publicar.

## Limites
Sempre preservar contratos/API/autorização e histórico. Não mudar banco ou dependências. Não enviar mensagens reais, conectar bancos nem modificar registros durante testes visuais. Publicação e implantação seguem a autorização existente da sessão para a Zelo oficial após validação.

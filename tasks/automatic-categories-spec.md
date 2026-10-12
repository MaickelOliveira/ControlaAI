# Categorias automáticas por estabelecimento

Corrigir sugestões automáticas que não correspondem à descrição da compra: Zé Delivery/delivery em Outros ou Lazer, Google em Moradia, Facebook/Meta em Lazer. Uma descrição reconhecível deve prevalecer sobre uma categoria genérica sugerida pelo banco/modelo.

- Compartilhar regras entre o extrato bancário e o registro interpretado pela IA. Normalizar acentos, espaços e separadores como `*`.
- Delivery/comida/mercado → Alimentação; Google Ads/FACEBK/Facebook Ads/Meta Ads → Marketing; Google Workspace/Cloud/One/Drive → Tecnologia; Google genérico → Serviços. Intermediários e marketplace não determinam a compra; sem evidência, manter a sugestão válida ou Outros.
- Revisar evidências de transporte, saúde, educação, lazer, vestuário, impostos, moradia e serviços para evitar colisões (Uber Eats antes de Uber, DARF antes de sugestão de aluguel etc.).
- Preservar categorias escolhidas manualmente, transferências excluídas, receitas e edições. Não modificar valores, datas, conta, titular, empresa ou identidade do autor.
- Categorias bancárias são resolvidas ao montar o extrato unificado: histórico recebido passa a usar a regra corrigida sem regravar movimentos, criar duplicidades ou consumir logs com atualizações em lote. Lançamentos manuais antigos não têm proveniência segura da categoria e não devem sofrer atualização em massa.
- A IA recebe a mensagem, normaliza tipo/modo/data e em seguida corrige a categoria inferida antes de salvar. Lotes são tratados item por item; itens desconhecidos nunca ficam sem categoria.

Verificação: testes da regra, do extrato e do classificador com respostas fictícias; suite completa, tipos/lint/build, revisão independente e implantação autorizada.

Resultado local: 1.168 testes passaram (15 opcionais de serviços reais não executados), lint sem erros e build concluído com verificação de tipos. Revisão independente aprovada após proteger categorias explícitas por item e em linhas separadas. Auditoria nativa permanece com os mesmos 10 achados preexistentes, já registrados na manutenção de dependências; lockfile inalterado.

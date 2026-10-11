# Fila: logos oficiais dos bancos

Pedido em 11/10/2026: em Contas, Finanças e Dashboard, exibir a logo do banco nas referências a contas, cartões, saldos e movimentações.

- [x] Resolver pelo identificador da instituição recebida do provedor; usar ativos oficiais/permitidos e preservar nome legível.
- [x] Alternativa neutra para instituição sem logo; sem inventar marcas nem juntar instituições por nome aproximado.
- [x] Aplicar à visão unificada, claro/escuro e celular; preservar valores/conexões.
# Complemento do pedido

Incluir as logos também na lista de escolha de instituições no fluxo Conectar banco (PF/PJ), ao lado dos nomes e mantendo busca, seleção e indicação de indisponibilidade.

Implementação revisada: catálogo público de 210 instituições da Polp, resolução pelo ID, carregamento sem credenciais/referrer e alternativa neutra; relatório preserva RLS e acrescenta somente institution_id.

Validação: 985 testes passaram, 15 verificações externas opcionais ignoradas; isolamento de empresas no PostgreSQL local, compilação de produção e revisão independente aprovados. Claro/escuro e 390px verificados com dados fictícios. Publicação e implantação seguem como etapa final.

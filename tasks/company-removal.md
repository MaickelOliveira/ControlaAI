# Fila: remover empresas

Pedido em 11/10/2026: botão para excluir a empresa além de renomear.

Decisão: exclusão recuperável (arquivamento), mantendo registros pelo mesmo ID. A ação exige confirmação do nome exato e mostra que os bancos serão desconectados. O seletor lista as arquivadas em uma seção separada para restaurar; restaurar nunca reativa consentimentos bancários.

Ao remover a última empresa, o titular volta ao Pessoal; esse modo e suas conexões continuam disponíveis. Empresa sem cadastros ativos mostra instrução para cadastrar/restaurar, sem reutilizar lançamentos de outra empresa. Seleções web arquivadas caem para uma empresa ativa do mesmo titular; participantes WhatsApp recebem orientação e pedidos pendentes da empresa arquivada são descartados. Operações futuras e avisos dessa empresa são bloqueados, mantendo o histórico intacto.

Pendências de conversa pessoais mantêm seu modo verificado e continuam funcionando mesmo sem empresa ativa; apenas pedidos empresariais da empresa arquivada são descartados. Guardas de escrita executam após a derivação da empresa e serializam com o arquivamento. Se houver disputa por locks, a escrita falha prontamente para uma nova tentativa, evitando deadlock com conexões bancárias já bloqueadas; mudanças restritas ao cancelamento permanecem permitidas.

A transação de arquivamento marca apenas vínculos de produção do ID removido como revoking. A fila existente pede cancelamento ao provedor e só registra revoked após confirmação; falhas continuam em tentativa. Não garantir fim da cobrança antes da confirmação do provedor.

- [x] Confirmação com nome/identificador exato; remover do seletor e bloquear novos lançamentos.
- [x] Encerrar vínculos bancários ativos desta empresa, preservando histórico e demais empresas.
- [x] Tratar empresa ativa e contexto de páginas/WhatsApp após remoção.
- [x] Isolamento por titular/ID; testar em dados fictícios.

Validação: 996 testes passaram (15 opcionais ignorados), checagem de tipos/lint e compilação concluíram. Runner SQL com RLS/arquivamento/rollback e teste real de duas sessões PostgreSQL 18.4 passaram; nenhum deadlock ou vínculo ativo órfão nas ordens verificadas. Confirmados nomes repetidos, bloqueio sem confirmação, restauração com histórico e formulários claro/escuro e 390px. Nenhuma empresa real foi arquivada nos testes.

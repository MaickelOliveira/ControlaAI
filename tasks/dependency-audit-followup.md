# Atualizar dependências com avisos de segurança

Responsável: manutenção da Zelo. Registrado em 10/10/2026; revisar até 17/10/2026. Este registro não agenda uma execução.

A auditoria do lockfile atual encontrou 9 ocorrências (7 altas, 2 moderadas, nenhuma crítica), já presentes antes da unificação financeira. Nenhuma dependência ou lockfile foi alterado por essa funcionalidade.

- A cadeia eslint-config-next → fast-glob → micromatch → braces afeta ferramentas de lint. A correção automática propõe regressão para Next 14; não aplicar esse downgrade ao projeto Next 16. Atualizar a cadeia em uma alteração própria, verificando lint e build.
- sharp: aviso sobre librsvg (GHSA-wq5f-xc86-pv6w). O novo painel usa SVG do Recharts no navegador e não envia imagens para processamento. A aplicação já usa next/image em outras telas; não considerar a ocorrência inofensiva. Validar a atualização para versão corrigida e revisar entradas aceitas pela otimização de imagens.
- source-map-js: negação de serviço em mapas indexados (GHSA-68fv-2mgg-jv7q). O novo endpoint recebe datas/modo e não aceita mapas de código. Atualizar o pacote e verificar o processamento de mapas na cadeia de compilação.
- exceljs → uuid: limites do buffer nos geradores v3/v5/v6 (GHSA-w5hq-g745-h8pq). Imports existentes exigem avaliação própria; o novo extrato não acrescenta importadores. A sugestão automática regride exceljs; avaliar versão corrigida sem perder compatibilidade.

Critério de conclusão: registrar changelog e alcance de cada correção; atualizar em mudanças pequenas; executar testes, lint, compilação e auditoria; conferir o lockfile. Os avisos existentes permanecem pendentes e não foram declarados corrigidos por este PR.

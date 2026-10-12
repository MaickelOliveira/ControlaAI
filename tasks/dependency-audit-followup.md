# Atualizar dependências com avisos de segurança

Responsável: manutenção da Zelo. Registrado em 10/10/2026; revisar até 17/10/2026. Este registro não agenda uma execução.

A auditoria do lockfile atual encontrou 9 ocorrências (7 altas, 2 moderadas, nenhuma crítica), já presentes antes da unificação financeira. Nenhuma dependência ou lockfile foi alterado por essa funcionalidade.

- A cadeia eslint-config-next → fast-glob → micromatch → braces afeta ferramentas de lint. A correção automática propõe regressão para Next 14; não aplicar esse downgrade ao projeto Next 16. Atualizar a cadeia em uma alteração própria, verificando lint e build.
- sharp: aviso sobre librsvg (GHSA-wq5f-xc86-pv6w). O novo painel usa SVG do Recharts no navegador e não envia imagens para processamento. A aplicação já usa next/image em outras telas; não considerar a ocorrência inofensiva. Validar a atualização para versão corrigida e revisar entradas aceitas pela otimização de imagens.
- source-map-js: negação de serviço em mapas indexados (GHSA-68fv-2mgg-jv7q). O novo endpoint recebe datas/modo e não aceita mapas de código. Atualizar o pacote e verificar o processamento de mapas na cadeia de compilação.
- exceljs → uuid: limites do buffer nos geradores v3/v5/v6 (GHSA-w5hq-g745-h8pq). Imports existentes exigem avaliação própria; o novo extrato não acrescenta importadores. A sugestão automática regride exceljs; avaliar versão corrigida sem perder compatibilidade.

Critério de conclusão: registrar changelog e alcance de cada correção; atualizar em mudanças pequenas; executar testes, lint, compilação e auditoria; conferir o lockfile. Os avisos existentes permanecem pendentes e não foram declarados corrigidos por este PR.

## Preparação fiscal em 11/10/2026

Acrescentado node-forge 1.4.0, versão exata, apenas no subprocesso de leitura PKCS#12 (com término forçado em 4 segundos e limite de duas validações concorrentes). A assinatura XML/validação de confiança do emissor ainda não está implementada. O aviso GHSA-86w9-cpqp-85rv afeta a verificação RSA PKCS#1 feita por forge; a aplicação não usa esse verificador. A correspondência da chave/certificado e a leitura X509 usam Node/OpenSSL. Não usar forge para estabelecer confiança ICP-Brasil. Não há correção publicada na auditoria realizada; revisar em 17/10/2026 antes de habilitar emissão real. O teste de certificado autogerado não prova credenciamento ou confiança fiscal. XML-crypto e xmldom foram retirados porque este incremento não assina nem transmite XML.

## Consultas bancárias pelo WhatsApp em 11/10/2026

Nova auditoria confirmou 10 ocorrências existentes (8 altas e 2 moderadas, nenhuma crítica), incluindo node-forge da preparação fiscal acima. Nenhuma dependência/lockfile foi alterada. A consulta nova apenas lê DTOs autenticados e formata texto, sem processamento de certificados, imagens, planilhas ou mapas de código. As pendências de manutenção e as restrições fiscais acima permanecem vigentes.


## Vistoria de segurança em 12/10/2026

Corrigidos sharp 0.35.4 → 0.35.5 e source-map-js 1.2.1 → 1.2.2 com atualização dentro das faixas existentes; nenhum downgrade ou override de versão principal. Instalação limpa com scripts bloqueados, testes e compilação verificados. Referências: [sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

A auditoria atual mantém 8 ocorrências (6 altas e 2 moderadas), correspondentes a três avisos raiz, com revisão obrigatória até 17/10/2026:

- GHSA-vfj7-8cjw-p6xm: braces e cadeia de lint (cinco ocorrências derivadas), apenas ferramentas de desenvolvimento; não recebe padrões enviados ao servidor. Não há versão corrigida compatível no relatório atual. Não regredir Next para remover o aviso.
- GHSA-86w9-cpqp-85rv: node-forge 1.4.0, verificador RSA afetado não usado; parser PKCS#12 isolado, limitado e sem emissão real habilitada. Não usar esse verificador para confiança fiscal. Sem correção publicada no relatório atual.
- GHSA-w5hq-g745-h8pq: uuid/exceljs (duas ocorrências), aplicação usa gerador v4; geradores v3/v5/v6 com buffer externo afetados não são utilizados. Não trocar uma dependência transitiva por versão principal incompatível.

CI bloqueia novos avisos moderados/altos/críticos, falha de consulta e exceções vencidas. Exceções não significam correção: seus limites de alcance e data estão registrados aqui. .npmrc bloqueia scripts de dependências, npm é fixado em 11.8.0 e o checkout CI não persiste credenciais. A análise de advisories não detecta todo pacote malicioso ou vulnerabilidade desconhecida.

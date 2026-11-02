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

## Reavaliação em 24/10/2026, São Paulo (25/10 UTC)

A CI da correção da hero parou porque o prazo anterior terminou na virada de data UTC. Auditoria nativa contra o lockfile confirmou três ocorrências: node-forge (alta), uuid e seu dependente exceljs (moderadas), sem crítica. A cadeia braces já não consta no relatório e sua exceção foi removida. Nenhuma dependência ou lockfile foi trocado.

- [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): o aviso ainda afeta a verificação de assinaturas RSA PKCS#1 v1.5 de forge até 1.4.0, sem versão corrigida publicada. A busca em src e scripts não encontrou chamada ao verificador RSA/verifyCertificateChain. scripts/nfse-certificate.cjs usa forge para decodificar PKCS#12 e converter chaves/certificados; createSecureContext, createPrivateKey e X509Certificate são de Node/OpenSSL. O subprocesso continua limitado a 4 segundos, 64 MiB, duas execuções e entradas de até 1 MB. Isso não valida uma cadeia ICP-Brasil nem habilita emissão fiscal. Revisar novamente se o uso de forge mudar.
- [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): os caminhos afetados são v3/v5/v6 com buffer externo. npm ls confirmou uuid 8.3.2 somente através de exceljs 4.4.0; as duas chamadas em node_modules/exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js usam v4 sem buffer. A aplicação não importa uuid diretamente. A sugestão automática regride exceljs para 3.4.0; não aplicar essa mudança incompatível para liberar uma correção visual.

As duas exceções existentes foram reavaliadas até 31/10/2026 UTC, com os mesmos limites de alcance. Alertas novos, críticos, desconhecidos, falha de consulta ou prazo vencido continuam bloqueando a CI. Os achados permanecem pendentes de correção das bibliotecas e não são declarados resolvidos. Evidências locais: auditoria npm, árvore npm ls e teste de src/lib/nfse-certificate.test.ts.

## Liberação de empréstimos — 02/11/2026

Atualizações corrigidas, sem downgrade de Next ou ExcelJS: node-forge 1.4.0 → 1.4.2; qs 6.16.0 → 6.17.1; glob 10.5.0 → 14.0.2 somente sob rimraf 5.0.10; minimatch 10.2.6 → 11.0.1 somente sob typescript-estree; uuid 8.3.2 → 11.1.1 somente sob ExcelJS. A nova versão de glob continua oferecendo glob/globSync, usados por rimraf; uuid 11.1.1 oferece require CommonJS e v4, usados por ExcelJS. Testes geram e reabrem uma planilha com barras condicionais e verificam remoção com glob exclusivamente em diretório temporário. Os testes de certificado PKCS#12 e importação de fatura também passaram.

Referências oficiais: [forge 1.4.2](https://github.com/digitalbazaar/forge/releases/tag/v1.4.2), [glob 14.0.2](https://github.com/isaacs/node-glob/releases/tag/v14.0.2), [uuid, aviso e versões corrigidas](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [uuid 11.1.1 com export CommonJS](https://raw.githubusercontent.com/uuidjs/uuid/v11.1.1/package.json). As exceções anteriores para forge e uuid foram removidas.

A auditoria agora informa zero ocorrências altas/críticas e 24 moderadas, todas da cadeia minimatch. O aviso [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) informa uma faixa ampla menor que 11.0.1, mas descreve especificamente firstPhasePreProcess com optimizationLevel >= 2. Comparação com os fontes oficiais [3.1.5](https://raw.githubusercontent.com/isaacs/minimatch/v3.1.5/minimatch.js) e [5.1.9](https://raw.githubusercontent.com/isaacs/minimatch/v5.1.9/minimatch.js) confirmou que esse pré-processador e a opção não existem nessas implementações. Avaliação local de aplicabilidade: esse caminho não é executável nos dois fontes legados exatos; não se afirma correção de todas as versões de minimatch nem ausência de outros riscos.

A revisão restrita vence em 09/11/2026 UTC e só aceita esse único aviso, severidade moderada, pacote minimatch, versões exatas 3.1.5/5.1.9 e SHA-256 dos fontes iguais aos upstream. Os hashes foram comparados diretamente com as duas URLs oficiais, além do lockfile/integridade npm:

- 3.1.5: `746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d`.
- 5.1.9: `1339bca8b70e33847860daa8fc3ccfa62487e143670da01a3b718d40d5fd424f`.

A checagem recusa versões modernas vulneráveis, outras versões, alteração de bytes, pacote ausente, caminho inválido, conjunto misto, agravamento da severidade, aviso novo, falha da consulta ou prazo vencido. Três testes Node dessas fronteiras executam antes de toda auditoria na CI. Não existe mais permissão genérica por ID de aviso para forge/uuid. Auditoria local passou com essa avaliação delimitada; as 24 ocorrências moderadas continuam explicitamente registradas como não corrigidas no relatório npm.

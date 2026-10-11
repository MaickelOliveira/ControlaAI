# NFS-e direta por empresa

Implementação autorizada do plano nfse-direct-integration.md.

1. Perfil fiscal e catálogo isolados por titular e empresa; página Notas fiscais no modo Empresa.
2. Rascunhos com snapshot fiscal, revisão explícita por hash, numeração DPS e idempotência atômica.
3. Certificado A1 criptografado por empresa; assinatura XML e TLS com certificado apenas para endereços oficiais fixos.
4. Emissor nacional v1.01 para serviços domésticos compatíveis. Municípios sem acesso ao emissor nacional ou operações especiais ficam bloqueados com motivo, sem simular emissão. Conectores municipais só serão declarados disponíveis após implementação e homologação.
5. Emissão em homologação primeiro; acesso à documentação Swagger foi recusado (403 sem certificado). Produção fica bloqueada até provar o contrato oficial e a homologação com certificado válido. Não emitir nota real nos testes.
6. WhatsApp: consultar serviços/notas, preparar rascunho com serviço cadastrado ou campos informados, coletar campos ausentes, revisar, confirmar emissão e enviar PDF oficial. Verificar vínculo/empresa antes de consultar/enviar.
7. Consulta/reconciliação por DPS após timeout: não reenviar POST incerto. PDF/XML privados; histórico e cancelamento com confirmação separada.

Fontes: documentação atual e XSD oficiais v1.01 de 09/02/2026 baixados de gov.br/nfse. APIs listadas oficialmente em /biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao. Nenhuma credencial fiscal de cliente fornecida nesta etapa.

## Incremento concluído: preparação (11/10/2026)

Perfil fiscal, catálogo e rascunhos privados por empresa; menu no modo Empresa; certificado A1 criptografado validado em subprocesso limitado e cancelável; preparação guiada pelo WhatsApp com Otto. Não há POST de emissão, número oficial, assinatura DPS ou PDF fiscal nesta etapa. A emissão permanece indisponível inclusive após upload do certificado até homologar o contrato oficial. O acesso Swagger de homologação apresentou 403 por falta de certificado. Não declarar este incremento como emissão concluída.

Verificação: migração em PostgreSQL local isolado (titulares e empresas de nomes iguais); limites JSON/multipart por fluxo; certificado inválido e custo excessivo; subprocesso dentro do build standalone com sua própria dependência; revisão independente; 945 testes da suíte passaram, 15 pulados; 19 testes focados foram reexecutados pela revisão independente. Build concluído. Conferência de cadastro, serviço, rascunho e troca de empresa no navegador com dados fictícios; largura 390 sem transbordamento; menu/logo mobile conferidos. Nenhuma nota enviada ao governo.

Orientação de certificado: MEI pode emitir serviços sem certificado pelo portal/app nacional; emissão automática pela API exige assinatura com certificado, inclusive MEI. A integração Zelo recebe A1 da própria empresa, verifica correspondência/validade e mantém a emissão bloqueada até homologação. Cadastro preliminar e rascunhos não são ativação fiscal. A orientação fica visível no painel e nas dúvidas pelo WhatsApp, sem interceptar registros de despesas com certificados.

Referência concorrente conferida em 11/10/2026: https://ajuda.meuassessor.com/pt-BR/articles/16733388-cadastrando-sua-empresa-para-emitir-notas — exige A1 no primeiro vínculo e em todo o emissor nacional; MEI segue nacional. Seguir esse requisito para ativação automática, sem copiar comunicação ou identidade do concorrente.

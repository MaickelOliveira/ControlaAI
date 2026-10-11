# Plano: Open Finance para clientes brasileiros

Pedido autorizado: disponibilizar bancos PF/PJ aos clientes no Brasil e ligar as consultas financeiras da Zelo aos dados conectados. Cada cliente autoriza seus próprios bancos; nenhuma conexão de terceiros será criada pelo operador.

## Responsabilidades e ordem

1. Elegibilidade: liberação pública explícita, confirmação de conta brasileira pelo titular, plano/modo existente e isolamento por usuário.
2. Sincronização: eventos assinados resolvem o titular no armazenamento, fila global justa e trabalhador com saúde verificada. Conexões revogadas não importam novos dados.
3. Consultas: painel e WhatsApp leem o mesmo extrato de conta/cartão/WhatsApp/plataforma, sem enviar movimentos bancários ao modelo ou consultar a Polp a cada pergunta.
4. Jornada: catálogo completo PF/PJ, autorização com URL fresca e cancelamento/retentativas. Nada fora do Brasil.
5. Revisão, testes, migração e implantação. Ativação pública é um passo separado, com configuração concreta revisada antes da confirmação de ampliação do acesso.

## Contratos e proteção

- Identidade sempre vem da sessão ou vínculo de telefone autorizado, nunca da pergunta/corpo/URL.
- Confirmação do país é declaração explícita do titular sobre a conta bancária brasileira, registrada com sua origem; idioma não comprova elegibilidade.
- Leitura financeira reaproveita createFinanceLedger/ledgerBalance e as categorias existentes. Limites não são saldo, faturas não são somadas às compras, períodos e páginas têm limites.
- Consultas por pessoa não atribuem movimentos bancários à pessoa que os registrou; filtro por telefone permanece restrito aos registros manuais.
- Falha na leitura completa não vira zero. Cobertura bancária, moedas e possíveis duplicidades permanecem identificadas.
- Liberação pública desligada por padrão; a prévia existente continua funcionando durante a preparação.

## Comandos de verificação

`npm test -- --run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, testes SQL com PGlite já instalado e auditoria nativa do lockfile. Sem dependências novas.

## Estrutura e estilo

Regras de acesso e consultas em src/lib; rotas em src/app/api; apresentação em src/components; testes vizinhos *.test.ts; SQL privado em supabase/migrations, com reversão e testes reais em supabase/tests. Usar helpers canônicos e retornos tipados.

## Critérios de conclusão

Cliente elegível no Brasil consegue iniciar PF/PJ conforme seu modo, autorizar no banco e ver atualização automática. Perguntas por período consideram o extrato unificado do próprio titular. Outros titulares, modo não autorizado e sessões administrativas não acessam seus dados. Nova funcionalidade verificada na versão oficial antes de declarar liberada.

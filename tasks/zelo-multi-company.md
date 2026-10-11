# Várias empresas na mesma conta

Autorização: pedido explícito do titular em 11/10/2026 para implementar em Empresa, em todas as abas e também na IA do WhatsApp. Emissão NFS-e fica na fila, não ativa nesta mudança.

## Objetivo e critérios
- Empresas pertencem ao titular autenticado. Não criam usuários de cobrança nem alteram plano/WhatsApp/Google/bancos já autorizados.
- A primeira empresa recebe os registros empresariais existentes, preservando IDs e histórico. Novas empresas começam vazias.
- Seletor ao lado de Pessoal/Empresa em todas as páginas do modo Empresa, com criação e troca. Troca recarrega os dados da página e limpa ações/modal anteriores.
- Dashboard, finanças, contas/cartões/faturas, tarefas, metas, veículos, lembretes, agenda/reuniões, arquivos/pastas, recorrências, funcionários, clientes e Open Finance são escopados por empresa.
- Contatos/supermercado pessoais permanecem no modo pessoal. Perfil, plano, configuração geral do WhatsApp e vínculo de cada pessoa pertencem à conta.
- Operações por ID não permitem ler, atualizar ou apagar registro de outra empresa, nem com ID forjado.
- FKs entre registros (conta↔lançamento, funcionário↔pagamento, pasta↔arquivo, recorrência↔lançamento) exigem a mesma empresa.
- Banco PJ tem empresa definida na conexão; webhook e sincronização mantêm essa empresa. Não replicar um consentimento bancário em vários dashboards.
- No WhatsApp, empresa ativa é própria de cada número, sem interferir no painel ou nos familiares. Escolha/listagem/troca pelo nome, persistida e validada. Ao haver ambiguidade, perguntar antes de registrar ou consultar. Ações pendentes continuam na empresa de origem ou são canceladas na troca.
- Avisos e rotinas usam empresa do registro, sem misturar saldo/despesas ou duplicar mensagens.

## Implementação e validação
Next.js 16, TypeScript, Supabase/Postgres, Vitest. Código src/lib, src/components, src/app/api; migrações supabase/migrations. Comandos: npm test; npx tsc --noEmit; npm run lint; npm run build.

Ordem: modelo/migração e provas de isolamento → repositórios e APIs → seletor → WhatsApp e ações pendentes → bancos/cron → validação real isolada → revisão → ativação oficial.

Manter recursos incompletos ocultos até todas as rotas estarem isoladas. Migração aditiva, sem apagar histórico. Não editar credenciais nem publicar informações pessoais. Testar dois titulares, duas empresas do mesmo titular e modo pessoal com dados distintos; CRUD, chamadas por ID, gráficos e mensagens concorrentes.

## Fila
- [ ] Implementar modelo empresarial e isolamento em todas as funções.
- [ ] Seletor compartilhado e gestão das empresas.
- [ ] Empresa ativa por participante no WhatsApp e continuidade segura.
- [ ] Open Finance e avisos por empresa.
- [ ] Revisão, migração, implantação e verificação.

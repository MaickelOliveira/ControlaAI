# Open Finance: critérios de entrega

## 1. Acesso privado e diagnóstico
- [ ] API deriva usuário da sessão válida, limita prévia ao proprietário e exige Brasil verificado.
- [ ] Ausência de flag, credenciais ou permissão mantém a função oculta, sem consulta bancária.
- [ ] Diagnóstico diferencia estrutura preparada, infraestrutura e funcionalidades completas.
Verificar: testes focados de autorização e diagnóstico; TypeScript/lint; chamada anônima 401/404.

## 2. Conectar e gerenciar
- [ ] Jornada Celcoin completa dentro de Contas; instituições operacionais e busca pela organização.
- [ ] Consentimento vinculado à sessão/mode antes de usar dados; não há tomada de consentimento de outro usuário.
- [ ] Retorno não confia em status do navegador; revogação conserva histórico.
Verificar: testes de CSRF, documentos, vínculo e URL; titular valida autorização no banco.
Dependência: 1.

## 3. Sincronizar e persistir
- [ ] Todos os produtos disponíveis são tratados com validação e unicidade.
- [ ] Falha/página parcial preserva cobertura incompleta; reentregas não duplicam dados nem reativam revogados.
- [ ] Webhooks autenticados atualizam apenas a janela/recurso conhecidos e não confirmam perda de trabalho.
Verificar: banco descartável e fixtures dos formatos reais; falhas de paginação, moeda, concorrência e revogação.
Dependência: 2.

## 4. Painel existente
- [ ] Contas mostra bancos, saldos, cartões, limites, investimentos e crédito.
- [ ] Financeiro mostra faturas/movimentos com origem e conciliação sem somar duplicados.
- [ ] Prévia invisível para outras contas e países; funções manuais atuais preservadas.
Verificar: navegador no desktop/móvel, dados faltantes e troca de modo.
Dependência: 3.

## 5. IA
- [ ] Consultas limitadas à pessoa/mode/período; saldos/limites não derivados de gastos.
- [ ] Totais por moeda, exclusão de transferências/pagamentos de fatura e conciliação consistente.
- [ ] Resposta informa cobertura parcial/data e não expõe payload de outro usuário.
Verificar: perguntas de gasto mensal, limites, investimentos e falta de dados.
Dependência: 3 e 4.

## 6. Liberação
- [ ] Testes, lint, TypeScript, build e revisão independente aprovados.
- [ ] Permissões/configuração revisadas e prévia real validada pelo proprietário.
- [ ] Produção Polp, retorno, webhooks, reconexão/revogação e dados reais comprovados.
- [ ] Usuário autoriza liberação pública após validar o resultado.
Dependência: todas as anteriores. Não marcar como pronto por causa da data de lançamento.

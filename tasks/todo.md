# Open Finance Brasil

- [x] Elegibilidade brasileira por titular e gate público seguro. Verificar testes de acesso e SQL; arquivos de acesso, rota, componente e migração.
- [x] Webhook e trabalhador para vários titulares/modos. Verificar assinatura, roteamento único, fila, cancelamento e saúde com testes SQL/rotas.
- [x] Consultas do painel pelo extrato unificado. Verificar totais, estornos, categorias, período, moedas, páginas e falhas.
- [x] Consultas do WhatsApp pelo extrato unificado e informações bancárias, respeitando vínculo/modo. Verificar perguntas e isolamento no handler.
- [x] Jornada completa de autorização, retentativas e cancelamento para catálogo PF/PJ. Verificar contratos do provedor e interface.
- [ ] Revisão independente, testes completos, compilação, auditoria, publicação, migração e implantação.
- [ ] Ativação pública após confirmação no momento de ampliar o acesso; verificação oficial sem conectar bancos de terceiros.

Validação local em 10/10/2026: 746 testes aprovados, 15 ignorados preexistentes; TypeScript, lint (três avisos preexistentes) e build aprovados. Cinco runners SQL reais locais aprovados. Revisão independente aprovada depois das correções de entrega, fila, filtros, análise e leitura completa. A autorização real de referência é Inter PJ; outros bancos/produtos não foram todos testados individualmente. Auditoria confirmou os mesmos nove avisos já registrados, nenhuma dependência alterada.

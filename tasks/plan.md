# Plano: Open Finance Brasil integrado à Zelo

## Objetivo
Preparar a integração real e validar com o proprietário antes da liberação pública prevista para 10/10/2026 pela manhã. A data pretendida não substitui os critérios de funcionamento. Usar as abas Contas e Financeiro atuais; investimentos ficam em Contas. Sem outro item de navegação. Produção permanece no estado atual até a revisão concreta da implantação.

## Estado confirmado
- Prévia independente: funcional, mas fictícia, sem persistência ou IA real.
- Supabase Zelo Brasil: oito tabelas privadas vazias, RLS forçado, acesso da aplicação bloqueado.
- Polp: assinatura Starter ativa, pagamento confirmado; proprietário informou aprovação para produção.
- Autenticação Zelo: sessão própria, não Supabase Auth. Perfil não possui país explícito.
- Conta do proprietário informada pelo usuário nesta conversa; identificá-la no servidor, sem colocar identificadores pessoais no código.

## Decisões
- Desativado por padrão; prévia limitada à conta do proprietário e à elegibilidade brasileira verificada. Idioma não é país.
- Servidor autentica a sessão em cada ação e deriva usuário e modo; IDs fornecidos pelo navegador nunca autorizam acesso.
- Schema Open Finance permanece privado. Acesso do servidor por funções com operação limitada, filtros de usuário/ambiente/modo e search_path fixo; nunca grants públicos gerais.
- Credenciais Polp ficam no servidor. CPF/CNPJ são enviados somente após a ação explícita do titular, não armazenados em payloads, logs ou respostas. Nunca pedir senha do banco.
- Dados reais e sandbox separados. Sandbox existente não muda para produção por troca de URL.
- Paginação e gravação transacional idempotente; cobertura parcial nunca vira total completo. Webhook autentica origem, resolve recurso local, processa janela validada e retorna falha em vez de confirmar trabalho perdido.
- Movimentações do banco ficam separadas de lançamentos manuais até conciliação; nenhuma duplicação automática em public.finances.
- IA recebe totais determinísticos e estado de cobertura, sem fazer varredura indiscriminada na API.
- Consentimentos exigem jornada e textos do Manual do Conector Polp/Celcoin, finalidade, categorias, prazo, retorno e revogação pelo usuário.

## Ordem
1. Acesso privado e diagnóstico de prontidão: testes de sessão, proprietário, Brasil, flags e acesso do servidor.
2. Conexão e gestão de consentimento: seleção de bancos, confirmação, retorno e revogação.
3. Importação idempotente e sincronização: recursos, limites, faturas, movimentos, investimentos e crédito.
4. Contas e Financeiro: dados persistidos, estado de sincronização e conciliação sem alterar totais antigos.
5. IA: consultas delimitadas, totais por moeda, datas e cobertura.
6. Validação completa, revisão independente e implantação da prévia para o proprietário; autorização bancária real feita pelo titular.

## Bloqueios externos e verificação final
- Mudanças de permissões no Supabase e configuração de credenciais exigem revisão do resultado concreto antes de executar pela interface.
- Titular realiza aceite dos termos e autorização bancária. Não aceitar em nome dele.
- Conta Starter pode ignorar redirectUrl por consentimento; confirmar URL de retorno global, sem prometer recurso Pro/Ultra.
- Verificar exigências cadastrais e homologação da jornada no provedor.
- Liberação pública somente com autorização real testada, atualização/revogação comprovadas, país/permissões validados e todas as etapas implementadas.

## Fontes
- https://polp.com.br/docs/celcoin/consents/create
- https://polp.com.br/docs/celcoin/authentication
- https://polp.com.br/docs/celcoin/termos
- https://polp.com.br/docs/celcoin/webhooks

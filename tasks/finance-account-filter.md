# Contas, receitas e consultas por categoria

- Filtrar o extrato por identidade de conta manual ou produto bancário, sem juntar nomes iguais; manter Pessoal/Empresa e empresa selecionada.
- Exibir receitas e despesas por categoria com o mesmo período e filtros, sem incluir pendências ou valores desconhecidos no realizado.
- Preservar o ID interno do produto na resposta privada do relatório; manter o papel do RPC e as políticas de empresa. Sem novas chamadas ao provedor.
- Detalhar lançamentos ao pedir o conteúdo de uma categoria, preservando período, tipo e modo; perguntas educativas e ações mantêm suas intenções.
- Mostrar a maior categoria antes da origem dos gastos; organizar previsões bancárias em blocos e não inventar a moeda das parcelas.
- Classificar recebimentos de serviços/estética quando identificados, preservando escolhas manuais, reembolsos, salário e transferências.

Validação: regressões unitárias/integradas e runner SQL com duas empresas, outro titular, função scoped, headers e paginação. Migração 20261012020000 e rollback mantêm os registros e a mesma autorização.

import type { AgentScene } from "./landing-story";

type Action = { title:string; how:string; request:string; result:string };
// Public product explanations, checked against ai-processor and message-handler.
export const AGENT_ACTIONS: Record<AgentScene["key"], Action[]> = {
  drive: [
    {title:"Guardar o arquivo que chegou",how:"Envie um PDF, foto ou documento pelo WhatsApp e diga que deseja guardar. A Dora analisa o conteúdo para sugerir nome, palavras-chave e pasta.",request:"Guarde este comprovante no Drive.",result:"O arquivo fica disponível no Drive do painel, com os dados usados para encontrá-lo depois."},
    {title:"Organizar sem uma pilha de anexos",how:"O Drive reúne pastas como Documentos, Comprovantes, Contratos, Fotos e Outros. No painel, você pode criar pastas e ajustar a organização.",request:"Guarde este contrato para eu consultar depois.",result:"Uma biblioteca de arquivos organizada por pastas, acessível pelo painel."},
    {title:"Encontrar e receber na conversa",how:"Descreva o assunto, o nome ou algo que lembra do arquivo. A busca considera o nome, a descrição e as palavras-chave disponíveis.",request:"Dora, me mande o comprovante do mecânico.",result:"Quando encontra, o Zelo devolve o próprio arquivo no WhatsApp. Se não encontrar, informa isso na conversa."},
    {title:"Dar um nome que faça sentido",how:"Logo após salvar, peça para renomear ou descrever o arquivo recente. A Dora usa o novo nome para facilitar a próxima busca.",request:"Renomeie o último arquivo para contrato assinado do fornecedor.",result:"Nome e descrição atualizados no Drive. Você também pode revisar os arquivos pelo painel."},
  ],
  finance: [
    {title:"Registrar receitas e despesas",how:"Conte o que entrou ou saiu, o valor, a conta, a data e o espaço. Complete os detalhes solicitados na conversa.",request:"Rita, gastei R$ 85 no mercado, no débito.",result:"Um lançamento com categoria e contexto, disponível no financeiro."},
    {title:"Entender os valores do período",how:"Peça um saldo, gastos por categoria, detalhes de um lançamento ou uma análise do período.",request:"Quanto gastei com supermercado neste mês?",result:"Informações dos registros disponíveis para você conferir e entender seu mês."},
    {title:"Importar faturas e planilhas",how:"Envie PDF, foto, CSV ou Excel e confira os lançamentos identificados antes de confirmar.",request:"Importe esta fatura para o cartão da empresa.",result:"Valores, datas e possíveis duplicidades prontos para sua revisão."},
    {title:"Acompanhar parcelas e recorrências",how:"Organize compras parceladas e pagamentos que se repetem. Consulte previsões, ajuste ou cancele recorrências quando necessário.",request:"Quais parcelas ainda tenho para pagar?",result:"Uma visão dos compromissos que continuam nos próximos meses."},
    {title:"Consultar bancos conectados",how:"Com o Open Finance disponível e autorizado, consulte os dados recebidos de contas, cartões, investimentos e crédito.",request:"Qual é o saldo da minha conta conectada?",result:"Dados compartilhados pela instituição; disponibilidade e atualização dependem da conexão."},
  ],
  agenda: [
    {title:"Marcar um compromisso",how:"Informe assunto, data, horário e contexto. Conecte a conta Google ao espaço escolhido para usar a integração.",request:"Lucas, marque a reunião da equipe terça às 10h.",result:"O compromisso pode ser acompanhado no calendário do espaço."},
    {title:"Reagendar e concluir",how:"Encontre o compromisso pelo assunto e peça a mudança de horário, local ou status. Você também pode cancelar quando necessário.",request:"Mude a reunião da equipe para as 14h.",result:"A agenda acompanha a mudança confirmada na conversa."},
    {title:"Consultar o que vem pela frente",how:"Pergunte pelos compromissos e use o calendário para visualizar sua programação.",request:"Quais são meus próximos compromissos?",result:"Uma visão do tempo já reservado para organizar as próximas decisões."},
    {title:"Criar o link do Meet",how:"Peça um link para a reunião, usando a conta Google autorizada no espaço. O link não significa gravação automática.",request:"Crie um Meet para a reunião de amanhã.",result:"Um acesso à reunião. Para organizar resumo e tarefas, envie o conteúdo por texto ou áudio."},
  ],
  task: [
    {title:"Tirar a pendência da cabeça",how:"Conte o que precisa fazer, o prazo e a prioridade. O Theo organiza a tarefa no espaço escolhido.",request:"Preciso enviar a proposta até sexta, prioridade alta.",result:"Uma tarefa identificada, com prazo para você acompanhar."},
    {title:"Acompanhar e atualizar",how:"Consulte o que está pendente e ajuste as informações quando o plano mudar.",request:"Quais tarefas ainda estão pendentes?",result:"Uma lista para decidir o próximo passo sem perder o que já foi registrado."},
    {title:"Concluir o que foi feito",how:"Peça a atualização do andamento. Tarefas que deixaram de fazer sentido também podem ser removidas.",request:"Marque a tarefa de enviar a proposta como concluída.",result:"O acompanhamento distingue o que falta do que já foi resolvido."},
  ],
  reminder: [
    {title:"Programar um aviso",how:"Informe o assunto, o dia e o horário. Complete qualquer dado necessário que faltar.",request:"Bia, me lembre de pagar o seguro dia 20 às 9h.",result:"Um aviso programado para chegar no WhatsApp."},
    {title:"Cuidar do que se repete",how:"Para hábitos e obrigações recorrentes, informe a frequência e o horário desejados.",request:"Me lembre toda segunda às 8h de conferir os pagamentos.",result:"Um lembrete recorrente conforme a programação informada."},
    {title:"Consultar, ajustar ou cancelar",how:"Consulte os lembretes e peça uma alteração quando o horário ou a necessidade mudar.",request:"Mude o lembrete do seguro para as 14h.",result:"Uma programação que acompanha a sua rotina atual."},
  ],
  goal: [
    {title:"Definir a conquista",how:"Diga o objetivo, o valor e o prazo. Use o contexto pessoal ou o da empresa correspondente.",request:"Nina, quero guardar R$ 5 mil para viajar até dezembro.",result:"Uma meta com destino e prazo definidos."},
    {title:"Registrar o progresso",how:"Informe os avanços para atualizar o acompanhamento. Registrar progresso não realiza uma transferência bancária.",request:"Adicione R$ 250 ao progresso da meta da viagem.",result:"A evolução registrada mostra quanto já foi alcançado e quanto falta."},
    {title:"Consultar e encerrar",how:"Pergunte sobre suas metas, marque uma conquista concluída ou cancele um objetivo que mudou.",request:"Como está a minha meta da viagem?",result:"Um retrato do progresso disponível na conversa e no painel."},
  ],
  grocery: [
    {title:"Montar e atualizar a lista",how:"Adicione itens e quantidades, edite o que mudou e retire o que não precisa mais.",request:"Lia, coloque dois pacotes de café e um quilo de arroz.",result:"Uma lista para consultar e marcar durante as compras."},
    {title:"Marcar o que já comprou",how:"Use a lista durante a compra e mantenha o que falta visível.",request:"Marque o café como comprado.",result:"O andamento da lista ajuda a evitar esquecimentos."},
    {title:"Registrar compras e gastos",how:"Informe itens, quantidades, preços e os detalhes disponíveis da compra.",request:"Registre a compra de hoje no supermercado.",result:"Histórico de compras e despesas vinculadas à organização financeira."},
    {title:"Comparar seu histórico",how:"Consulte preços registrados, compras anteriores e gastos com supermercado.",request:"Quanto paguei pelo café na última compra?",result:"Informação do seu histórico para apoiar a próxima escolha."},
  ],
  vehicle: [
    {title:"Identificar cada veículo",how:"Cadastre o veículo e mantenha as informações de cada um no contexto correspondente.",request:"Caio, quero cadastrar meu carro.",result:"Um cadastro para reunir o histórico daquele veículo."},
    {title:"Registrar o uso e os custos",how:"Informe abastecimento, manutenção ou seguro. Inclua litros e quilometragem quando tiver esses dados.",request:"Abasteci R$ 200 e o carro está com 42 mil km.",result:"Custos e informações do uso reunidos no histórico."},
    {title:"Consultar e atualizar",how:"Peça o histórico, confira despesas e mantenha os dados do veículo atualizados.",request:"Quais foram os gastos do meu carro neste mês?",result:"Uma visão dos custos registrados para o veículo escolhido."},
  ],
  people: [
    {title:"Cadastrar clientes",how:"Envie nome, contato e informações comerciais úteis para os próximos atendimentos.",request:"Clara, cadastre a Ana como cliente da empresa.",result:"Um cadastro no contexto empresarial correspondente."},
    {title:"Guardar contatos da rotina",how:"Mantenha nomes, telefones e observações de prestadores e pessoas que você consulta depois.",request:"Guarde o telefone do eletricista.",result:"Informações à mão sem depender de lembrar toda a conversa."},
    {title:"Consultar e manter atualizado",how:"Encontre pelo nome, complemente dados e atualize ou desative cadastros quando necessário.",request:"Encontre o contato da Ana e atualize o telefone.",result:"Cadastros organizados para retomar a próxima conversa com contexto."},
  ],
  employee: [
    {title:"Organizar o cadastro",how:"Informe nome, cargo, salário e os dados necessários para a empresa selecionada.",request:"Hugo, cadastre o João como assistente.",result:"Os dados ficam na organização administrativa da empresa."},
    {title:"Consultar a equipe",how:"Peça a lista de funcionários e consulte as informações registradas no painel ou na conversa.",request:"Quem está cadastrado na minha equipe?",result:"Uma visão de quem faz parte daquele negócio."},
    {title:"Acompanhar mudanças",how:"Atualize cargos, salários e dados cadastrais. Desative um cadastro quando ele não fizer mais parte da equipe.",request:"Atualize o cargo do João para supervisor.",result:"Informações administrativas mantidas no contexto da empresa."},
  ],
  nfse: [
    {title:"Preparar os dados fiscais",how:"Organize as informações fiscais da empresa e os dados necessários para a rotina de serviços.",request:"Otto, vamos conferir os dados fiscais da empresa.",result:"Uma base para preparar e revisar as informações fiscais."},
    {title:"Cadastrar os serviços",how:"Reúna as informações dos serviços para usar na preparação dos rascunhos.",request:"Quero cadastrar um serviço da empresa.",result:"Dados organizados para apoiar a preparação fiscal."},
    {title:"Revisar um rascunho de NFS-e",how:"Informe os dados do serviço e do tomador e confira o rascunho. Emissão direta e PDF oficial aguardam homologação.",request:"Prepare o rascunho da nota deste serviço.",result:"Um rascunho para revisão. Ele não é uma nota fiscal emitida."},
  ],
  support: [
    {title:"Começar pelo que você precisa",how:"Conte o que deseja organizar. A Zoe explica os recursos e ajuda a encontrar o caminho na conversa.",request:"Zoe, como começo a organizar minhas finanças?",result:"Orientação para o próximo passo dentro da plataforma."},
    {title:"Entender como usar",how:"Pergunte sobre uma função e os dados que precisa informar para fazer o pedido.",request:"Como guardo e encontro um arquivo no Zelo?",result:"Uma explicação de uso, sem precisar decorar comandos."},
    {title:"Pesquisar informações públicas",how:"Diga o que procura e seus critérios. Confira os resultados nas fontes encontradas.",request:"Pesquise opções deste produto e compare os preços.",result:"Informação disponível na consulta; preços e disponibilidade podem mudar."},
  ],
};

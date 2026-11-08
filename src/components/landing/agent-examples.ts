import type { VIRTUAL_TEAM } from "@/lib/virtual-team";

export type AgentExample = {
  key: keyof typeof VIRTUAL_TEAM;
  area: "Finanças" | "Rotina" | "Empresa" | "Organização";
  topic: string;
  title: string;
  description: string;
  outcome: string;
  request: string;
  resultTitle: string;
  rows: { label: string; value: string }[];
  progress?: { value: number; label: string };
  note?: string;
};

export const agentExamples: AgentExample[] = [
  {
    key: "finance",
    area: "Finanças",
    topic: "Finanças",
    title: "Veja onde gastou e o que falta pagar",
    description: "Conte à Rita o que entrou ou saiu, consulte os gastos por categoria ou envie uma fatura em PDF, foto, CSV ou Excel para revisar as compras. Com os bancos conectados, também dá para consultar saldos, limites e investimentos.",
    outcome: "Ao planejar dezembro, você vê quanto já está comprometido e quais parcelas, empréstimos e assinaturas compõem o total.",
    request: "Rita, quanto já tenho a pagar em dezembro no Pessoal? Me mostra o que entra nessa conta.",
    resultTitle: "R$ 550,00 previstos para dezembro",
    rows: [
      { label: "Notebook · parcela 4 de 10", value: "R$ 190,00" },
      { label: "Empréstimo · parcela 2 de 6", value: "R$ 340,00" },
      { label: "Assinatura de música", value: "R$ 20,00" },
    ],
    note: "Escolha Pessoal ou Empresa para a consulta. Os dados do banco dependem da conexão que você autorizou.",
  },
  {
    key: "agenda",
    area: "Rotina",
    topic: "Agenda",
    title: "Organize os compromissos do dia",
    description: "Diga ao Lucas o assunto, o dia e o horário para marcar um compromisso pessoal ou da empresa. Se a reunião for por vídeo, conecte o Google Agenda e peça um link do Meet. Também dá para remarcar ou cancelar pelo WhatsApp.",
    outcome: "Ao abrir a agenda da empresa, você encontra a reunião de orçamento com o horário reservado e o link para entrar.",
    request: "Lucas, marca a reunião de orçamento na agenda da empresa. Terça, das 10h às 10h30, com link do Meet.",
    resultTitle: "Reunião de orçamento",
    rows: [
      { label: "Quando", value: "Terça, das 10h às 10h30" },
      { label: "Calendário", value: "Agenda da empresa" },
      { label: "Chamada", value: "Google Meet" },
    ],
  },
  {
    key: "task",
    area: "Organização",
    topic: "Tarefas",
    title: "Saiba o que precisa fazer primeiro",
    description: "Passe as tarefas ao Theo com prazo e prioridade. Quando for organizar o dia, pergunte o que está pendente. Se uma entrega mudar, você pode ajustar a data ou marcar a tarefa como concluída pela conversa.",
    outcome: "Na lista de sexta, a proposta aparece com prioridade alta até você confirmar a entrega.",
    request: "Theo, preciso enviar a proposta até sexta. Coloca na minha lista com prioridade alta.",
    resultTitle: "Enviar a proposta",
    rows: [
      { label: "Prazo", value: "Sexta-feira" },
      { label: "Prioridade", value: "Alta" },
      { label: "Situação", value: "Pendente" },
    ],
  },
  {
    key: "reminder",
    area: "Rotina",
    topic: "Lembretes",
    title: "Programe avisos pelo WhatsApp",
    description: "Diga à Bia o que precisa lembrar e a que horas quer receber a mensagem. Pode ser um aviso para uma data específica ou um lembrete que se repete todo dia, semana ou mês. Para mudar o horário, basta pedir na conversa.",
    outcome: "Todo dia 15, às 9h, o aviso de pagar o seguro chega ao seu WhatsApp.",
    request: "Bia, me lembra de pagar o seguro todo dia 15, às 9h.",
    resultTitle: "Lembrete de pagar o seguro",
    rows: [
      { label: "Repetição", value: "Mensal, dia 15" },
      { label: "Horário", value: "9h" },
      { label: "Destino", value: "Meu WhatsApp" },
    ],
  },
  {
    key: "drive",
    area: "Organização",
    topic: "Arquivos",
    title: "Guarde e encontre seus documentos",
    description: "Envie uma foto ou um PDF à Dora para guardar no Drive da Zelo. Organize seus arquivos em pastas e, quando precisar de um documento, peça pelo nome ou diga o que lembra do assunto.",
    outcome: "Mesmo que você só lembre da reforma da cozinha, a Dora pode localizar o contrato e devolver o PDF na conversa.",
    request: "Dora, me mande o contrato da reforma da cozinha.",
    resultTitle: "Contrato encontrado",
    rows: [
      { label: "Arquivo", value: "Contrato da reforma.pdf" },
      { label: "Pasta", value: "Contratos" },
      { label: "Assunto", value: "Reforma da cozinha" },
    ],
  },
  {
    key: "goal",
    area: "Finanças",
    topic: "Metas",
    title: "Acompanhe o dinheiro que já juntou",
    description: "Defina com a Nina o objetivo, o valor que quer juntar e o prazo. Sempre que guardar dinheiro, registre a quantia e consulte quanto falta para chegar lá.",
    outcome: "Na simulação da viagem, registrar mais R$ 300 faz a reserva passar de 30% para 35% da meta.",
    request: "Nina, quanto já juntei para a viagem e quanto falta?",
    resultTitle: "Reserva para a viagem",
    rows: [
      { label: "Valor da meta", value: "R$ 6.000,00" },
      { label: "Já guardado", value: "R$ 1.800,00" },
      { label: "Falta juntar", value: "R$ 4.200,00" },
    ],
    progress: { value: 30, label: "30% da meta" },
  },
  {
    key: "grocery",
    area: "Rotina",
    topic: "Supermercado",
    title: "Monte a lista e compare suas compras",
    description: "Diga à Lia o que precisa comprar e em que quantidade. No mercado, marque o que já pôs no carrinho. Ao registrar o nome da loja e os preços, você cria um histórico para consultar na próxima compra.",
    outcome: "Na próxima ida ao mercado, dá para comparar o preço do café na prateleira com os R$ 18 que você pagou da última vez.",
    request: "Lia, o que levei na última compra no Mercado do Bairro e quanto custou cada item?",
    resultTitle: "Última compra · R$ 52,00",
    rows: [
      { label: "Café · 1 pacote", value: "R$ 18,00" },
      { label: "Arroz · 1 pacote", value: "R$ 22,00" },
      { label: "Leite · 2 unidades", value: "R$ 12,00" },
    ],
  },
  {
    key: "vehicle",
    area: "Rotina",
    topic: "Veículos",
    title: "Veja quanto custa manter seu veículo",
    description: "Diga ao Caio qual veículo você usou e quanto gastou com combustível, manutenção ou seguro. Ao abastecer, informe também os litros e a quilometragem do painel.",
    outcome: "No histórico do Onix, você pode recuperar o abastecimento de R$ 180 e consultar as outras despesas daquele carro no mês.",
    request: "Caio, abasteci o Onix com 30 litros por R$ 180. O painel marca 42 mil km.",
    resultTitle: "Abastecimento do Onix",
    rows: [
      { label: "Valor", value: "R$ 180,00" },
      { label: "Combustível", value: "30 litros" },
      { label: "Quilometragem", value: "42.000 km" },
    ],
  },
  {
    key: "people",
    area: "Empresa",
    topic: "Clientes e contatos",
    title: "Encontre clientes e contatos pelo nome",
    description: "A Clara cuida dos seus contatos pessoais e dos clientes da empresa. Informe telefone, e-mail e observações que ajudem no próximo atendimento. Depois, procure pelo nome ou peça para atualizar a ficha.",
    outcome: "Na hora de enviar o orçamento da Ana, você encontra o e-mail dela e a anotação de que prefere receber a proposta por lá.",
    request: "Clara, encontre a ficha da cliente Ana Prado.",
    resultTitle: "Ficha de Ana Prado",
    rows: [
      { label: "Empresa da cliente", value: "Ateliê Horizonte" },
      { label: "E-mail", value: "ana@example.com" },
      { label: "Observação", value: "Prefere receber o orçamento por e-mail" },
    ],
  },
  {
    key: "employee",
    area: "Empresa",
    topic: "Funcionários",
    title: "Mantenha o cadastro da equipe em dia",
    description: "Escolha a empresa e informe ao Hugo o nome, o cargo e o salário de cada funcionário. Quando alguém mudar de função ou sair da equipe, peça a atualização da ficha pelo WhatsApp.",
    outcome: "Você pode consultar a soma dos salários da equipe ou abrir a ficha da Joana para conferir só o cargo e o salário dela.",
    request: "Hugo, quem está na minha equipe e quanto somam os salários?",
    resultTitle: "Equipe ativa · 2 pessoas",
    rows: [
      { label: "Joana · assistente", value: "R$ 2.400,00" },
      { label: "Daniel · supervisor", value: "R$ 3.600,00" },
      { label: "Total dos salários", value: "R$ 6.000,00" },
    ],
  },
  {
    key: "nfse",
    area: "Empresa",
    topic: "Notas fiscais",
    title: "Prepare os dados da sua nota de serviço",
    description: "Com o cadastro fiscal da empresa preenchido, escolha um serviço ou cadastre um novo. Diga ao Otto quem contratou o serviço, quanto você cobrou e qual foi a data da prestação.",
    outcome: "Você recebe no painel uma prévia da NFS-e com o cliente, o serviço e o valor da consultoria para conferir.",
    request: "Otto, prepara os dados da nota da consultoria para o Ateliê Horizonte. O valor é R$ 800.",
    resultTitle: "Prévia da nota de serviço",
    rows: [
      { label: "Tomador", value: "Ateliê Horizonte" },
      { label: "Serviço", value: "Consultoria" },
      { label: "Valor", value: "R$ 800,00" },
    ],
    note: "A emissão oficial da NFS-e pela Zelo ainda está indisponível.",
  },
  {
    key: "support",
    area: "Organização",
    topic: "Ajuda e pesquisas",
    title: "Tire dúvidas e pesquise opções",
    description: "Pergunte à Zoe como usar a Zelo, desde guardar um comprovante até encontrar um arquivo. Ela também pesquisa informações públicas. Para comparar produtos, diga o que procura, quanto pode gastar e quais detalhes importam.",
    outcome: "No caso da cafeteira, você sabe o que conferir na loja para escolher uma opção de 127 V dentro do orçamento de R$ 250.",
    request: "Zoe, quero uma cafeteira de 127 V por até R$ 250. O que devo conferir antes de comprar?",
    resultTitle: "Pesquisa de cafeteira",
    rows: [
      { label: "O que pedir", value: "Cafeteira elétrica de 127 V" },
      { label: "Faixa de preço", value: "Até R$ 250,00" },
      { label: "O que conferir na loja", value: "Preço, frete e disponibilidade" },
    ],
  },
];

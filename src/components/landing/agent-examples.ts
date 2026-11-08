import type { VIRTUAL_TEAM } from "@/lib/virtual-team";

export type AgentExample = {
  key: keyof typeof VIRTUAL_TEAM;
  area: "Finanças" | "Rotina" | "Empresa" | "Organização";
  topic: string;
  title: string;
  description: string;
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
    title: "Quanto já tenho a pagar?",
    description: "Antes de planejar o mês, peça à Rita a soma das parcelas, dos empréstimos e das contas recorrentes. Você também pode ver os gastos por categoria ou consultar saldos, limites e investimentos dos bancos conectados. Para importar uma fatura, mande o PDF, a foto ou a planilha em CSV ou Excel e confira os lançamentos.",
    request: "Rita, quanto já tenho a pagar em dezembro no Pessoal? Me mostra as parcelas e assinaturas.",
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
    title: "Marque a reunião com link do Meet",
    description: "Informe ao Lucas o assunto, o horário e a duração da reunião. Com o Google Agenda conectado ao espaço pessoal ou da empresa, ele cria o evento e o link do Meet. Depois, você pode consultar os compromissos, mudar o horário ou cancelar pelo WhatsApp.",
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
    title: "Organize a entrega da proposta",
    description: "Conte ao Theo o que precisa fazer e o que tem prioridade. A tarefa entra na lista do espaço escolhido, com o prazo para consultar no painel. Se a entrega mudar, ajuste a data na conversa. Quando enviar a proposta, peça para marcar a tarefa como concluída.",
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
    title: "Receba um aviso no dia de pagar",
    description: "O seguro vence todo dia 15? Diga à Bia a que horas quer receber o lembrete no WhatsApp. Vale para uma data específica ou para avisos diários, semanais e mensais. Se o vencimento mudar, você pode ajustar ou cancelar o lembrete pela conversa.",
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
    title: "Ache o contrato pelo assunto",
    description: "Mande a foto ou o PDF para a Dora guardar no Drive da Zelo. Você pode organizar os arquivos em pastas e pedir um documento pelo nome ou por uma pista, como “reforma da cozinha”. Quando a Dora encontra o contrato, você recebe o próprio arquivo no WhatsApp.",
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
    title: "Quanto falta para a viagem?",
    description: "Diga à Nina quanto quer juntar e até quando. A cada valor que você guarda, registre a quantia na conversa. A Nina mostra o total já reservado, a porcentagem alcançada e quanto ainda falta para a meta, no WhatsApp e no painel.",
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
    title: "Veja quanto pagou no mercado",
    description: "Monte a lista com a Lia e marque o que já pôs no carrinho. Ao registrar a compra, informe o mercado, os itens, as quantidades e os preços. Na próxima ida, consulte quanto custou o café ou compare o que você pagou em mercados diferentes.",
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
    title: "Acompanhe os gastos do carro",
    description: "Abasteceu? Passe ao Caio o valor, os litros e a quilometragem do painel. Ele reúne o registro com os de manutenção e seguro daquele veículo. Se você usa mais de um carro, indique qual deles quer consultar para ver os gastos do mês.",
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
    title: "Retome o atendimento de um cliente",
    description: "Antes de enviar um orçamento, peça à Clara a ficha do cliente. Você encontra o e-mail e as preferências que registrou, como a melhor forma de contato. Também pode atualizar o telefone de um cliente da empresa ou guardar o de um prestador nos seus contatos pessoais.",
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
    title: "Confira cargos e salários da equipe",
    description: "Escolha a empresa e pergunte ao Hugo quem faz parte da equipe e quanto somam os salários cadastrados. Você pode consultar o cargo de cada pessoa, registrar uma promoção ou desativar a ficha de quem saiu, direto pelo WhatsApp.",
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
    title: "Prepare o rascunho da nota de serviço",
    description: "Com o cadastro fiscal da empresa preenchido, escolha um serviço ou cadastre um novo. Informe ao Otto quem contratou o serviço, o valor e a data de competência. Ele organiza os dados em um rascunho de NFS-e que você pode revisar no painel.",
    request: "Otto, prepara o rascunho da nota da consultoria para o Ateliê Horizonte. O valor é R$ 800.",
    resultTitle: "Rascunho de NFS-e",
    rows: [
      { label: "Tomador", value: "Ateliê Horizonte" },
      { label: "Serviço", value: "Consultoria" },
      { label: "Valor", value: "R$ 800,00" },
    ],
    note: "Por enquanto, a Zelo prepara rascunhos. A emissão da nota e a geração do PDF oficial aguardam homologação.",
  },
  {
    key: "support",
    area: "Organização",
    topic: "Ajuda e pesquisas",
    title: "Pesquise por preço e voltagem",
    description: "Procurando uma cafeteira? Diga à Zoe a voltagem da sua tomada e quanto quer gastar. Ela ajuda a pesquisar informações públicas e a comparar as opções. Você também pode perguntar como guardar um comprovante ou encontrar um arquivo na Zelo.",
    request: "Zoe, quero uma cafeteira de 127 V por até R$ 250. O que devo conferir antes de comprar?",
    resultTitle: "Pesquisa de cafeteira",
    rows: [
      { label: "O que pedir", value: "Cafeteira elétrica de 127 V" },
      { label: "Faixa de preço", value: "Até R$ 250,00" },
      { label: "O que conferir na loja", value: "Preço, frete e disponibilidade" },
    ],
  },
];

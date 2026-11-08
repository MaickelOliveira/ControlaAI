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
    title: "Veja quanto já está comprometido no próximo mês",
    description: "A Rita reúne parcelas de compras, empréstimos e contas recorrentes. Você também pode consultar gastos por categoria, saldos, limites e investimentos dos bancos conectados, ou importar uma fatura em PDF, foto, CSV ou Excel para conferir os lançamentos.",
    request: "Rita, quais contas tenho a pagar em dezembro no Pessoal?",
    resultTitle: "R$ 550,00 previstos para dezembro",
    rows: [
      { label: "Notebook · parcela 4 de 10", value: "R$ 190,00" },
      { label: "Empréstimo · parcela 2 de 6", value: "R$ 340,00" },
      { label: "Assinatura de música", value: "R$ 20,00" },
    ],
    note: "Os valores bancários vêm das instituições que você autorizou.",
  },
  {
    key: "agenda",
    area: "Rotina",
    topic: "Agenda",
    title: "Marque uma reunião com horário e link do Meet",
    description: "Com o Google Agenda conectado ao espaço escolhido, o Lucas cria o compromisso e o link da chamada. Se os planos mudarem, peça pela conversa para consultar, reagendar ou cancelar.",
    request: "Lucas, marque a reunião de orçamento para terça, às 10h, com meia hora de duração e um Google Meet.",
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
    title: "Deixe a proposta na lista de sexta-feira",
    description: "Diga ao Theo o que precisa fazer, o prazo e a prioridade. A tarefa aparece no painel do espaço escolhido. Quando terminar, você pode dar baixa pelo WhatsApp.",
    request: "Theo, crie uma tarefa para enviar a proposta até sexta. Prioridade alta.",
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
    title: "Receba um aviso na manhã do vencimento",
    description: "A Bia programa lembretes no WhatsApp para uma data ou para repetir a cada dia, semana ou mês. Você pode mudar o horário ou cancelar o aviso pela conversa.",
    request: "Bia, me lembre de pagar o seguro todo dia 15, às 9h.",
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
    title: "Encontre o contrato pelo assunto que você lembra",
    description: "Envie uma foto ou um PDF e peça à Dora para guardá-lo no Drive da Zelo. Depois, procure pelo nome ou pelo assunto. Quando encontra o arquivo, ela envia o anexo na conversa.",
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
    title: "Confira quanto falta para a viagem",
    description: "Defina o valor que quer juntar e o prazo. A cada quantia que você registra, a Nina atualiza o progresso da meta para você acompanhar no painel ou na conversa.",
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
    title: "Consulte a última compra antes de fazer a próxima",
    description: "Com a Lia, você monta a lista, marca os itens comprados e registra quantidades e preços. Seu histórico permite comparar o que pagou em cada mercado.",
    request: "Lia, o que comprei da última vez no Mercado do Bairro?",
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
    title: "Guarde o valor do abastecimento junto com a quilometragem",
    description: "O Caio organiza combustível, manutenção e seguro no histórico de cada veículo. Se houver mais de um carro cadastrado, você escolhe qual deve receber o gasto.",
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
    title: "Retome um atendimento com os dados do cliente à mão",
    description: "A Clara guarda contatos pessoais e cadastros de clientes da empresa. Busque pelo nome para recuperar os dados e as observações do último atendimento ou atualizar o que mudou.",
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
    title: "Consulte a equipe e o total dos salários cadastrados",
    description: "O Hugo mantém cargo, salário e situação de cada funcionário da empresa selecionada. Quando alguém muda de função, você pode atualizar o cadastro pelo WhatsApp.",
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
    title: "Prepare um rascunho de NFS-e para revisar no painel",
    description: "Depois de preencher o cadastro fiscal da empresa, escolha ou cadastre o serviço. O Otto pede os dados do tomador, o valor e a competência e reúne tudo em um rascunho para revisão.",
    request: "Otto, prepare um rascunho de NFS-e para a consultoria do Ateliê Horizonte.",
    resultTitle: "Rascunho de NFS-e",
    rows: [
      { label: "Tomador", value: "Ateliê Horizonte" },
      { label: "Serviço", value: "Consultoria" },
      { label: "Valor", value: "R$ 800,00" },
    ],
    note: "A emissão da nota e o PDF oficial aguardam homologação.",
  },
  {
    key: "support",
    area: "Organização",
    topic: "Ajuda e pesquisas",
    title: "Peça ajuda para começar uma pesquisa",
    description: "A Zoe explica como usar os recursos da Zelo e ajuda a pesquisar informações públicas pelo WhatsApp. Informe o que procura e os critérios da busca para comparar as opções encontradas.",
    request: "Zoe, como pesquiso uma cafeteira de 127 V por até R$ 250?",
    resultTitle: "Pesquisa de cafeteira",
    rows: [
      { label: "O que pedir", value: "Cafeteira elétrica de 127 V" },
      { label: "Faixa de preço", value: "Até R$ 250,00" },
      { label: "O que conferir na loja", value: "Preço, frete e disponibilidade" },
    ],
  },
];

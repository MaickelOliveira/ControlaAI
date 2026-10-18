import { VIRTUAL_TEAM } from "./virtual-team";

type AgentKey = keyof typeof VIRTUAL_TEAM;
type AgentBrief = {
  key: AgentKey; portrait: string; headline: string; description: string;
  capabilities: string[]; example: string; exampleReply: string; detail: string;
};
const briefs: AgentBrief[] = [
  { key: "support", portrait: "zoe", headline: "O primeiro olá. O caminho certo.", description: "Conheça a Zoe. Ela recebe você, explica como usar o Zelo e ajuda a encontrar o que precisa na conversa.", capabilities: ["Recepção e orientação", "Ajuda com os recursos", "Pesquisas de informações públicas"], example: "Zoe, por onde eu começo?", exampleReply: "Me conte o que quer organizar. Posso te orientar pelos recursos do Zelo.", detail: "Uma equipe virtual da mesma Zelo. Fale naturalmente, em uma única conversa." },
  { key: "finance", portrait: "rita", headline: "Seu dinheiro. Com mais clareza.", description: "A Rita organiza receitas e despesas e ajuda você a acompanhar contas, cartões, faturas e o que vem pela frente.", capabilities: ["Open Finance, contas e cartões", "Faturas, parcelas e recorrências", "Importação de PDF, foto, CSV e Excel"], example: "Rita, gastei R$ 85 no mercado hoje.", exampleReply: "Vamos registrar R$ 85 em supermercado. Em qual conta e espaço você quer lançar?", detail: "Conexões bancárias com sua autorização. Dados e atualização dependem da instituição." },
  { key: "agenda", portrait: "lucas", headline: "Tempo para o que importa.", description: "O Lucas organiza seus compromissos e conecta a rotina ao Google Agenda. Precisa de uma reunião? Peça o link do Meet.", capabilities: ["Compromissos e horários", "Integração com Google Agenda", "Criação de links do Google Meet"], example: "Lucas, marque uma reunião amanhã às 10h.", exampleReply: "Qual é o assunto e em qual espaço vamos organizar esse compromisso?", detail: "A conta Google é conectada ao espaço escolhido, com sua autorização." },
  { key: "task", portrait: "theo", headline: "Do “preciso fazer” ao feito.", description: "O Theo transforma suas pendências em tarefas. Prazos, prioridades e andamento ficam à mão para você seguir em frente.", capabilities: ["Tarefas com prazo", "Prioridade e acompanhamento", "Consulta e conclusão pela conversa"], example: "Theo, preciso enviar a proposta até sexta.", exampleReply: "Vamos criar a tarefa “Enviar proposta” com prazo para sexta. Qual a prioridade?", detail: "Acompanhe suas tarefas no painel e retome o assunto no WhatsApp." },
  { key: "reminder", portrait: "bia", headline: "Você vive. Ela te lembra.", description: "A Bia cuida dos lembretes que você não quer guardar na cabeça. Um aviso para hoje ou algo que se repete na rotina.", capabilities: ["Lembretes pontuais", "Avisos recorrentes", "Horário definido na conversa"], example: "Bia, me lembre de pagar o seguro dia 20.", exampleReply: "Para qual horário do dia 20 você quer programar o lembrete?", detail: "Informe data e horário para receber o aviso no momento programado." },
  { key: "goal", portrait: "nina", headline: "O próximo passo da sua conquista.", description: "A Nina dá forma aos seus objetivos. Defina o que quer alcançar, o valor e o prazo, e acompanhe o progresso.", capabilities: ["Metas pessoais e da empresa", "Objetivo, valor e prazo", "Acompanhamento do progresso"], example: "Nina, quero guardar R$ 5 mil para viajar.", exampleReply: "Vamos criar a meta da viagem. Até quando você quer chegar aos R$ 5 mil?", detail: "Uma visão clara de cada objetivo para acompanhar suas conquistas." },
  { key: "drive", portrait: "dora", headline: "O arquivo certo. Sem a procura.", description: "A Dora guarda seus arquivos, sugere nomes e pastas e ajuda a encontrar pelo assunto. Peça o documento na conversa e, quando ele for encontrado, receba o próprio arquivo no WhatsApp.", capabilities: ["Guardar e organizar em pastas", "Renomear o arquivo recente", "Buscar e receber no WhatsApp"], example: "Dora, encontre o contrato do fornecedor.", exampleReply: "Vou procurar entre os documentos do espaço selecionado. Lembra o nome do fornecedor?", detail: "Seus documentos acompanham o contexto pessoal ou empresarial escolhido." },
  { key: "grocery", portrait: "lia", headline: "Da lista à compra organizada.", description: "A Lia acompanha as compras de supermercado: itens, listas, preços e histórico. Os gastos registrados também entram na organização.", capabilities: ["Listas e itens de supermercado", "Preços e histórico de compras", "Despesas vinculadas às compras"], example: "Lia, coloque café e arroz na lista.", exampleReply: "Qual lista você quer atualizar e quais são as quantidades?", detail: "Os detalhes das compras ficam acessíveis no painel e na conversa." },
  { key: "vehicle", portrait: "caio", headline: "Seu veículo. Tudo no radar.", description: "O Caio reúne os detalhes de cada veículo, do abastecimento à próxima manutenção, para você acompanhar o uso e os custos.", capabilities: ["Combustível e abastecimentos", "Manutenção e seguro", "Quilometragem e custos"], example: "Caio, abasteci R$ 200 hoje.", exampleReply: "Em qual veículo? Me informe também a quilometragem e os litros, se tiver.", detail: "Organize os veículos pessoais e os da empresa em seus respectivos espaços." },
  { key: "people", portrait: "clara", headline: "Cada contato tem uma história.", description: "A Clara organiza clientes e contatos, com as informações e observações que ajudam você a retomar cada conversa.", capabilities: ["Cadastro de clientes", "Contatos sempre à mão", "Informações e observações"], example: "Clara, quero cadastrar um novo cliente.", exampleReply: "Me envie o nome e os dados do contato para organizar no espaço da empresa.", detail: "Consulte as informações pelo WhatsApp ou pelo painel quando precisar." },
  { key: "employee", portrait: "hugo", headline: "Sua equipe, bem organizada.", description: "O Hugo reúne os dados dos funcionários, cargos e salários no espaço da empresa. Mais clareza para cuidar de quem faz parte do negócio.", capabilities: ["Cadastro de funcionários", "Cargos e salários", "Dados da equipe por empresa"], example: "Hugo, preciso cadastrar uma funcionária.", exampleReply: "Qual é o nome, o cargo e o salário? Vamos organizar os dados na empresa selecionada.", detail: "Informações da equipe ficam no contexto da empresa correspondente." },
  { key: "nfse", portrait: "otto", headline: "A preparação fiscal começa aqui.", description: "O Otto ajuda a organizar dados fiscais, serviços e rascunhos de NFS-e. Uma base para preparar a rotina fiscal do seu negócio.", capabilities: ["Dados fiscais da empresa", "Cadastro de serviços", "Preparação de rascunhos de NFS-e"], example: "Otto, vamos preparar uma nota de serviço.", exampleReply: "Vamos preparar o rascunho. Me envie os dados do serviço e do tomador para revisar.", detail: "Emissão direta e PDF oficial aguardam homologação. Rascunho não é nota emitida." },
];

export const AGENT_SCENES = briefs.map(brief => ({
  ...brief,
  ...VIRTUAL_TEAM[brief.key],
  id: brief.portrait,
  portrait: `/brand/team/${brief.portrait}.png`,
}));
export type AgentScene = (typeof AGENT_SCENES)[number];
export const STORY_SCENES = [
  ...AGENT_SCENES.map(agent => ({ id: agent.id, label: agent.name })),
  { id: "equipe", label: "Sua equipe" },
];

type Geometry = { top: number; height: number; viewport: number };
const clamp = (value: number, max = 1) => Math.min(max, Math.max(0, value));

export const EXPENSE_EXAMPLE_MESSAGE = "Gastei R$ 85 no mercado. Foi no débito, na conta pessoal.";

/** Typing, camera, path and record all rewind from the same position. */
export function expenseJourney(progress: number) {
  const typing = clamp(progress / 0.23);
  return {
    typing,
    typed: EXPENSE_EXAMPLE_MESSAGE.slice(0, Math.floor(7 + typing * (EXPENSE_EXAMPLE_MESSAGE.length - 7))),
    zoom: clamp((progress - 0.2) / 0.18),
    travel: clamp((progress - 0.38) / 0.34),
    reveal: clamp((progress - 0.72) / 0.2),
  };
}

/** Every frame depends only on scroll geometry, including reverse and restored scroll. */
export function storyFrame(scrollY: number, { top, height, viewport }: Geometry, count = STORY_SCENES.length) {
  const progress = clamp((scrollY - top) / Math.max(1, height - viewport));
  const position = clamp(progress * count - 0.35, count - 1);
  return { progress, position, active: Math.round(position), weights: Array.from({ length: count }, (_, i) => clamp(1 - Math.abs(position - i))) };
}
export function storyScrollTarget(scene: number, { top, height, viewport }: Geometry, count = STORY_SCENES.length) {
  return top + ((clamp(scene, count - 1) + 0.35) / count) * Math.max(1, height - viewport);
}

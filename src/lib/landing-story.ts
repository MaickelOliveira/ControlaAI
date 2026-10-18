export const STORY_SCENES = [
  { id: "conversa", label: "Converse", eyebrow: "SUA ROTINA COMEÇA A FICAR MAIS LEVE", title: "Você manda uma mensagem.", accent: "O Zelo organiza.", description: "Sua vida e seu negócio, no WhatsApp que você já usa. Fale, escreva ou envie uma foto. Deixe o resto com o Zelo.", detail: "Áudio, texto, foto e PDF. Do seu jeito." },
  { id: "registro", label: "Organize", eyebrow: "DA CONVERSA PARA O LUGAR CERTO", title: "Falou. Registrou.", accent: "Pode seguir seu dia.", description: "Uma despesa, uma receita, uma informação importante. O Zelo entende o pedido e organiza tudo no seu painel.", detail: "Cada registro no espaço que você escolheu." },
  { id: "dinheiro", label: "Enxergue", eyebrow: "MAIS CLAREZA SOBRE O SEU DINHEIRO", title: "Seu dinheiro,", accent: "sem pontos cegos.", description: "Contas conectadas, cartões, faturas e parcelas. Acompanhe pelo painel ou pergunte o que precisa saber no WhatsApp.", detail: "Conexão bancária com sua autorização. Dados conforme a instituição." },
  { id: "espacos", label: "Separe", eyebrow: "CADA PARTE DA SUA VIDA TEM SEU ESPAÇO", title: "Você. Sua empresa.", accent: "Cada um no seu lugar.", description: "Alterne entre o pessoal e cada empresa. Finanças, arquivos e integrações Google organizados no espaço certo.", detail: "Família, sócios e equipe podem colaborar pelo próprio WhatsApp." },
  { id: "rotina", label: "Planeje", eyebrow: "MENOS COISAS PARA GUARDAR NA CABEÇA", title: "Sua agenda anda.", accent: "Sua cabeça descansa.", description: "Compromissos, tarefas, lembretes e reuniões. Integre o Google Agenda e peça seus links de Google Meet na conversa.", detail: "Mais clareza sobre o que fazer e quando fazer." },
  { id: "completo", label: "Cuide", eyebrow: "MAIS TEMPO PARA O QUE IMPORTA", title: "Tudo conectado.", accent: "Sua rotina sob controle.", description: "Finanças, documentos, metas e os detalhes do dia a dia. Um assistente para cuidar da organização com você.", detail: "Conheça todos os recursos e escolha seu plano abaixo." },
] as const;

type Geometry = { top: number; height: number; viewport: number };
const clamp = (value: number, max = 1) => Math.min(max, Math.max(0, value));

/** Pure geometry makes forward, reverse, restored scroll and direct jumps identical. */
export function storyFrame(scrollY: number, { top, height, viewport }: Geometry) {
  const progress = clamp((scrollY - top) / Math.max(1, height - viewport));
  const position = clamp(progress * STORY_SCENES.length - 0.35, STORY_SCENES.length - 1);
  return {
    progress,
    position,
    active: Math.round(position),
    weights: STORY_SCENES.map((_, index) => clamp(1 - Math.abs(position - index))),
  };
}

export function storyScrollTarget(scene: number, { top, height, viewport }: Geometry) {
  return top + ((clamp(scene, STORY_SCENES.length - 1) + 0.35) / STORY_SCENES.length) * Math.max(1, height - viewport);
}

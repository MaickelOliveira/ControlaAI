type Turn = {role:string; content:string};
export type PanelTopic = "payables" | "receivables" | "support";
const normalize = (s:string) => s.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();

export const panelKnowledge = "No painel, use Finanças e escolha o mês/ano. O cartão Despesas do período separa Registradas e A pagar (previsto). O cartão Receitas recebidas mostra A receber no período. O Extrato da mesma tela lista os itens. Suporte fica no botão de conversa no canto inferior direito. Não invente páginas, botões nem cadastros. Se a pessoa não encontrar uma opção, use os nomes reais da tela e considere o último assunto. Para outros menus só dê um caminho que conheça.";

function topic(text:string):PanelTopic|null {
  if (/\b(?:suporte|soporte|atendente humano)\b/.test(text)) return "support";
  if (/\b(?:receitas?|salario|ingresos?|a receber|por cobrar)\b/.test(text)) return "receivables";
  if (/\b(?:despesas?|gastos?|contas a pagar|a pagar|por pagar|proximas despesas)\b/.test(text)) return "payables";
  return null;
}

export function navigationTopic(text:string, history:readonly Turn[]):PanelTopic|null {
  const s=normalize(text.trim());
  if (/^(?:falar com|contat(?:o|ar)|acionar|entrar em contato com|chamar).*\b(?:suporte|soporte)\b/.test(s)) return "support";
  const looking=/\b(?:onde|aonde|donde|localiz\w*|encontr\w*|nao (?:vi|achei|existe)|como (?:vejo|acesso|visualizo|chego)|qual (?:menu|tela|botao))\b/.test(s);
  const follow=/^(?:\?+|e agora[?!.]*|nao existe[.! ]*|nao achei[.! ]*)$/.test(s);
  if (!looking && !follow) return null;
  if (/\b(?:gastei|paguei|comprei|gaste|compre)\b/.test(s)) return null;
  if (looking && topic(s)) return topic(s);
  if (!follow && !/\b(?:opcao|menu|tela|botao|isso|essa|esse|encontrei|achei)\b/.test(s)) return null;
  for (const turn of history.slice(-5).reverse()) {
    const recent=normalize(turn.content);
    if (recent.length > 1300) break;
    if (/\b(?:menu|painel|tela|opcao|financas|onde|aonde|programadas|a pagar)\b/.test(recent) && topic(recent)) return topic(recent);
    if (turn.role==="user" && !/\b(?:opcao|menu|achei|existe|localizei|encontrei)\b/.test(recent) && recent!=="?") break;
  }
  return null;
}

export function panelReply(topic:PanelTopic, locale?:string) {
  const es=locale==="es";
  if(topic==="support") return es ? "En el panel, toca el botón de conversación en la esquina inferior derecha y envía tu mensaje a Soporte." : "No painel, toque no botão de conversa no canto inferior direito e envie sua mensagem ao Suporte.";
  if(es) return topic==="payables" ? "Abre Finanzas, selecciona el mes y el año y revisa los gastos previstos. El extracto de esa pantalla muestra los movimientos." : "Abre Finanzas y selecciona el mes y el año. Consulta los ingresos recibidos y el importe pendiente de cobro.";
  return topic==="payables" ? "Abra Finanças no menu e selecione o mês e o ano. No cartão “Despesas do período”, veja “A pagar (previsto)”. Para conferir os itens, desça até o Extrato na mesma tela." : "Abra Finanças no menu e selecione o mês e o ano. No cartão “Receitas recebidas”, veja “A receber no período”. O Extrato da mesma tela mostra os lançamentos.";
}

export const VIRTUAL_TEAM = {
  nfse:{name:"Otto",gender:"m",role:"notas fiscais",es:"notas fiscales"},
  finance:{name:"Rita",gender:"f",role:"finanças",es:"finanzas"},
  agenda:{name:"Lucas",gender:"m",role:"agenda",es:"agenda"},
  task:{name:"Theo",gender:"m",role:"tarefas",es:"tareas"},
  goal:{name:"Nina",gender:"f",role:"metas",es:"metas"},
  vehicle:{name:"Caio",gender:"m",role:"veículos",es:"vehículos"},
  reminder:{name:"Bia",gender:"f",role:"lembretes",es:"recordatorios"},
  drive:{name:"Dora",gender:"f",role:"arquivos e documentos",es:"archivos y documentos"},
  grocery:{name:"Lia",gender:"f",role:"compras e supermercado",es:"compras y supermercado"},
  people:{name:"Clara",gender:"f",role:"clientes e contatos",es:"clientes y contactos"},
  employee:{name:"Hugo",gender:"m",role:"funcionários",es:"empleados"},
  support:{name:"Zoe",gender:"f",role:"recepção e ajuda",es:"recepción y ayuda"},
} as const;
export type VirtualAgent = (typeof VIRTUAL_TEAM)[keyof typeof VIRTUAL_TEAM];

export function agentForIntent(intent:string):VirtualAgent {
  if (/^(bank|finance|balance|account|recurring|category)_/.test(intent)||/^(daily|weekly)_summary$/.test(intent)) return VIRTUAL_TEAM.finance;
  if (/^(agenda|meet)_/.test(intent)) return VIRTUAL_TEAM.agenda;
  if (/^(customer|contact)_/.test(intent)) return VIRTUAL_TEAM.people;
  const prefix=intent.split("_")[0];
  return prefix in VIRTUAL_TEAM ? VIRTUAL_TEAM[prefix as keyof typeof VIRTUAL_TEAM] : VIRTUAL_TEAM.support;
}

export function agentForPendingAction(pending:{type:string;intent?:string;ai?:{intent:string};resumeAi?:{intent:string}}):VirtualAgent {
  if (pending.intent||pending.ai?.intent||pending.resumeAi?.intent) return agentForIntent(pending.intent||pending.ai?.intent||pending.resumeAi!.intent);
  if (pending.type==="receipt_save"||pending.type==="image_action") return VIRTUAL_TEAM.drive;
  if (/^(invoice|financial_document|receipt|account|finance|recurring|confirm_clear_history|employee_payment|slot_correction)/.test(pending.type)) return VIRTUAL_TEAM.finance;
  if (pending.type==="appointment_selection") return VIRTUAL_TEAM.agenda;
  return agentForIntent(pending.type);
}

export function registeredFirstName(name:string):string {
  return name.replace(/[*_~`]/g,"").replace(/[\u0000-\u001f\u007f]/g," ").trim().split(/\s+/)[0].slice(0,40);
}

export function replyVirtualTeam(locale?:string):string {
  const es=locale==="es";
  const names=Object.values(VIRTUAL_TEAM).map(agent=>`• *${agent.name}* — ${es?agent.es:agent.role}`).join("\n");
  return `${es?"Esta es tu *equipo virtual de Zelo*":"Esta é sua *equipe virtual da Zelo*"}:\n\n${names}\n\n${es?"Son personajes virtuales de la misma Zelo. Envía tu pedido con naturalidad; los datos y las confirmaciones siguen siendo los de tu cuenta.":"São personagens virtuais da mesma Zelo. Pode mandar seu pedido naturalmente; os dados e as confirmações continuam sendo os da sua conta."}`;
}

export function isVirtualTeamQuestion(text:string):boolean {
  const normalized=text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[?!.,]+$/g,"");
  return /^(?:equipe|equipo|agentes|quem sao (?:os |seus )?agentes(?: da zelo)?|quem faz parte da equipe|quienes son (?:los |tus )?agentes|(?:mostre|mostrar|liste|listar|ver|conhecer) (?:a |o |os |la |el )?(?:equipe|equipo|agentes)(?: da zelo)?)$/.test(normalized);
}

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import UiIcon, { type UiIconName } from "@/components/UiIcon";
import { AGENT_SCENES } from "@/lib/landing-story";
import AgentDetails from "./AgentDetails";
import z from "./functions.module.css";
import x from "./experience.module.css";
import FeaturePreview from "./FeaturePreview";

type Feature = { icon: UiIconName; id: string; title: string; description: string; request: string; how: string; result: string };
const FEATURES: Feature[] = [
  { icon: "document", id: "fatura", title: "Faturas e planilhas", description: "Transforme um arquivo em lançamentos que você consegue conferir, em vez de digitar tudo de novo.", request: "“Importe os gastos desta fatura para o cartão da empresa.”", how: "Envie PDF, foto, CSV ou Excel. O Zelo identifica os lançamentos do documento e permite revisar os dados antes de confirmar a importação. Confira valores, datas, parcelas e possíveis duplicidades.", result: "As informações importadas entram na organização financeira da conta ou cartão escolhido, dentro do espaço correto." },
  { icon: "repeat", id: "recorrencias", title: "Parcelas e recorrências", description: "Veja os compromissos que continuam nos próximos meses, como uma compra parcelada ou uma assinatura.", request: "“Quais parcelas ainda tenho para pagar?”", how: "Consulte parcelas previstas e organize lançamentos que se repetem. Ao registrar uma recorrência, informe o valor, a frequência e o contexto do pagamento para manter a previsão organizada.", result: "Acompanhe os lançamentos recorrentes e as parcelas previstas pelo painel financeiro ou consulte pela conversa." },
  { icon: "task", id: "tarefas", title: "Tarefas", description: "Dê um lugar às pendências com prazo e prioridade, e acompanhe o que ainda falta concluir.", request: "“Crie a tarefa de enviar a proposta até sexta, com prioridade alta.”", how: "Conte o que precisa fazer. O Zelo organiza o título, o prazo e a prioridade que você informar. Depois, você pode consultar as tarefas, atualizar o andamento e marcar a conclusão.", result: "As tarefas ficam no painel e disponíveis pelo WhatsApp, no espaço pessoal ou na empresa selecionada." },
  { icon: "bell", id: "lembretes", title: "Lembretes", description: "Programe um aviso para a hora certa, uma única vez ou de forma recorrente.", request: "“Me lembre de pagar o seguro dia 20, às 9h.”", how: "Diga o assunto, a data e o horário. Para algo que se repete, informe a frequência. Se faltar uma informação necessária, complete pela conversa para que o lembrete seja programado.", result: "Receba o aviso no WhatsApp no momento programado. Consulte e ajuste os lembretes quando a sua rotina mudar." },
  { icon: "folder", id: "drive", title: "Arquivos e documentos", description: "Guarde contratos, comprovantes e outros arquivos e encontre depois pelo assunto que você lembra.", request: "“Guarde este contrato na empresa. Depois, me ajude a encontrá-lo.”", how: "Envie PDF, foto ou documento e peça para guardar. A Dora sugere nome, palavras-chave e uma pasta como Contratos ou Comprovantes. Você pode renomear o arquivo recente pela conversa e organizar as pastas no painel. Para encontrar, descreva o assunto ou algo que lembra do conteúdo.", result: "Encontre os arquivos no Drive do painel. Ao localizar um documento pela conversa, o Zelo devolve o próprio arquivo no WhatsApp. Se não encontrar, informa isso." },
  { icon: "target", id: "metas", title: "Metas", description: "Transforme um objetivo em algo que você pode acompanhar, com valor, prazo e progresso.", request: "“Quero juntar R$ 5 mil para uma viagem até dezembro.”", how: "Informe o objetivo, quanto quer alcançar e o prazo. O Zelo organiza a meta para você consultar e acompanhar o progresso conforme atualiza as informações.", result: "Tenha uma visão das metas pessoais ou da empresa e do caminho que ainda falta para cada conquista." },
  { icon: "client", id: "clientes", title: "Clientes", description: "Reúna os dados de cada cliente e as observações úteis para o próximo atendimento.", request: "“Cadastre a Ana como cliente e anote o contato dela.”", how: "Envie o nome e os dados que precisa guardar. Você pode complementar o cadastro com informações comerciais e observações, mantendo os registros no espaço da empresa.", result: "Consulte o cadastro no painel ou encontre as informações do cliente pelo WhatsApp quando precisar retomar o contato." },
  { icon: "users", id: "funcionarios", title: "Funcionários", description: "Organize quem faz parte da empresa, com cargo, salário e informações de cadastro.", request: "“Cadastre o João como assistente e registre o salário dele.”", how: "Informe os dados do funcionário, o cargo e o salário. Cada cadastro pertence à empresa selecionada, para você manter as informações da equipe no contexto correspondente.", result: "Encontre os dados da equipe no painel da empresa e consulte pela conversa. O cadastro ajuda na organização administrativa do negócio." },
  { icon: "cart", id: "supermercado", title: "Compras de supermercado", description: "Monte a lista antes de sair e mantenha o histórico de itens, preços e compras realizadas.", request: "“Adicione dois pacotes de café e um quilo de arroz à lista.”", how: "Crie e atualize listas com itens e quantidades. Durante a organização das compras, registre preços e os dados disponíveis para acompanhar o histórico e as despesas vinculadas.", result: "Consulte o que falta comprar, veja os registros anteriores e acompanhe os gastos de supermercado na organização financeira." },
  { icon: "car", id: "veiculos", title: "Veículos", description: "Acompanhe abastecimentos, manutenção e outros custos de cada veículo com a quilometragem correspondente.", request: "“Abasteci R$ 200 no carro hoje. Ele está com 42 mil km.”", how: "Selecione o veículo e informe os dados do abastecimento ou serviço. Reúna combustível, manutenções, seguro e quilometragem para manter o histórico daquele veículo.", result: "Consulte o uso e os custos de cada veículo. Organize os pessoais no seu espaço e os da frota no espaço da empresa." },
  { icon: "person", id: "contatos", title: "Contatos", description: "Mantenha à mão as pessoas e informações que fazem parte da rotina pessoal e profissional.", request: "“Guarde o telefone do eletricista para eu encontrar depois.”", how: "Envie o nome e os dados do contato que quer manter. Depois, peça a consulta pelo nome ou pelas informações registradas, sem precisar lembrar todos os detalhes.", result: "Encontre os dados pelo WhatsApp ou no painel. Use o espaço correspondente para organizar os contatos da vida pessoal e do negócio." },
  { icon: "search", id: "pesquisas", title: "Pesquisas no WhatsApp", description: "Peça ajuda para buscar informações públicas, conhecer opções e fazer comparações na conversa.", request: "“Pesquise opções deste produto e compare os preços encontrados.”", how: "Diga o que procura e os critérios importantes, como produto, local ou faixa de preço. O Zelo pode pesquisar informações públicas e apresentar os resultados disponíveis para você avaliar.", result: "Receba a pesquisa no WhatsApp e confira os detalhes nas fontes encontradas. Preços e disponibilidade são os informados na consulta e podem mudar." },
];

const GROUPS=[
  {title:"Seu dinheiro",ids:["fatura","recorrencias"]},
  {title:"Sua rotina",ids:["tarefas","lembretes","metas","supermercado","veiculos"]},
  {title:"Seus documentos",ids:["drive","pesquisas"]},
  {title:"Seu negócio",ids:["clientes","funcionarios","contatos"]},
];
const OWNERS: Record<string,string>={fatura:"finance",recorrencias:"finance",tarefas:"task",lembretes:"reminder",drive:"drive",metas:"goal",clientes:"people",funcionarios:"employee",supermercado:"grocery",veiculos:"vehicle",contatos:"people",pesquisas:"support"};
export default function FunctionsGuide() {
  const [selected,setSelected]=useState(0);
  const [details,setDetails]=useState(false);
  const feature=FEATURES[selected];
  const group=GROUPS.find(g=>g.ids.includes(feature.id))!;
  const groupIndex=GROUPS.indexOf(group);
  const owner=AGENT_SCENES.find(agent=>agent.key===OWNERS[feature.id])!;
  useEffect(()=>{const sync=()=>{const index=FEATURES.findIndex(f=>f.id===window.location.hash.slice(1));if(index>=0)setSelected(index);};sync();window.addEventListener("hashchange",sync);return()=>window.removeEventListener("hashchange",sync);},[]);
  return <div id="funcoes" className={z.lab} data-group={groupIndex}>
    <div className={z.labHeading}><div><p>12 FUNÇÕES. UM ZELO PARA CADA DETALHE.</p><h2>Um pedido simples.<br/><em>Um resultado que ajuda.</em></h2></div><p>Escolha o que você quer organizar. Veja um exemplo do pedido, o resultado e como acompanhar depois.</p></div>
    <nav className={z.labGroups} aria-label="Áreas das funções">{GROUPS.map((g,i)=><button key={g.title} type="button" aria-pressed={g===group} onClick={()=>setSelected(FEATURES.findIndex(f=>f.id===g.ids[0]))}><UiIcon name={i===0?"wallet":i===1?"calendar":i===2?"folder":"business"}/>{g.title}<span>{String(g.ids.length).padStart(2,"0")}</span></button>)}</nav>
    <div className={z.labLayout}>
      <div className={z.labNav} aria-label="Escolha uma função">{FEATURES.map((item,i)=><button key={item.id} id={item.id} type="button" hidden={!group.ids.includes(item.id)} aria-pressed={selected===i} aria-controls="detalhe-funcao" onClick={()=>setSelected(i)}><UiIcon name={item.icon}/><span>{item.title}</span><span>↗</span></button>)}</div>
      <article id="detalhe-funcao" className={z.labContent} aria-labelledby="funcao-selecionada">
        <div className={z.labWorkbench}><div className={z.labRequest}><span className={z.labCounter}>{String(selected+1).padStart(2,"0")} / 12 · {group.title.toUpperCase()}</span><h3 id="funcao-selecionada">{feature.title}</h3><p>{feature.description}</p><div className={z.labMessage}><span>01 / VOCÊ PEDE NA CONVERSA</span><blockquote>{feature.request}</blockquote><small>EXEMPLO DE PEDIDO</small></div><button type="button" className={z.labOwner} onClick={()=>setDetails(true)}><Image src={owner.portrait} alt="" width={38} height={38}/><span><small>QUEM CUIDA DESSA ESPECIALIDADE</small><b>{owner.name} <span>· {owner.role}</span></b></span><span>↗</span></button></div>
          <div className={z.labResultArea}><div className={z.labResultLabel}><span>02 / O PEDIDO GANHA UM LUGAR</span><b>↙</b></div><div className={`${x.featurePreview} ${z.labPreview}`} data-preview={feature.id}><FeaturePreview key={feature.id} kind={feature.id}/></div><p className={z.labDisclaimer}>Demonstração interativa · Dados fictícios · Nenhuma ação na sua conta</p></div>
        </div>
        <div className={z.labExplanation}><div><span>COMO FUNCIONA</span><h4>Do seu pedido à organização.</h4><p>{feature.how}</p></div><div><span>ONDE VOCÊ ACOMPANHA</span><h4>O resultado continua com você.</h4><p>{feature.result}</p></div></div>
      </article>
    </div>
    {details&&<AgentDetails agent={owner} onClose={()=>setDetails(false)}/>}
  </div>;
}

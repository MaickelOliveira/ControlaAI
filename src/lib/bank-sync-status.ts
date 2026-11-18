import {bankDate} from "./open-finance-display";
import type {BankFinancialData} from "./open-finance-report";

export type BankSyncStatus={state:"updated"|"updating"|"failed"|"authorization"|"waiting";title:string;detail:string};

/** An old successful import never overrides a current failure or expired consent. */
export function bankSyncStatus(bank:BankFinancialData|null|undefined,readError=false,now=new Date().toISOString()):BankSyncStatus|null {
 const connections=bank?.overview.connections.filter(connection=>!connection.archived_at)??[];
 if(!bank||!connections.length)return null;
 if(readError||bank.overview.truncated||bank.report.sync_status==="failed")return {state:"failed",title:"Falha na atualização",detail:"Os dados podem estar desatualizados. Confira em Contas."};
 if(connections.some(connection=>connection.revoked_at||["expired","revoked","error","revoking"].includes(connection.status)||(connection.consent_expires_at&&Date.parse(connection.consent_expires_at)<=Date.parse(now))))return {state:"authorization",title:"Conexão precisa de atenção",detail:"Há banco sem autorização ativa. Confira em Contas."};
 if(bank.report.sync_status==="updating"||(!bank.report.sync_status&&bank.overview.sync.some(job=>job.status==="pending"||job.status==="running")))return {state:"updating",title:"Atualizando bancos",detail:"Importação em andamento."};
 const incomplete=connections.find(connection=>connection.sync_notes?.some(note=>["SOURCE_PARTIAL","AWAITING_RESOURCES","RESOURCES_PENDING"].includes(note)));
 if(incomplete)return {state:"waiting",title:"Banco complementando dados",detail:`${incomplete.institution_name}: os dados recebidos podem ser usados. Novos dados chegam automaticamente.`};
 const unsupported=connections.find(connection=>connection.sync_notes?.includes("UNSUPPORTED_CREDIT_DETAILS"));
 if(unsupported)return {state:"waiting",title:"Dados disponíveis",detail:`${unsupported.institution_name}: alguns produtos não são disponibilizados pela integração.`};
 if(!bank.report.sync_status&&bank.report.sync_pending)return {state:"failed",title:"Atualização pendente",detail:"Não foi possível confirmar a importação. Confira em Contas."};
 if(connections.some(connection=>connection.status!=="active"||!connection.last_successful_sync_at))return {state:"waiting",title:"Aguardando dados do banco",detail:"Confira a autorização e a primeira importação em Contas."};
 const oldest=connections.map(connection=>connection.last_successful_sync_at!).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
 return {state:"updated",title:"Bancos sincronizados",detail:`Última importação: ${bankDate(oldest)}`};
}

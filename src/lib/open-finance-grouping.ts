import type { BankOverview, BankResource } from "./open-finance-display";
export function groupBankResources(data:BankOverview):Array<{id:string;name:string;resources:BankResource[]}> {
  const groups=new Map<string,{id:string;name:string;resources:BankResource[]}>();
  for(const resource of data.resources){
    const connection=data.connections.find(c=>c.id===resource.connection_id);
    const name=connection?.institution_name??"Banco conectado";
    const id=connection?.institution_id??(connection?name:resource.connection_id);
    if(!groups.has(id))groups.set(id,{id,name,resources:[]});
    groups.get(id)!.resources.push(resource);
  }
  return [...groups.values()];
}

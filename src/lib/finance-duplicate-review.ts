import type {LedgerEntry} from "./finance-ledger";
const signature=(entry:LedgerEntry)=>`${entry.date}|${entry.type}|${Math.round(entry.amount*100)}`;
/** Matching date/amount is a review clue, never sufficient to remove a record.
 * Include counterparts hidden by category/bank filters for an honest comparison. */
export function financeDuplicateGroups(entries:readonly LedgerEntry[],visibleEntries:readonly LedgerEntry[]=entries){
 const wanted=new Set(visibleEntries.filter(row=>row.possibleDuplicate).map(signature));
 const groups=new Map<string,LedgerEntry[]>();
 for(const row of entries){
  if(!row.possibleDuplicate||!row.included||row.status==="pending"||!wanted.has(signature(row)))continue;
  const key=signature(row),group=groups.get(key)??[];
  if(!group.some(entry=>entry.id===row.id))group.push(row);
  groups.set(key,group);
 }
 return [...groups.entries()].filter(([,rows])=>rows.length>1&&rows.some(row=>row.source==="bank")&&rows.some(row=>row.source!=="bank")).map(([key,entries])=>({key,entries})).sort((a,b)=>b.entries[0].date.localeCompare(a.entries[0].date));
}

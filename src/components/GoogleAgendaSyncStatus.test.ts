import React,{type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import GoogleAgendaSyncStatus from "./GoogleAgendaSyncStatus";
import type {GoogleAgendaAppointment} from "@/lib/google-agenda-client-contract";
import type {GoogleAgendaConflictActions,GoogleAgendaConflictChoice} from "@/lib/google-agenda-client";
const record={id:"11111111-1111-4111-8111-111111111111",title:"Fixture",startAt:"2026-10-20T12:00:00Z",allDay:false,repeat:"none",status:"scheduled",source:"web",createdAt:"2026-10-14T12:00:00Z",googleSyncVersion:"v1:1:0:0",googleSyncState:"failed",googleSyncFailureCode:"ETAG_CONFLICT",googleMeetPending:false,googleCancellationPending:false} as GoogleAgendaAppointment;
const choice=Object.freeze({appointmentId:record.id,expectedGoogleSyncVersion:record.googleSyncVersion!,canOverwrite:true,cancellation:false});
function actions(selected:GoogleAgendaConflictChoice|null):GoogleAgendaConflictActions{return {choice:selected,check:vi.fn<(row:GoogleAgendaAppointment)=>Promise<boolean>>().mockResolvedValue(true),confirm:vi.fn<(choice:GoogleAgendaConflictChoice)=>Promise<GoogleAgendaAppointment|null>>().mockResolvedValue(record),cancel:vi.fn<()=>void>()};}
function findButton(node:ReactNode,label:string):React.ReactElement<Record<string,unknown>>|null{
 for(const child of React.Children.toArray(node)){
  if(!React.isValidElement<Record<string,unknown>>(child))continue;
  if(child.type==="button"&&child.props.children===label)return child;
  const nested=findButton(child.props.children as ReactNode,label);if(nested)return nested;
 }return null;
}
function click(node:ReactNode,label:string){const button=findButton(node,label);expect(button).not.toBeNull();(button!.props.onClick as ()=>void)();}
beforeEach(()=>{vi.stubGlobal("React",React);});
afterEach(()=>{vi.unstubAllGlobals();});
it.each([["pt-BR","Revisar alteração"],["pt-PT","Revisar alteração"],["es","Revisar el cambio"]] as const)("%s conflict review does not implicitly retry or submit consent",(locale,label)=>{
 const handlers=actions(null),retry=vi.fn(),node=GoogleAgendaSyncStatus({appointment:record,conflictActions:handlers,onRetry:retry,locale});
 expect(findButton(node,label)).not.toBeNull();expect(findButton(node,"Confirmar")).toBeNull();expect(handlers.check).not.toHaveBeenCalled();expect(handlers.confirm).not.toHaveBeenCalled();expect(retry).not.toHaveBeenCalled();click(node,label);expect(handlers.check).toHaveBeenCalledExactlyOnceWith(record);expect(handlers.confirm).not.toHaveBeenCalled();expect(retry).not.toHaveBeenCalled();
});
it.each([["pt-BR","você fez na Zelo","Voltar"],["pt-PT","fez na Zelo","Voltar"],["es","hiciste en Zelo","Volver"]] as const)("%s presents a plain warning and the two human choices",(locale,word,back)=>{
 const handlers=actions(choice),node=GoogleAgendaSyncStatus({appointment:record,conflictActions:handlers,locale}),html=renderToStaticMarkup(node);expect(html).toContain(word);expect(findButton(node,"Confirmar")).not.toBeNull();expect(findButton(node,back)).not.toBeNull();expect(handlers.confirm).not.toHaveBeenCalled();click(node,"Confirmar");expect(handlers.confirm).toHaveBeenCalledExactlyOnceWith(choice);
});
it("false conference eligibility offers no overwrite confirmation and Back only dismisses the choice",()=>{
 const handlers=actions({...choice,canOverwrite:false}),node=GoogleAgendaSyncStatus({appointment:{...record,googleMeetPending:true},conflictActions:handlers,locale:"pt-BR"});expect(findButton(node,"Confirmar")).toBeNull();expect(renderToStaticMarkup(node)).toContain("Não é possível aplicar este pedido");click(node,"Voltar");expect(handlers.cancel).toHaveBeenCalledOnce();expect(handlers.confirm).not.toHaveBeenCalled();
});
it("cancellation warns about deleting the Google version instead of treating it as an ordinary edit",()=>{
 const handlers=actions({...choice,cancellation:true}),node=GoogleAgendaSyncStatus({appointment:{...record,status:"cancelled",googleCancellationPending:true},conflictActions:handlers,locale:"pt-BR"});expect(renderToStaticMarkup(node)).toContain("Confirmar o cancelamento pode apagar");
});
it("a refreshed row still confirms exactly the original choice and never constructs one from new metadata",()=>{
 const handlers=actions(choice),node=GoogleAgendaSyncStatus({appointment:{...record,googleSyncVersion:"v1:1:2:0",googleSyncState:"waiting"},conflictActions:handlers,locale:"pt-BR"});click(node,"Confirmar");expect(handlers.confirm).toHaveBeenCalledExactlyOnceWith(choice);expect(handlers.check).not.toHaveBeenCalled();
});
it("an eligibility query can be backed out of, while a submitted confirmation cannot be clicked again when busy",()=>{
 const reading=GoogleAgendaSyncStatus({appointment:record,conflictActions:actions({...choice,canOverwrite:null}),locale:"pt-BR",busy:true});expect(findButton(reading,"Confirmar")).toBeNull();expect(findButton(reading,"Voltar")?.props.disabled).toBe(false);
 const submitting=GoogleAgendaSyncStatus({appointment:record,conflictActions:actions(choice),locale:"pt-BR",busy:true});expect(findButton(submitting,"Confirmar")?.props.disabled).toBe(true);expect(findButton(submitting,"Voltar")?.props.disabled).toBe(true);
});
it("another appointment's choice is not rendered as permission to confirm this event",()=>{
 const node=GoogleAgendaSyncStatus({appointment:record,conflictActions:actions({...choice,appointmentId:"22222222-2222-4222-8222-222222222222"}),locale:"pt-BR"});expect(findButton(node,"Confirmar")).toBeNull();expect(findButton(node,"Revisar alteração")).not.toBeNull();
});

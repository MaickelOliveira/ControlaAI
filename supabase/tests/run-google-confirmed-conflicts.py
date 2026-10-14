#!/usr/bin/env python3
"""Explicit ETag conflict confirmation on disposable PG and fictitious rows."""
import importlib.util
import pathlib
import traceback
spec=importlib.util.spec_from_file_location('user_fixture',pathlib.Path(__file__).with_name('run-google-event-user-mutations.py'))
q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q)
j,b,s=q.j,q.b,q.s
REPO,quote,check,MIGRATOR=q.REPO,q.quote,q.check,q.MIGRATOR
NAME='20261013210000_google_confirmed_conflicts.sql'
TABLE='google_workspace.event_etag_confirmations'
GET='public.zelo_google_event_conflict_get(uuid,text,uuid,uuid,uuid,text)'
SAVE='public.zelo_google_event_conflict_confirm(uuid,text,uuid,uuid,uuid,text,uuid,text,bigint,text)'
def read_receipt(store,event,index,expected):return store.command('event_conflict_get',event,j.op(index),expected)
def confirm(store,event,index,expected,operation,etag='"fictitious-fresh"',version=None):return store.command('event_conflict_confirm',event,j.op(index),expected,operation,b.CLIENT,store.binding()['version'] if version is None else version,etag)
def failed(store,index,kind='update'):
    event=j.created(store,index);store.fixture.read(q.prepare(store,event,index,q.token(store,event),kind),'service_role')
    lease=j.claim(store,event,index);store.fixture.read(j.finish(store,lease,'failed',error='ETAG_CONFLICT'),'service_role');return event
def rows(f):return f.sql("select coalesce(jsonb_agg(to_jsonb(c) order by mutation_id),'[]') from "+TABLE+' c;')
def verify(f,baseline):
    f.sql((REPO/'supabase/migrations'/q.NAME).read_text(),MIGRATOR)
    store=b.Store(f);store.save(subject='fictitious-confirmed-conflict');event=failed(store,1);expected=q.token(store,event)
    if baseline:
        f.read(read_receipt(store,event,100,expected),'service_role');check(False,'RED: conflict receipt API exists');return
    before=q.google(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((q.google(f),b.snapshot(f),s.legacy_snapshot(f))==before,'Migration changed history/credentials')
    for signature in [GET,SAVE,'google_workspace.event_command_metadata(google_workspace.event_commands)']:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Confirmation elevated privileges/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited conflict API')
    check(f.sql('select relrowsecurity from pg_class where oid='+quote(TABLE)+'::regclass;')=='t','Confirmation lacks RLS')
    for role in ['anon','authenticated']:
        check(f.sql('select has_table_privilege('+quote(role)+','+quote(TABLE)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser inherited confirmations');f.rejected(confirm(store,event,100,expected,j.op(1)),'Browser confirmed provider conflict',role)
    for privilege in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:check(f.sql("select has_table_privilege('service_role',"+quote(TABLE)+','+quote(privilege)+');')=='f','Backend can mutate confirmation history')
    check(f.read(read_receipt(store,event,100,expected),'service_role') is None,'Receipt inferred a confirmation')
    original=f.sql('select expected_etag from google_workspace.event_commands where operation_id='+quote(j.op(1))+';')
    result=f.read(confirm(store,event,100,expected,j.op(1)),'service_role');ref={'event_id':event,'operation_id':j.op(1)}
    check(result==ref,'Confirmation exposed private/provider metadata')
    command=f.read(store.command('event_command_get',event,j.op(1)),'service_role')
    check(command['state']=='queued' and command['expected_etag']=='"fictitious-fresh"','Confirmation did not reset original operation with verified ETag')
    check(command['operation_id']==j.op(1) and command['conference_request_id'] is None,'Confirmation changed identity/conference')
    check(f.sql('select expected_etag from google_workspace.event_commands where operation_id='+quote(j.op(1))+';')==original,'Confirmation changed immutable journal input')
    before=q.google(f),rows(f),q.receipts(f),b.snapshot(f)
    check(f.read(confirm(store,event,100,expected,j.op(1),etag='ignored-replay'),'service_role')==ref,'Lost confirmation reply required latest token')
    check(f.read(read_receipt(store,event,100,expected),'service_role')==ref,'Receipt getter lost original intent')
    check((q.google(f),rows(f),q.receipts(f),b.snapshot(f))==before,'Replay reset attempts or changed ETag again')
    f.rejected(confirm(store,event,100,q.token(store,event),j.op(1)),'Confirmation UUID accepted changed original revision','service_role')
    f.rejected(confirm(store,event,101,expected,j.op(1)),'New confirmation accepted stale revision','service_role')
    # The original identity is recoverable after a successful worker or unlink.
    lease=j.claim(store,event,1,f.read(store.command('event_command_get',event,j.op(1)),'service_role')['attempt_version']);f.read(j.finish(store,lease,'succeeded',etag='"fictitious-committed"'),'service_role')
    check(f.read(read_receipt(store,event,100,expected),'service_role')==ref,'Worker progress lost confirmation acknowledgment')
    f.read(store.command('binding_unlink',store.binding()['version']),'service_role')
    check(f.read(confirm(store,event,100,expected,j.op(1)),'service_role')==ref,'Replay unnecessarily required removed credentials')
    store.save(subject='fictitious-confirmed-conflict',grant_version=store.grant('fictitious-confirmed-conflict')['version'],binding_version=store.binding()['version']);deletion=failed(store,2,'delete');token=q.token(store,deletion)
    check(f.read(confirm(store,deletion,102,token,j.op(2)),'service_role')=={'event_id':deletion,'operation_id':j.op(2)},'Delete confirmation lost original canceled record')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-personal-confirmation')
    for other in [personal,b.Store(f,company=s.COMPANY_B),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:f.rejected(read_receipt(other,event,100,expected),'Confirmation crossed owner/workspace','service_role')
    # Conference identities are never overridden by this update/delete boundary.
    conference=j.created(store,3);f.read(q.prepare(store,conference,3,q.token(store,conference),'conference'),'service_role');lease=j.claim(store,conference,3);f.read(j.finish(store,lease,'failed',error='ETAG_CONFLICT'),'service_role')
    f.rejected(confirm(store,conference,103,q.token(store,conference),j.op(3)),'Conflict confirmation replaced/resent a conference','service_role')
    target=failed(store,4);token=q.token(store,target)
    for etag in [None,'','bad\ntag','x'*1025]:f.rejected(confirm(store,target,104,token,j.op(4),etag),'Malformed provider ETag accepted','service_role')
    f.rejected(confirm(store,target,104,token,j.op(4),version=0),'Changed connection accepted confirmation','service_role')
    before=q.google(f),rows(f),q.receipts(f)
    f.sql("create function public.fixture_reject_confirm() returns trigger language plpgsql as $$begin raise exception 'FICTITIOUS_FAILURE';end;$$;create trigger fixture_reject_confirm before update on google_workspace.event_commands for each row execute function public.fixture_reject_confirm();")
    f.rejected(confirm(store,target,104,token,j.op(4)),'Failed retry left half a confirmation','service_role');check((q.google(f),rows(f),q.receipts(f))==before,'Confirmation/retry was not atomic')
    f.sql('drop trigger fixture_reject_confirm on google_workspace.event_commands;drop function public.fixture_reject_confirm();')
    target_confirmation=confirm(store,target,104,token,j.op(4))
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');f.rejected(read_receipt(store,event,100,expected),'Inactive owner read confirmation','service_role');f.rejected(target_confirmation,'Inactive owner confirmed overwrite','service_role')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');f.rejected(read_receipt(store,event,100,expected),'Archived company retained confirmation authority','service_role');f.sql('update public.companies set archived_at=null where id='+quote(s.COMPANY_A)+';')
    before=q.google(f),rows(f),q.receipts(f),b.snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((q.google(f),rows(f),q.receipts(f),b.snapshot(f))==before,'Rollback removed original/confirmed history');f.rejected(confirm(store,target,104,token,j.op(4)),'Rollback retained overwrite API','service_role')
    print('PASS explicit Google conflict confirmations: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
if __name__=='__main__':
    try:
        # Reuse only the parent's fresh disposable setup, not its scenario/rollback.
        q.verify=verify;q.main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);where=next((f for f in reversed(frames) if pathlib.Path(f.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+where.name+':'+str(where.lineno) if where else ''),flush=True);raise SystemExit(1) from None

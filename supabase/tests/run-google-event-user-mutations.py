#!/usr/bin/env python3
"""Confirmed snapshot mutations on disposable PostgreSQL, fictitious data only."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback
spec=importlib.util.spec_from_file_location('receipt_fixture',pathlib.Path(__file__).with_name('run-google-local-appointment-receipts.py'))
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
a,j,x,l,c,o,b,s=d.a,d.j,d.x,d.l,d.c,d.o,d.b,d.s
REPO,quote,check,MIGRATOR=d.REPO,d.quote,d.check,d.MIGRATOR
NAME='20261013190000_google_event_user_mutations.sql'
RELATION='google_workspace.event_user_retries'
TABLES=[RELATION,'google_workspace.event_user_commands','google_workspace.event_user_local_mutations']
FUNCTIONS=['google_workspace.event_user_snapshot(uuid,text,uuid,uuid)',
 'public.zelo_google_event_command_prepare_expected(uuid,text,uuid,uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
 'public.zelo_google_event_user_retry_get(uuid,text,uuid,uuid,uuid,text)',
 'public.zelo_google_event_user_retry(uuid,text,uuid,uuid,uuid,text,text,bigint)',
 'public.zelo_google_appointment_local_patch(uuid,text,uuid,uuid,uuid,text,jsonb,jsonb)']
def snapshot(store,event):return store.fixture.read(store.command('appointment_rows',event,1),'service_role')[0]
def token(store,event):return snapshot(store,event)['google_sync_version']
def prepare(store,event,index,expected,kind='update',payload=None):
    return store.command('event_command_prepare_expected',event,j.op(index),expected,b.CLIENT,store.binding()['version'],kind,json.dumps(j.CHANGE if payload is None else payload) if kind=='update' else None,json.dumps([]) if kind=='update' else None)
def retry(store,event,index,expected):return store.command('event_user_retry',event,j.op(index),expected,b.CLIENT,store.binding()['version'])
def retry_get(store,event,index,expected):return store.command('event_user_retry_get',event,j.op(index),expected)
PATCH_INDEX=2000
def patch(store,event,expected,payload=None,metadata=None,index=None):
    global PATCH_INDEX
    if index is None:PATCH_INDEX+=1;index=PATCH_INDEX
    return store.command('appointment_local_patch',event,j.op(index),expected,None if payload is None else json.dumps(payload),json.dumps({} if metadata is None else metadata))
def google(f):return o.origins(f),c.snapshot(f),l.all_rows(f)[-1],j.snapshot(f)[1:]
def receipts(f):return tuple(f.sql("select coalesce(jsonb_agg(to_jsonb(r) order by event_id),'[]') from "+table+' r;') for table in TABLES)
def verify(f,baseline):
    store=b.Store(f);store.save(subject='fictitious-user-mutation');event=j.created(store,1);original=token(store,event)
    if baseline:
        f.read(prepare(store,event,1,original),'service_role');check(False,'RED: expected snapshot wrapper exists');return
    before=a.protected(f);f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR);check(a.protected(f)==before,'User mutation migration changed existing history/credentials')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','User wrapper elevates rights/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited mutation wrapper')
    for table in TABLES:
        check(f.sql('select relrowsecurity from pg_class where oid='+quote(table)+'::regclass;')=='t','Mutation receipt lacks RLS')
        for role in ['anon','authenticated']:
            check(f.sql('select has_table_privilege('+quote(role)+','+quote(table)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser inherited receipts');f.rejected(prepare(store,event,1,original),'Browser prepared confirmed command',role)
        for privilege in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:check(f.sql("select has_table_privilege('service_role',"+quote(table)+','+quote(privilege)+');')=='f','Backend mutable receipt')
    command=f.read(prepare(store,event,1,original),'service_role');check(command['head_version']=='1','Expected command not journaled');queued_token=token(store,event)
    claimed=j.claim(store,event,1);current=token(store,event);check(current!=original,'Fixture attempt did not advance')
    before=j.snapshot(f);f.rejected(prepare(store,event,2,original),'Stale full revision adopted new head','service_role');check(j.snapshot(f)==before,'Rejected snapshot changed journals')
    # The same immutable command repeats after response loss and worker progress.
    check(f.read(prepare(store,event,1,original),'service_role')['operation_id']==j.op(1),'Lost command reply demanded latest revision')
    f.rejected(prepare(store,event,1,original,payload=dict(j.CHANGE,summary='Different')),'Command UUID accepted changed intention','service_role')
    f.read(j.finish(store,claimed,'retry',error='TEMPORARY'),'service_role');expected=token(store,event)
    f.rejected(prepare(store,event,2,queued_token),'Stale command attempt adopted unchanged head revision','service_role')
    f.rejected(prepare(store,event,1,'v1:2:0:0'),'Stored command accepted changed original full token','service_role')
    reference=f.read(retry(store,event,100,expected),'service_role');check(reference=={'event_id':event,'operation_id':j.op(1)},'Retry revealed private payload/credentials or lost operation')
    after=token(store,event);check(after!=expected,'Explicit command retry did not advance CAS')
    check(f.read(retry_get(store,event,100,expected),'service_role')==reference,'Retry receipt getter did not preserve identity')
    before=j.snapshot(f),receipts(f);check(f.read(retry(store,event,100,expected),'service_role')==reference and (j.snapshot(f),receipts(f))==before,'Lost retry reply reset rounds again')
    f.rejected(retry(store,event,100,after),'Receipt UUID accepted changed original expectation','service_role');f.rejected(retry(store,event,101,expected),'New retry UUID accepted stale revision','service_role')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-personal-user-mutation')
    for other in [personal,b.Store(f,company=s.COMPANY_B),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:
        f.rejected(retry_get(other,event,100,expected),'Retry receipt crossed scope','service_role')
    creation=x.prepare(personal,2);f.read(x.finish(personal,creation,'retry',known=False,etag=None,error='TEMPORARY'),'service_role');expected=token(personal,creation['event_id'])
    f.sql("create function public.fixture_reject_retry() returns trigger language plpgsql as $$begin raise exception 'FICTITIOUS_FAILURE';end;$$;create trigger fixture_reject_retry before insert on "+RELATION+' for each row execute function public.fixture_reject_retry();');before=j.snapshot(f),receipts(f)
    f.rejected(retry(personal,creation['event_id'],104,expected),'Retry receipt insert failure swallowed','service_role');check((j.snapshot(f),receipts(f))==before,'Failed retry receipt advanced private attempts');f.sql('drop trigger fixture_reject_retry on '+RELATION+';drop function public.fixture_reject_retry();')
    refs=o.race(f,[retry(personal,creation['event_id'],102,expected)]*8);check(all(ok for ok,_ in refs) and len({value for _,value in refs})==1,'Concurrent explicit retry repeated rounds or deadlocked')
    check(f.read(retry_get(personal,creation['event_id'],102,expected),'service_role')['operation_id'] is None,'Creation retry inferred command identity')
    # A current command makes the older creation revision unusable.
    before=j.snapshot(f);f.rejected(retry(store,event,103,original),'Creation retry crossed command head','service_role');check(j.snapshot(f)==before,'Invalid creation retry changed active command')
    local=l.eid(3);f.read(d.create(personal,local),'service_role');before=google(f),b.snapshot(f)
    f.read(patch(personal,local,None,payload=dict(l.PAYLOAD,summary='Local changed'),metadata={'status':'done','ata_content':'Local minutes'},index=200),'service_role')
    check(snapshot(personal,local)['title']=='Local changed' and snapshot(personal,local)['status']=='done','Local controlled/metadata edit not applied')
    check((google(f),b.snapshot(f))==before,'Local-only edit consulted/mutated Google')
    f.read(patch(personal,local,None,payload=dict(l.PAYLOAD,summary='Newer local edit'),index=201),'service_role');before=l.rows(f)
    f.read(patch(personal,local,None,payload=dict(l.PAYLOAD,summary='Local changed'),metadata={'status':'done','ata_content':'Local minutes'},index=200),'service_role')
    check(l.rows(f)==before,'Lost local patch reply overwrote newer local edit')
    f.rejected(patch(personal,local,None,payload=l.PAYLOAD,index=200),'Local mutation UUID accepted changed original intention','service_role')
    f.read(patch(personal,local,None,metadata={'status':'cancelled'}),'service_role');check(snapshot(personal,local)['status']=='cancelled','Local cancel removed/failed history')
    check(d.get(personal,local) is not None,'Local cancel erased immutable receipt')
    # Exact metadata update on linked rows does not send any provider operation.
    current=token(store,event);before=google(f),b.snapshot(f);f.read(patch(store,event,current,metadata={'ata_generated':True,'ata_content':'Minutes','reminder_sent_at':'2070-01-01T10:00:00Z'}),'service_role');check((google(f),b.snapshot(f))==before,'Metadata changed provider journal')
    for payload,metadata in [(l.PAYLOAD,{}),(None,{'status':'cancelled'}),(None,{'provider_id':'bad'})]:f.rejected(patch(store,event,token(store,event),payload,metadata),'Linked controlled/provider fallback accepted','service_role')
    f.rejected(patch(store,event,None,metadata={'ata_content':'Stale'}),'Null expectation accepted linked revision','service_role')
    for payload,metadata in [(dict(l.PAYLOAD,withMeet=True),{}),(dict(l.PAYLOAD,summary=''),{}),(None,{'ata_generated':'true'}),(None,{'status':'ended'}),(None,{'source':'web'}),(None,{'reminder_sent_at':'bad'})]:f.rejected(patch(personal,local,None,payload,metadata),'Malformed local patch accepted','service_role')
    f.sql('update public.appointments set workspace_legacy=true where id='+quote(event)+';');f.rejected(patch(personal,event,None,payload=l.PAYLOAD),'Hidden private origin allowed local controlled fallback','service_role');f.sql('update public.appointments set workspace_legacy=false where id='+quote(event)+';')
    # Personal visibility of mapped legacy history does not infer Google authority.
    f.read(patch(personal,l.eid(900),None,payload=dict(l.PAYLOAD,summary='Legacy local edit')),'service_role');check(snapshot(personal,l.eid(900))['google_sync_state']=='legacy','Legacy history acquired provider provenance')
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');f.rejected(patch(personal,local,None,metadata={'ata_content':'Denied'}),'Inactive owner mutated local metadata','service_role');f.rejected(retry_get(store,event,100,original),'Inactive owner read retry receipt','service_role')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';');f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');f.rejected(patch(personal,l.eid(900),None,metadata={'ata_content':'Denied'}),'Archived mapped legacy company remained mutable','service_role')
    foreign=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY);foreign.save(subject='fictitious-user-receipt-erasure');erased=j.created(foreign,90);f.read(prepare(foreign,erased,190,token(foreign,erased)),'service_role');lease=j.claim(foreign,erased,190);f.read(j.finish(foreign,lease,'retry',error='TEMPORARY'),'service_role');f.read(retry(foreign,erased,191,token(foreign,erased)),'service_role');f.read(patch(foreign,erased,token(foreign,erased),metadata={'ata_content':'Fictitious'},index=192),'service_role');f.sql('delete from public.users where id='+quote(s.OTHER)+';')
    for table in TABLES:check(f.sql('select not exists(select 1 from '+table+' where user_id='+quote(s.OTHER)+');')=='t','Account erasure left user receipt data')
    before=j.snapshot(f),receipts(f),b.snapshot(f),d.receipts(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check((j.snapshot(f),receipts(f),b.snapshot(f),d.receipts(f))==before,'Wrapper rollback destroyed original history');f.rejected(patch(personal,local,None,metadata={'ata_content':'Closed'}),'Rollback kept local mutation open','service_role')
    print('PASS confirmed event mutations: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--activation-migration',type=pathlib.Path,default=REPO/'supabase/migrations/20261013120000_google_owner_activation.sql');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-local-receipts-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            # Match real owner-erasure cascades omitted by minimal OAuth bootstrap.
            f.sql('alter table public.companies drop constraint companies_user_id_fkey;alter table public.companies add foreign key(user_id) references public.users(id) on delete cascade;alter table public.google_tokens drop constraint google_tokens_user_id_fkey;alter table public.google_tokens add foreign key(user_id) references public.users(id) on delete cascade;')
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';grant trigger on public.google_tokens to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);x.guard_triggers(f)
            for name in [l.NAME,x.NAME,j.NAME,'20261013150000_google_event_readmodel.sql']:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql(args.activation_migration.read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/a.NAME).read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/d.NAME).read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""One scoped local/synchronization snapshot on disposable PostgreSQL, fake rows."""
import argparse
import concurrent.futures
import importlib.util
import json
import pathlib
import tempfile
import traceback

spec=importlib.util.spec_from_file_location('commands',pathlib.Path(__file__).with_name('run-google-event-commands.py'))
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)
x,l,c,o,b,s=j.x,j.l,j.c,j.o,j.b,j.s
REPO,quote,check,MIGRATOR=j.REPO,j.quote,j.check,j.MIGRATOR
NAME='20261013150000_google_event_readmodel.sql'
FUNCTIONS=['google_workspace.event_read_sync(google_workspace.event_creations,google_workspace.event_command_heads,google_workspace.event_commands,text,boolean,boolean)',
 'public.zelo_google_appointment_rows(uuid,text,uuid,uuid,integer)','public.zelo_google_meet_rows(uuid,text,uuid,uuid,integer)']
SYNC=['google_sync_version','google_sync_state','google_sync_failure_code','google_meet_pending','google_cancellation_pending']
def read_sql(store,event=None,limit=1000,meet=False):return store.command('meet_rows' if meet else 'appointment_rows',event,str(limit))
def rows(store,**kwargs):return store.fixture.read(read_sql(store,**kwargs),'service_role')
def by_id(store,event,meet=False):
    result=rows(store,event=event,meet=meet);check(len(result)==1,'Specific visible row missing/duplicated');return result[0]
def verify(f,baseline):
    a=b.Store(f);a.save(subject='fictitious-readmodel');event=j.created(a,1,True)
    if baseline:
        rows(a);check(False,'RED: read snapshot RPC already exists');return
    protected=j.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((j.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==protected,'Readmodel migration changed history/credentials/ACLs')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Readmodel helper elevated rights/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser got private snapshot RPC')
        check(f.sql("select has_function_privilege('service_role',"+quote(signature)+",'EXECUTE');")=='t','Backend missing readmodel RPC')
    before=j.snapshot(f);appointment=by_id(a,event);meet=by_id(a,event,True)
    for row in [appointment,meet]:
        check(row['google_sync_version']=='v1:1:0:0' and row['google_sync_state']=='succeeded','Initial exact creation version/state missing')
        check(row['google_sync_failure_code'] is None and not row['google_meet_pending'] and not row['google_cancellation_pending'],'Finished row received pending/diagnostic state')
        check(not any(key in row for key in ['etag','payload','binding_id','grant_id','client_fingerprint','lease_id','access_token']),'Snapshot exposed private metadata')
    check(j.snapshot(f)==before,'Read snapshot mutated rows')
    for role in ['anon','authenticated']:f.rejected(read_sql(a),'Browser executed snapshot',role)
    other=b.Store(f,company=s.COMPANY_B);other.save(subject='fictitious-read-other');check(rows(other,event=event)==[],'Other company read exact event')
    foreign=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY);foreign.save(subject='fictitious-read-foreign');check(rows(foreign,event=event)==[],'Other owner read exact event')
    f.rejected(read_sql(b.Store(f,company=s.FOREIGN_COMPANY)),'Owner selected another owner company','service_role')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-read-personal');check(rows(personal,event=event)==[],'Personal read nonlegacy company event')
    legacy=l.eid(900);old=by_id(a,legacy);check(old['workspace_legacy'] and old['google_sync_version'] is None and old['google_sync_state']=='legacy','Legacy row acquired private origin authority')
    check(by_id(personal,legacy)['id']==legacy,'Personal historical visibility was lost')
    old_meet=by_id(personal,l.eid(901),True);check(old_meet['workspace_legacy'] and old_meet['google_sync_state']=='legacy' and old_meet['google_sync_version'] is None,'Historical Meet acquired inferred private authority')
    local=l.eid(80);f.sql("insert into public.appointments(id,user_id,company_id,workspace_legacy,title,start_at,status) values("+quote(local)+','+quote(s.OWNER)+",null,false,'Fictitious manual event','2070-01-01','scheduled');")
    manual=by_id(personal,local);check(manual['google_sync_state']=='local' and manual['google_sync_version'] is None,'Local manual event gained Google revision')
    unverified=l.eid(81);f.sql("insert into public.appointments(id,user_id,company_id,workspace_legacy,title,start_at,calendar_event_id) values("+quote(unverified)+','+quote(s.OWNER)+",null,false,'Fictitious unverified old event','2070-01-01','fictitious-unverified-public-id');")
    old_remote=by_id(personal,unverified);check(old_remote['google_sync_state']=='legacy' and old_remote['google_sync_version'] is None and not old_remote['google_meet_pending'],'Public calendar ID became private effect authority')
    queued=l.eid(2);l.call(a,queued,kind='meet',payload=dict(l.PAYLOAD,withMeet=True));pending=by_id(a,queued);check(pending['google_sync_version']=='v1:0:0:0' and pending['google_sync_state']=='queued' and pending['google_meet_pending'],'Queued Meet lost pending/version')
    lease=c.call(a,'claim',queued,0);running=by_id(a,queued);check(running['google_sync_version']=='v1:1:0:0' and running['google_sync_state']=='running','Creation claim version not captured with local row')
    f.read(x.finish(a,lease,'waiting'),'service_role');check(by_id(a,queued)['google_sync_state']=='waiting' and by_id(a,queued,True)['google_meet_pending'],'Waiting Meet state differs across linked rows')
    f.read(j.prepare(a,event,1,payload=dict(j.CHANGE,summary='New desired title')),'service_role');edited=by_id(a,event)
    check(edited['title']=='🎥 New desired title' and edited['google_sync_version']=='v1:1:1:0' and edited['google_sync_state']=='queued','Read separated desired fields from command head revision')
    claimed=j.claim(a,event,1);check(by_id(a,event)['google_sync_version']=='v1:1:1:1','Command attempt version missing')
    f.read(j.finish(a,claimed,'failed',etag=None,error='ETAG_CONFLICT'),'service_role');failed=by_id(a,event);check(failed['google_sync_state']=='failed' and failed['google_sync_failure_code']=='ETAG_CONFLICT' and not failed['google_meet_pending'],'Failure replaced controlled row/pending state')
    f.read(j.prepare(a,event,2,'delete','1'),'service_role');canceled=by_id(a,event)
    check(canceled['status']=='cancelled' and canceled['google_cancellation_pending'] and canceled['google_sync_version']=='v1:1:2:0','Unresolved cancellation is invisible/missing revision')
    check(any(row['id']==event for row in rows(a)),'Unresolved cancellation missing from list')
    deleting=j.claim(a,event,2);f.read(j.finish(a,deleting,'failed',etag=None,error='TEMPORARY'),'service_role');check(by_id(a,event)['google_cancellation_pending'],'Failed cancellation disappeared before retry')
    f.read(a.command('event_command_retry',event,j.op(2),b.CLIENT,a.binding()['version'],'1'),'service_role');deleting=j.claim(a,event,2,'2');f.read(j.finish(a,deleting,etag=None),'service_role')
    check(not any(row['id']==event for row in rows(a)),'Completed canceled history stayed in list');check(by_id(a,event)['status']=='cancelled' and not by_id(a,event)['google_cancellation_pending'],'Specific GET lost canceled linked history')
    f.sql("update public.appointments set status='cancelled' where id="+quote(local)+';');check(rows(personal,event=local)[0]['google_sync_state']=='local' and not any(row['id']==local for row in rows(personal)),'Canceled manual visibility changed')
    add=j.created(personal,3);f.read(j.prepare(personal,add,3,'conference'),'service_role');conf=by_id(personal,add);check(conf['google_meet_pending'] and conf['google_sync_version']=='v1:1:1:0','Explicit first conference missing pending state')
    for limit in [0,1001]:f.rejected(read_sql(a,limit=limit),'Invalid limit was accepted','service_role')
    check(len(rows(a,limit=1))==1,'Read limit was ignored')
    # Repeated racing read/prepare has only two legal snapshots: old title+head0,
    # or new title+head1. No private/provider call is involved.
    for index in range(4,8):
        racing=j.created(other,index);desired='Desired snapshot '+str(index)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            query=executor.submit(rows,other,event=racing)
            mutation=executor.submit(f.read,j.prepare(other,racing,index,payload=dict(j.CHANGE,summary=desired)),'service_role')
            row=query.result()[0];mutation.result()
        check((row['title'],row['google_sync_version']) in [(l.PAYLOAD['summary'],'v1:1:0:0'),(desired,'v1:1:1:0')],'Read row and revision came from different snapshots')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';')
    f.rejected(read_sql(a),'Archived business scope read snapshot','service_role');check(rows(personal,event=legacy)==[],'Personal legacy leaked archived-company history')
    check(rows(personal,event=l.eid(901),meet=True)==[],'Personal legacy Meet leaked archived-company history')
    before=j.snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check(j.snapshot(f)==before,'Readmodel rollback changed history')
    f.rejected(read_sql(personal),'Rollback left readmodel RPC active','service_role');check(l.get(personal,add) is not None,'Readmodel rollback closed prior private history')
    print('PASS Google readmodel: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-readmodel-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);x.guard_triggers(f)
            for name in [l.NAME,x.NAME,j.NAME]:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""Conditional command journal on disposable Unix-socket PostgreSQL, fake data only."""
import argparse
import importlib.util
import json
import hashlib
import concurrent.futures
import time
import pathlib
import tempfile
import traceback

spec=importlib.util.spec_from_file_location('effects',pathlib.Path(__file__).with_name('run-google-event-local-effects.py'))
x=importlib.util.module_from_spec(spec);spec.loader.exec_module(x)
l,c,o,b,s=x.l,x.c,x.o,x.b,x.s
REPO,quote,check,MIGRATOR=l.REPO,s.quote,s.check,l.MIGRATOR
NAME='20261013130000_google_event_commands.sql'
TABLES=['google_workspace.event_command_heads','google_workspace.event_commands']
FUNCTIONS=['google_workspace.event_command_metadata(google_workspace.event_commands)',
 'google_workspace.event_command_local_context(uuid,text,uuid,uuid,boolean)',
 'google_workspace.event_command_context(uuid,text,uuid,uuid,uuid,text,bigint)',
 'public.zelo_google_event_command_head(uuid,text,uuid,uuid)',
 'public.zelo_google_event_command_get(uuid,text,uuid,uuid,uuid)',
 'public.zelo_google_event_command_active(uuid,text,uuid,uuid,uuid)',
 'public.zelo_google_event_command_prepare(uuid,text,uuid,uuid,uuid,bigint,text,bigint,text,jsonb,jsonb)',
 'public.zelo_google_event_command_claim(uuid,text,uuid,uuid,uuid,text,bigint,bigint)',
 'public.zelo_google_event_command_preflight(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid)',
 'public.zelo_google_event_command_finish(uuid,text,uuid,uuid,uuid,text,bigint,bigint,uuid,text,text,text,text)',
 'public.zelo_google_event_command_retry(uuid,text,uuid,uuid,uuid,text,bigint,bigint)']
CHANGE={k:v for k,v in l.PAYLOAD.items() if k!='withMeet'}
def op(index):return 'ffffffff-ffff-4fff-8fff-'+format(index,'012x')
def prepare(store,event,index,kind='update',version='0',payload=None,attendees=None):
    selected_payload=CHANGE if payload is None and kind=='update' else payload
    selected_attendees=[] if attendees is None and kind=='update' else attendees
    return store.command('event_command_prepare',event,op(index),version,b.CLIENT,(store.binding() or {'version':'1'})['version'],kind,
      None if selected_payload is None else json.dumps(selected_payload),None if selected_attendees is None else json.dumps(selected_attendees))
def get(store,event,index):return store.fixture.read(store.command('event_command_get',event,op(index)),'service_role')
def head(store,event):return store.fixture.read(store.command('event_command_head',event),'service_role')
def claim(store,event,index,version='0'):
    return store.fixture.read(store.command('event_command_claim',event,op(index),b.CLIENT,store.binding()['version'],version),'service_role')
def preflight(store,lease):return store.command('event_command_preflight',lease['event_id'],lease['operation_id'],b.CLIENT,lease['lease_binding_version'],lease['attempt_version'],lease['lease_id'])
def finish(store,lease,result='succeeded',etag='"new-fictitious-etag"',meet=None,error=None):
    return store.command('event_command_finish',lease['event_id'],lease['operation_id'],b.CLIENT,lease['lease_binding_version'],lease['attempt_version'],lease['lease_id'],result,etag,meet,error)
def snapshot(f):return l.all_rows(f),*(f.sql('select coalesce(jsonb_agg(to_jsonb(t) order by '+('event_id' if name.endswith('heads') else 'operation_id')+'),\'[]\') from '+name+' t;') for name in TABLES)
def contend(f,store,lease,table):
    marker=f.root/('command-lock-'+table)
    process,command=x.hold_rows(f,'select 1 from public.'+table+' where id='+quote(lease['event_id'])+' for update;',marker)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        completion=executor.submit(process.communicate,command,timeout=10)
        deadline=time.monotonic()+5
        while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
        check(marker.exists(),'Command fixture did not acquire local row lock')
        try:f.sql(preflight(store,lease),'service_role');check(False,'Contended command row allowed effect')
        except s.SqlFailure as error:check('SQLSTATE P0001' in str(error),'Command contention leaked raw deadlock/timeout')
        check(process.poll() is None,'Command contention waited instead of NOWAIT');completion.result()
    check(process.returncode==0,'Holding command fixture failed')
def created(store,index,meet=False,failed=False):
    lease=x.prepare(store,index,meet);store.fixture.read(x.finish(store,lease,result='failed' if failed else 'succeeded',meet=c.MEET if meet and not failed else None,error='CONFERENCE_FAILED' if failed else None),'service_role');return lease['event_id']
def verify(f,baseline):
    a=b.Store(f);a.save(subject='fictitious-commands');event=created(a,1,True)
    if baseline:
        f.read(a.command('event_command_head',event),'service_role');check(False,'RED: command getter exists');return
    protected=l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==protected,'Journal migration changed existing history/credentials/ACLs')
    for name in TABLES:
        check(f.sql('select relrowsecurity and not exists(select 1 from pg_policy where polrelid=pg_class.oid) from pg_class where oid='+quote(name)+'::regclass;')=='t','Private command table missing policy-free RLS')
        for role in ['anon','authenticated']:check(f.sql('select has_table_privilege('+quote(role)+','+quote(name)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser got journal access')
        for privilege in ['DELETE','TRUNCATE','REFERENCES','TRIGGER']:check(f.sql("select has_table_privilege('service_role',"+quote(name)+','+quote(privilege)+');')=='f','Backend got destructive journal ACL')
    for column in ['operation_id','event_id','head_version','kind','payload','local_attendees','expected_etag','conference_request_id']:
        check(f.sql("select has_column_privilege('service_role','google_workspace.event_commands',"+quote(column)+",'UPDATE');")=='f','Backend may rewrite immutable command input')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Command helper elevated rights/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited command RPC')
    check(head(a,event)=={'event_id':event,'head_version':'0','operation_id':None,'etag':'"fictitious-local-etag"','deleted':False},'Wrong initial virtual head')
    for scope in [b.Store(f,company=None),b.Store(f,company=s.COMPANY_B),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:
        check(head(scope,event) is None,'Foreign scope read command head')
        f.rejected(prepare(scope,event,900),'Foreign scope prepared command','service_role')
    check(head(a,l.eid(900)) is None,'Legacy event gained command provenance')
    change=dict(CHANGE,summary='Desired edited title',attendees=[{'email':'fixture@example.test','displayName':'Fictitious person'}])
    result=f.read(prepare(a,event,1,payload=change,attendees=l.ATTENDEES),'service_role')
    check(result['kind']=='update' and result['head_version']=='1' and result['expected_etag']=='"fictitious-local-etag"','Command moved initial target/revision')
    check(f.sql('select a.title=\'🎥 Desired edited title\' and m.title=\'Desired edited title\' and m.attendees='+quote(json.dumps(l.ATTENDEES))+'::jsonb from public.appointments a join public.meets m using(id) where a.id='+quote(event)+';')=='t','Desired linked local edit not atomic')
    before=snapshot(f);check(f.read(prepare(a,event,1,payload=change,attendees=l.ATTENDEES),'service_role')==result,'Identical command retry changed its identity');check(snapshot(f)==before,'Idempotent preparation rewrote rows')
    f.rejected(prepare(a,event,1,payload=dict(change,summary='Other'),attendees=l.ATTENDEES),'Operation UUID accepted changed payload','service_role')
    f.rejected(prepare(a,event,2),'Stale head was silently adopted','service_role')
    lease=claim(a,event,1);check(f.read(preflight(a,lease),'service_role') is True,'Valid current command lease denied')
    check(f.read(a.command('event_command_active',event,op(1)),'service_role') is True,'Command active check denied current scheduled row')
    contend(f,a,lease,'appointments');contend(f,a,lease,'meets')
    for table in ['appointments','meets']:
        f.sql('update public.'+table+" set status='cancelled' where id="+quote(event)+';');before=snapshot(f)
        f.rejected(preflight(a,lease),'Cancelled update authorized provider','service_role');f.rejected(finish(a,lease),'Cancelled update published result','service_role');check(snapshot(f)==before,'Cancelled completion partially committed')
        f.rejected(a.command('event_command_active',event,op(1)),'Cancelled update entered credential runtime','service_role')
        f.sql('update public.'+table+" set status='scheduled' where id="+quote(event)+';')
    f.rejected(prepare(a,event,2,version='1'),'Unexpired worker was superseded','service_role')
    for patch in [dict(lease_id=op(80)),dict(attempt_version='0'),dict(lease_binding_version='99')]:f.rejected(preflight(a,dict(lease,**patch)),'Stale command lease authorized effect','service_role')
    f.sql("update google_workspace.event_commands set lease_until=clock_timestamp()+interval '10 seconds' where operation_id="+quote(op(1))+';')
    f.rejected(preflight(a,lease),'Short command lease allowed network','service_role')
    f.sql("update google_workspace.event_commands set lease_until=clock_timestamp()+interval '60 seconds' where operation_id="+quote(op(1))+';')
    f.sql("update public.meets set ata_content='Preserved minutes' where id="+quote(event)+";update public.appointments set reminder_sent_at='2070-01-01' where id="+quote(event)+';')
    done=f.read(finish(a,lease),'service_role');check(done['state']=='succeeded' and head(a,event)['etag']=='"new-fictitious-etag"','Command completion lost current ETag')
    check(f.sql("select m.ata_content='Preserved minutes' and a.reminder_sent_at='2070-01-01' from public.meets m join public.appointments a using(id) where m.id="+quote(event)+';')=='t','Command finish overwrote metadata')
    f.rejected(finish(a,lease),'Command lease published twice','service_role')
    second=f.read(prepare(a,event,2,version='1'),'service_role');old=claim(a,event,2)
    f.sql("update google_workspace.event_commands set lease_until=clock_timestamp()-interval '1 second' where operation_id="+quote(op(2))+';')
    f.read(prepare(a,event,3,version='2'),'service_role');before=snapshot(f)
    f.rejected(finish(a,old),'Superseded result published newer local data','service_role');check(snapshot(f)==before,'Superseded result partially committed')
    check(get(a,event,2)['state']=='failed' and get(a,event,2)['failure_code']=='SUPERSEDED','Superseded command retained a usable lease')
    current=claim(a,event,3);f.read(finish(a,current,result='failed',etag=None,error='ETAG_CONFLICT'),'service_role')
    f.rejected(a.command('event_command_retry',event,op(3),b.CLIENT,a.binding()['version'],'1'),'Conflict silently retried/adopted ETag','service_role')
    deletion=f.read(prepare(a,event,4,'delete','3'),'service_role');check(deletion['kind']=='delete','Logical delete preparation failed')
    check(f.sql("select a.status='cancelled' and m.status='cancelled' from public.appointments a join public.meets m using(id) where a.id="+quote(event)+';')=='t','Delete removed/failed to cancel linked history')
    cancellation=claim(a,event,4);check(f.read(preflight(a,cancellation),'service_role') is True,'Canceled delete cannot recover')
    check(f.read(a.command('event_command_active',event,op(4)),'service_role') is True,'Canceled delete rejected before credential runtime')
    for table in ['appointments','meets']:
        f.sql('update public.'+table+" set status='scheduled' where id="+quote(event)+';');before=snapshot(f)
        f.rejected(a.command('event_command_active',event,op(4)),'Older cancellation entered runtime after local reschedule','service_role')
        f.rejected(preflight(a,cancellation),'Older cancellation deleted a rescheduled local record','service_role');f.rejected(finish(a,cancellation,etag=None),'Older delete completed after local reschedule','service_role')
        check(snapshot(f)==before,'Rescheduled cancellation denial partly committed')
        f.sql('update public.'+table+" set status='cancelled' where id="+quote(event)+';')
    f.read(finish(a,cancellation,etag=None),'service_role');check(head(a,event)['deleted'],'Delete completion not retained')
    f.rejected(prepare(a,event,5,version='4'),'Deleted event accepted a mutation','service_role')
    conference_event=created(a,2,True,True);f.rejected(prepare(a,conference_event,10),'Failed creation became ordinary update','service_role')
    conference=f.read(prepare(a,conference_event,10,'conference'),'service_role');expected=hashlib.sha256(('zelo-google-conference-command-v1\0'+s.OWNER+':business:'+s.COMPANY_A+'\0'+conference_event+'\0'+op(10)).encode()).hexdigest()
    check(conference['conference_request_id']==expected,'Conference identity differs from server policy')
    waiting=claim(a,conference_event,10);f.read(finish(a,waiting,'waiting',meet=None),'service_role')
    f.rejected(prepare(a,conference_event,11,'conference','1'),'Pending conference allocated another request','service_role')
    waiting=claim(a,conference_event,10,'1');f.read(finish(a,waiting,'failed',error='CONFERENCE_FAILED'),'service_role')
    fresh=f.read(prepare(a,conference_event,11,'conference','1'),'service_role');check(fresh['conference_request_id']!=conference['conference_request_id'],'Explicit new conference reused definitive failed ID')
    successful=claim(a,conference_event,11);f.read(finish(a,successful,meet=c.MEET),'service_role')
    check(c.get(a,conference_event)['state']=='succeeded','Explicit conference recovery left creation unusable')
    check(f.sql('select a.meet_link=m.meet_link and m.meet_link='+quote(c.MEET)+' from public.appointments a join public.meets m using(id) where a.id='+quote(conference_event)+';')=='t','Conference did not publish same link to both rows')
    published=f.read('select jsonb_build_object(\'a\',a.calendar_event_id,\'m\',m.calendar_event_id) from public.appointments a join public.meets m using(id) where a.id='+quote(conference_event)+';')
    check(published['m']==o.expected_id(s.OWNER,'business',s.COMPANY_A,conference_event) and json.loads(published['a'][5:])['eventId']==published['m'],'Conference recovery did not publish original verified event to both linked rows')
    pending_event=l.eid(3);l.call(a,pending_event);f.rejected(prepare(a,pending_event,20),'Ambiguous/queued creation became command','service_role')
    uncertain_creation=x.prepare(a,10,True);f.read(x.finish(a,uncertain_creation,'retry',error='TEMPORARY'),'service_role')
    f.rejected(prepare(a,uncertain_creation['event_id'],22,'conference'),'Known but malformed/ambiguous creation permitted a new conference request','service_role')
    for payload in [[],dict(CHANGE,ownerId=s.OTHER),dict(CHANGE,withMeet=True),dict(CHANGE,endAt=CHANGE['startAt'])]:f.rejected(prepare(a,conference_event,21,version='2',payload=payload),'Malformed command payload accepted','service_role')
    race_event=created(a,5);outcomes=o.race(f,[prepare(a,race_event,40),prepare(a,race_event,41)])
    check(sum(ok for ok,_ in outcomes)==1 and all(ok or code=='P0001' for ok,code in outcomes),'Head-CAS race duplicated commands or deadlocked')
    check(head(a,race_event)['head_version']=='1','Racing preparation skipped/doubled head revision')
    broken_event=created(a,6,True);before=snapshot(f)
    f.sql("create function public.fixture_reject_command() returns trigger language plpgsql as $$begin raise exception 'FICTITIOUS_COMMAND_FAILURE';end;$$;create trigger fixture_reject_command before update on public.meets for each row execute function public.fixture_reject_command();")
    f.rejected(prepare(a,broken_event,50),'Second local row failure swallowed during prepare','service_role');check(snapshot(f)==before,'Prepare failure retained partial desired fields/head/journal')
    f.sql('drop trigger fixture_reject_command on public.meets;')
    f.rejected(prepare(a,broken_event,50,'conference'),'Successful Meet creation allocated an unnecessary new conference request','service_role')
    broken_event=created(a,9,True,True)
    f.read(prepare(a,broken_event,50,'conference'),'service_role');broken=claim(a,broken_event,50);before=snapshot(f)
    f.sql('create trigger fixture_reject_command before update on public.meets for each row execute function public.fixture_reject_command();')
    f.rejected(finish(a,broken,meet=c.MEET),'Second local row publication failure swallowed','service_role');check(snapshot(f)==before,'Finish failure retained partial private/public result')
    f.sql('drop trigger fixture_reject_command on public.meets;drop function public.fixture_reject_command();')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-personal-commands');own=created(personal,7);f.read(prepare(personal,own,60,'conference'),'service_role')
    expected=hashlib.sha256(('zelo-google-conference-command-v1\0'+s.OWNER+':personal:personal\0'+own+'\0'+op(60)).encode()).hexdigest();check(get(personal,own,60)['conference_request_id']==expected,'Personal command adopted remembered company')
    ambiguous=claim(personal,own,60);f.read(finish(personal,ambiguous,'retry',error='TEMPORARY'),'service_role')
    f.rejected(prepare(personal,own,61,'conference','1'),'Malformed/ambiguous conference allocated a fresh request ID','service_role')
    ambiguous=claim(personal,own,60,'1');f.read(finish(personal,ambiguous,'failed',etag=None,error='ATTEMPTS_EXHAUSTED'),'service_role')
    for code in ['TEMPORARY','CONNECTION_CHANGED','ATTEMPTS_EXHAUSTED']:
        f.sql('update google_workspace.event_commands set failure_code='+quote(code)+' where operation_id='+quote(op(60))+';')
        f.rejected(prepare(personal,own,61,'conference','1'),'Nondefinitive conference failure allocated a fresh request ID','service_role')
    other=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY);other.save(subject='fictitious-erasure-commands');erased=created(other,8);f.read(prepare(other,erased,70),'service_role')
    check(s.legacy_snapshot(f)==protected[2],'Commands changed legacy credentials before owner erasure')
    f.sql('delete from public.users where id='+quote(s.OTHER)+';');check(f.sql('select not exists(select 1 from google_workspace.event_commands where event_id='+quote(erased)+') and not exists(select 1 from google_workspace.event_command_heads where event_id='+quote(erased)+');')=='t','Owner erase left command/head PII')
    retained_legacy=s.legacy_snapshot(f)
    lease_event=created(a,4);f.read(prepare(a,lease_event,30),'service_role');stale=claim(a,lease_event,30);a.call('binding_unlink',a.binding()['version'])
    before=snapshot(f);f.rejected(preflight(a,stale),'Unlinked command authorized provider','service_role');f.rejected(finish(a,stale),'Unlink revived command publication','service_role');check(snapshot(f)==before,'Unlinked result partially committed')
    check(s.legacy_snapshot(f)==retained_legacy,'Commands changed retained legacy credentials')
    before=snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check(snapshot(f)==before,'Rollback destroyed command/local history')
    f.rejected(a.command('event_command_get',event,op(1)),'Rollback left command access open','service_role');check(l.get(a,event) is not None,'Rollback closed prior history getter')
    print('PASS conditional commands: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-commands-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={k:v for k,v in f.env.items() if k.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            # Match the real public owner-erasure cascade omitted by the minimal
            # OAuth fixture; no migration changes that existing relationship.
            f.sql('alter table public.companies drop constraint companies_user_id_fkey;alter table public.companies add foreign key(user_id) references public.users(id) on delete cascade;')
            f.sql('alter table public.google_tokens drop constraint google_tokens_user_id_fkey;alter table public.google_tokens add foreign key(user_id) references public.users(id) on delete cascade;')
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);x.guard_triggers(f)
            for name in [l.NAME,x.NAME]:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

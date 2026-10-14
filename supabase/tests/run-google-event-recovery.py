#!/usr/bin/env python3
"""Bounded original-scope pending references on disposable PostgreSQL, fake rows."""
import argparse
import importlib.util
import pathlib
import tempfile
import traceback

spec=importlib.util.spec_from_file_location('commands',pathlib.Path(__file__).with_name('run-google-event-commands.py'))
j=importlib.util.module_from_spec(spec);spec.loader.exec_module(j)
x,l,c,o,b,s=j.x,j.l,j.c,j.o,j.b,j.s
REPO,quote,check,MIGRATOR=j.REPO,j.quote,j.check,j.MIGRATOR
NAME='20261013160000_google_event_recovery.sql'
FUNCTION='public.zelo_google_event_pending(integer)'
KEYS={'user_id','mode','company_id','event_id','operation_id'}
def pending(f,limit=20):return f.read('select public.zelo_google_event_pending('+str(limit)+');','service_role')
def ids(f):return {row['event_id'] for row in pending(f)}
def queued(store,index,meet=False):
    event=l.eid(index);l.call(store,event,kind='meet' if meet else 'appointment',payload=dict(l.PAYLOAD,withMeet=meet));return event
def activation_rows(f):return f.sql("select coalesce(jsonb_agg(to_jsonb(a) order by user_id),'[]') from google_workspace.owner_activations a;")
def verify(f,baseline):
    a=b.Store(f);a.save(subject='fictitious-recovery');first=queued(a,1)
    if baseline:
        pending(f);check(False,'RED: pending job RPC exists');return
    protected=j.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),activation_rows(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((j.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),activation_rows(f),s.role_snapshot(f),s.schema_snapshot(f))==protected,'Recovery migration changed existing rows/credentials/activation/ACLs')
    check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(FUNCTION)+'::regprocedure;')=='t','Recovery helper elevated rights/search path')
    for role in ['anon','authenticated']:
        check(f.sql('select has_function_privilege('+quote(role)+','+quote(FUNCTION)+",'EXECUTE');")=='f','Browser inherited pending references')
        f.rejected('select public.zelo_google_event_pending(20);','Browser selected all-owner jobs',role)
    rows=pending(f);check(rows==[{'user_id':s.OWNER,'mode':'business','company_id':s.COMPANY_A,'event_id':first,'operation_id':None}],'Queued creation lost original scope or gained private fields')
    check(all(set(row)==KEYS for row in rows),'Recovery exposed payload/ETag/provider/credential metadata')
    before=j.snapshot(f);pending(f);check(j.snapshot(f)==before,'Selecting recovery jobs claimed/mutated an intent')
    wait=x.prepare(a,2,True);f.read(x.finish(a,wait,'waiting'),'service_role');check(wait['event_id'] in ids(f),'Waiting conference not recoverable')
    running=x.prepare(a,3);check(running['event_id'] not in ids(f),'Unexpired creation worker selected twice')
    f.sql("update google_workspace.event_creations set lease_until=clock_timestamp()-interval '1 second' where event_id="+quote(running['event_id'])+';');check(running['event_id'] in ids(f),'Expired creation lease not recoverable')
    f.sql('update google_workspace.event_creations set round_attempts=10,attempt_version=10 where event_id='+quote(running['event_id'])+';');check(running['event_id'] not in ids(f),'Exhausted creation selected automatically')
    complete=j.created(a,4);check(complete not in ids(f),'Succeeded creation selected again')
    failure=x.prepare(a,5,True);f.read(x.finish(a,failure,'failed',error='CONFERENCE_FAILED'),'service_role');check(failure['event_id'] not in ids(f),'Definitive creation failure selected automatically')
    cancelled=queued(a,6,True);f.sql("update public.meets set status='cancelled' where id="+quote(cancelled)+';');check(cancelled not in ids(f),'Canceled secondary local row authorized creation')
    f.sql("update public.meets set status='scheduled' where id="+quote(cancelled)+";update public.appointments set status='cancelled' where id="+quote(cancelled)+';');check(cancelled not in ids(f),'Canceled primary local row authorized creation')
    f.read(j.prepare(a,complete,1),'service_role');commands=pending(f);check(next(row for row in commands if row['event_id']==complete)['operation_id']==j.op(1),'Current command missing immutable operation reference')
    command=j.claim(a,complete,1);check(complete not in ids(f),'Unexpired command selected twice')
    f.sql("update google_workspace.event_commands set lease_until=clock_timestamp()-interval '1 second' where operation_id="+quote(j.op(1))+';');check(complete in ids(f),'Expired current command lost recovery')
    f.read(j.prepare(a,complete,2,'delete','1'),'service_role');check(next(row for row in pending(f) if row['event_id']==complete)['operation_id']==j.op(2),'Superseded command chosen instead of current delete')
    check(j.get(a,complete,1)['failure_code']=='SUPERSEDED','Fixture supersession did not invalidate previous lease')
    f.sql("update public.appointments set status='scheduled' where id="+quote(complete)+';');check(complete not in ids(f),'Older delete selected after public reactivation')
    f.sql("update public.appointments set status='cancelled' where id="+quote(complete)+';');check(complete in ids(f),'Canceled delete cannot recover')
    deletion=j.claim(a,complete,2);f.read(j.finish(a,deletion,etag=None),'service_role');check(complete not in ids(f),'Deleted current head selected again')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-recovery-personal');own=queued(personal,7)
    check(next(row for row in pending(f) if row['event_id']==own)['company_id'] is None,'Personal job adopted remembered company')
    conference_event=j.created(personal,35);f.read(j.prepare(personal,conference_event,35,'conference'),'service_role');conference=j.claim(personal,conference_event,35)
    f.read(j.finish(personal,conference,'waiting'),'service_role');check(next(row for row in pending(f) if row['event_id']==conference_event)['operation_id']==j.op(35),'Waiting explicit conference lost original operation identity')
    f.sql('update google_workspace.event_commands set round_attempts=10,attempt_version=10 where operation_id='+quote(j.op(35))+';');check(conference_event not in ids(f),'Exhausted conference command selected automatically')
    other=b.Store(f,company=s.COMPANY_B);other.save(subject='fictitious-recovery-other');other_event=queued(other,8)
    check(next(row for row in pending(f) if row['event_id']==other_event)['company_id']==s.COMPANY_B,'Other company job lost exact UUID')
    foreign=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY);foreign.save(subject='fictitious-recovery-foreign');foreign_event=queued(foreign,9)
    f.sql('delete from google_workspace.owner_activations where user_id='+quote(s.OTHER)+';');check(foreign_event not in ids(f),'Unactivated owner selected automatically')
    f.sql('insert into google_workspace.owner_activations(user_id) values('+quote(s.OTHER)+');');check(foreign_event in ids(f),'Activated foreign owner lost own scoped job')
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');check(not any(row['user_id']==s.OWNER for row in pending(f)),'Owner without platform access selected jobs')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';')
    original=other.binding();other.call('binding_unlink',original['version']);check(other_event not in ids(f),'Unlinked original account selected jobs')
    other.save(subject='fictitious-recovery-new-account',binding_version=other.binding()['version']);check(other_event not in ids(f),'Changed Google account adopted old intent')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');check(not any(row['company_id']==s.COMPANY_A for row in pending(f)),'Archived company selected jobs');check(own in ids(f),'Archiving company hid independent personal job')
    check(l.eid(900) not in ids(f) and l.eid(901) not in ids(f),'Historical rows inferred recovery provenance')
    for index in range(10,35):queued(personal,index)
    rows=pending(f);check(len(rows)==20 and all(set(row)==KEYS for row in rows),'Recovery limit/private reference allowlist violated')
    check(len(pending(f,1))==1,'Requested bounded limit ignored')
    for limit in [0,21]:f.rejected('select public.zelo_google_event_pending('+str(limit)+');','Out-of-bounds recovery limit accepted','service_role')
    f.rejected('select public.zelo_google_event_pending(null);','Null recovery limit accepted','service_role')
    before=j.snapshot(f),activation_rows(f),s.legacy_snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check((j.snapshot(f),activation_rows(f),s.legacy_snapshot(f))==before,'Recovery rollback destroyed history/activation/credentials')
    f.rejected('select public.zelo_google_event_pending(20);','Rollback left all-owner pending selector open','service_role')
    check(l.get(personal,own) is not None,'Recovery rollback closed prior history access')
    print('PASS Google recovery selector: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--activation-migration',type=pathlib.Path,default=REPO/'supabase/migrations/20261013120000_google_owner_activation.sql');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-recovery-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';grant trigger on public.google_tokens to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);x.guard_triggers(f)
            for name in [l.NAME,x.NAME,j.NAME]:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql(args.activation_migration.read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

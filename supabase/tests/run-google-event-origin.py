#!/usr/bin/env python3
"""Immutable Google event origin on disposable Unix-socket PostgreSQL, fictitious data."""
import argparse
import concurrent.futures
import hashlib
import importlib.util
import pathlib
import re
import tempfile
import threading
import traceback

REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = '20261013080000_google_event_origin.sql'
MIGRATOR = 'google_event_migrator'
spec = importlib.util.spec_from_file_location('binding_fixture', pathlib.Path(__file__).with_name('run-google-bindings.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
s = b.base
check, quote = s.check, s.quote
EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
FUNCTIONS = ['google_workspace.event_retry_id(uuid,text,uuid,uuid,boolean)',
             'google_workspace.event_origin_metadata(google_workspace.event_origins)',
             'public.zelo_google_event_origin_get(uuid,text,uuid,uuid)',
             'public.zelo_google_event_origin_reserve(uuid,text,uuid,uuid,uuid,uuid,bigint,text)']
META = {'event_id','user_id','mode','company_id','binding_id','grant_id','binding_version','calendar_id','remote_event_id','conference_request_id'}

def command(name='event_origin_get', owner=s.OWNER, mode='business', company=s.COMPANY_A, event=EVENT, tail=None):
    return b.sql_call(name, [owner, mode, company, event]+(tail or []))

def read(f, **kwargs):
    return f.read(command(**kwargs), 'service_role')

def reserve(store, event=EVENT, patch=None):
    target = store.binding()
    params = dict(owner=store.owner,mode='personal' if store.company is None else 'business',company=store.company,event=event,
                  tail=[target['id'],target['grant_id'],target['version'],b.CLIENT])
    params.update(patch or {})
    return command('event_origin_reserve', **params)

def origins(f):
    return f.sql('select coalesce(jsonb_agg(to_jsonb(e) order by event_id),\'[]\'::jsonb) from google_workspace.event_origins e;')

def expected_id(owner, mode, company, event, conference=False):
    domain = 'zelo-google-conference-v1' if conference else 'zelo-google-event-v1'
    workspace = owner+':'+mode+':'+(company or 'personal')
    return hashlib.sha256((domain+'\0'+workspace+'\0'+event).encode()).hexdigest()

def race(f, commands):
    barrier=threading.Barrier(len(commands))
    def worker(sql):
        barrier.wait(timeout=10)
        try:return True,f.sql(sql,'service_role')
        except s.SqlFailure as error:
            code=re.search(r'SQLSTATE ([A-Z0-9]{5})',str(error))
            return False,code.group(1) if code else 'UNKNOWN'
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(commands)) as executor:
        return list(executor.map(worker,commands))

def verify(f, baseline):
    if baseline:
        check(read(f) is None, 'RED: missing immutable event-origin storage')
        return
    before = b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(), MIGRATOR)
    check((b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)) == before, 'Migration changed existing history/bytes/role/schema privileges')
    relation = 'google_workspace.event_origins'
    check(f.sql('select relrowsecurity from pg_class where oid='+quote(relation)+'::regclass;') == 't','Origin storage missing RLS')
    check(f.sql('select count(*)=0 from pg_policy where polrelid='+quote(relation)+'::regclass;') == 't','Origin storage added browser policies')
    for role in ['anon','authenticated']:
        check(f.sql('select has_table_privilege('+quote(role)+','+quote(relation)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');") == 'f','Browser inherited origin storage access')
        f.rejected(command(), 'Browser invoked origin getter', role)
    for permission in ['SELECT','INSERT']:
        check(f.sql('select has_table_privilege(\'service_role\','+quote(relation)+','+quote(permission)+');') == 't','Backend missing required origin privilege')
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql('select has_table_privilege(\'service_role\','+quote(relation)+','+quote(permission)+');') == 'f','Backend inherited mutable/destructive origin privilege')
    for function in FUNCTIONS:
        check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(function)+'::regprocedure;') == 't','Origin helper acquired elevated rights/path')
        for role in ['anon','authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(function)+",'EXECUTE');") == 'f','Browser inherited private origin function')
        check(f.sql('select has_function_privilege(\'service_role\','+quote(function)+",'EXECUTE');") == 't','Backend cannot use origin function')
    check(read(f) is None, 'Existing events/legacy were assigned an origin implicitly')
    stores = [b.Store(f),b.Store(f,company=s.COMPANY_B),b.Store(f,company=None),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]
    for index, store in enumerate(stores): store.save(subject='fictitious-event-'+str(index))
    a,other,personal,foreign = stores
    a.call('binding_select_calendar',a.binding()['version'],'original-calendar','Fixture')
    result = f.read(reserve(a), 'service_role')
    check(set(result) == META and result['calendar_id'] == 'original-calendar','Origin metadata shape/calendar changed')
    check(result['binding_version'] == str(a.binding()['version']),'Origin binding revision rounded or omitted')
    check(result['remote_event_id'] == expected_id(s.OWNER,'business',s.COMPANY_A,EVENT) and result['conference_request_id'] == expected_id(s.OWNER,'business',s.COMPANY_A,EVENT,True),'PostgreSQL IDs differ from Node UTF-8/NUL v1 hashing')
    before = origins(f),b.snapshot(f),s.legacy_snapshot(f)
    retry = f.read(reserve(a), 'service_role')
    check(retry == result and (origins(f),b.snapshot(f),s.legacy_snapshot(f)) == before,'Repeated reservation moved/mutated origin or credentials')
    for kwargs in [dict(company=s.COMPANY_B),dict(mode='personal',company=None),dict(owner=s.OTHER,company=s.FOREIGN_COMPANY)]:
        check(read(f,**kwargs) is None,'Origin getter crossed owner/mode/company')
    for store in [other,personal,foreign]:
        f.rejected(reserve(store), 'Another owner/workspace borrowed event UUID', 'service_role')
    check((origins(f),b.snapshot(f),s.legacy_snapshot(f)) == before,'Rejected scope conflict changed data')
    for patch in [dict(owner=None),dict(mode='personal'),dict(company=None),dict(company=s.ARCHIVED),dict(company=s.FOREIGN_COMPANY),dict(event=None)]:
        f.rejected(reserve(a,patch=patch),'Malformed/inaccessible event reservation accepted','service_role')
    target=a.binding()
    for tail in [[None,target['grant_id'],target['version'],b.CLIENT],[target['id'],None,target['version'],b.CLIENT],
                 [target['id'],target['grant_id'],None,b.CLIENT],[target['id'],target['grant_id'],0,b.CLIENT],
                 [target['id'],target['grant_id'],target['version'],None],[target['id'],target['grant_id'],target['version'],'bad'],
                 [target['id'],target['grant_id'],target['version'],s.digest('wrong-client')],
                 [other.binding()['id'],target['grant_id'],target['version'],b.CLIENT],
                 [target['id'],foreign.binding()['grant_id'],target['version'],b.CLIENT]]:
        f.rejected(reserve(a,patch=dict(tail=tail)),'Wrong binding/grant/client/revision accepted','service_role')
    check((origins(f),b.snapshot(f),s.legacy_snapshot(f)) == before,'Invalid reservation partially changed data')
    grant=a.grant('fictitious-event-0')
    a.call('grant_refresh',grant['id'],b.CLIENT,grant['version'],b.CIPHER,b.CIPHER,b.EXPIRY)
    check(f.read(reserve(a),'service_role') == result,'Grant-only renewal invalidated stable event origin')
    old_command=reserve(a)
    a.call('binding_select_calendar',a.binding()['version'],'new-calendar','New choice')
    check(read(f) == result,'A later selected calendar moved the old event')
    f.rejected(old_command,'Old first-creation revision survived calendar change','service_role')
    f.rejected(reserve(a),'Repeated event UUID adopted newer binding revision','service_role')
    event2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
    second=f.read(reserve(a,event2),'service_role')
    check(second['calendar_id']=='new-calendar' and second['remote_event_id']!=result['remote_event_id'],'New event failed to capture new target/identity')
    f.sql('update public.companies set name=\'Same renamed company\' where user_id='+quote(s.OWNER)+';update public.users set active_mode=\'personal\' where id='+quote(s.OWNER)+';')
    check(read(f)==result,'Company names/current UI mode changed event origin')
    event3='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'
    races=s.concurrent_processes(f,[reserve(other,event3)]*8)
    check(all(ok for ok,_ in races),'Same-intent reservation race deadlocked or failed')
    check(len({value for _,value in races})==1,'Same-intent race created different remote identities')
    check(f.sql('select count(*) from google_workspace.event_origins where event_id='+quote(event3)+';')=='1','Same-intent race duplicated durable origin')
    huge='9223372036854775806'
    f.sql('update google_workspace.bindings set version='+huge+' where id='+quote(personal.binding()['id'])+';')
    event4='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'
    own=f.read(reserve(personal,event4),'service_role')
    check(own['company_id'] is None and own['binding_version']==huge,'Personal origin used a company or rounded bigint')
    check(own['remote_event_id']==expected_id(s.OWNER,'personal',None,event4),'Personal retry ID differs from canonical v1')
    collision='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8'
    protected=b.snapshot(f),s.legacy_snapshot(f)
    winners=race(f,[reserve(personal,collision),reserve(foreign,collision)])
    check(sum(ok for ok,_ in winners)==1,'Cross-owner UUID collision produced zero/two winners')
    check(all(ok or code in ('P0001','23505') for ok,code in winners),'Origin collision failed through deadlock/timeout/unknown error')
    check(f.sql('select count(*) from google_workspace.event_origins where event_id='+quote(collision)+';')=='1','UUID collision produced duplicate/missing origin')
    check((b.snapshot(f),s.legacy_snapshot(f))==protected,'Collision changed credential/binding/legacy bytes')
    before=origins(f)
    for column,value in [('binding_id',foreign.binding()['id']),('grant_id',foreign.binding()['grant_id']),('company_id',s.FOREIGN_COMPANY)]:
        target=a.binding()
        values={'event_id':'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','user_id':s.OWNER,'mode':'business','company_id':s.COMPANY_A,'binding_id':target['id'],'grant_id':target['grant_id'],'binding_version':target['version'],'calendar_id':'fixture','remote_event_id':'0'*64,'conference_request_id':'1'*64}
        values[column]=value
        f.rejected('insert into google_workspace.event_origins('+','.join(values)+') values('+','.join(quote(v) for v in values.values())+');','Composite origin FK accepted another owner\'s reference','service_role')
    f.rejected('update google_workspace.event_origins set calendar_id=\'changed\';','Backend could mutate immutable origins','service_role')
    f.rejected('delete from google_workspace.event_origins;','Backend could discard origin history','service_role')
    check(origins(f)==before,'Rejected FK/mutation changed origin history')
    a.call('binding_unlink',a.binding()['version'])
    check(read(f)==result,'Unlink deleted old event origin/history')
    f.rejected(reserve(a,event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6'),'Unlinked connection reserved an event','service_role')
    unlink_race='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9'
    outcomes=race(f,[reserve(other,unlink_race),other.command('binding_unlink',other.binding()['version'])])
    check(outcomes[1][0] and (outcomes[0][0] or outcomes[0][1]=='P0001'),'Reservation/unlink race deadlocked or failed unexpectedly')
    check(other.binding()['unlinked_at'] is not None,'Event reservation revived a removed binding')
    maybe=read(f,company=s.COMPANY_B,event=unlink_race)
    check((maybe is not None)==outcomes[0][0],'Ambiguous reservation/unlink lost committed origin or invented one')
    # Isolate archive denial: reconnect this fictitious binding first, so no
    # missing/unlinked or stale-revision failure can make the negative pass.
    other.save(subject='fictitious-event-1',grant_version=other.grant('fictitious-event-1')['version'],binding_version=other.binding()['version'])
    check(other.binding()['unlinked_at'] is None,'Archive fixture target was not active')
    archived_reservation=reserve(other,event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_B)+';')
    f.rejected(command(company=s.COMPANY_B,event=event3),'Archived workspace read origin','service_role')
    f.rejected(archived_reservation,'Archived workspace reserved an event','service_role')
    before=origins(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((origins(f),b.snapshot(f),s.legacy_snapshot(f))==before,'Rollback changed intent/history/credential bytes')
    for function in FUNCTIONS:
        check(f.sql('select has_function_privilege(\'service_role\','+quote(function)+",'EXECUTE');")=='f','Rollback retained private origin RPC')
    check(f.sql('select has_table_privilege(\'service_role\','+quote(relation)+",'SELECT,INSERT');")=='f','Rollback retained origin storage access')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');")=='f','Temporary migration CREATE survived')
    print('PASS '+str(s.ASSERTIONS)+' event-origin assertions', flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir', default='/private/tmp/zelo-pg-runtime/bin')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-event-pg-', dir='/private/tmp') as directory:
        f = s.Fixture(pathlib.Path(args.bin_dir), pathlib.Path(directory))
        f.env = {key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(), MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';')
            verify(f,args.baseline)
        finally:f.stop()

if __name__ == '__main__':
    try:main()
    except (AssertionError,s.SqlFailure) as error:
        frames=traceback.extract_tb(error.__traceback__)
        location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        print(str(error)+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__)
        location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        print('Fixture failed: '+type(error).__name__+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True)
        raise SystemExit(1) from None

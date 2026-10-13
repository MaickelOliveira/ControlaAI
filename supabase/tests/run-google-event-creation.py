#!/usr/bin/env python3
"""Creation recovery on disposable Unix-socket PostgreSQL; fictitious data only."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback

spec = importlib.util.spec_from_file_location('origin_fixture', pathlib.Path(__file__).with_name('run-google-event-origin.py'))
o = importlib.util.module_from_spec(spec)
spec.loader.exec_module(o)
b, s = o.b, o.s
check, quote, REPO = s.check, s.quote, o.REPO
NAME = '20261013090000_google_event_creation.sql'
MIGRATOR = 'google_creation_migrator'
RELATION = 'google_workspace.event_creations'
FUNCTIONS = [
    'google_workspace.event_creation_context(uuid,text,uuid,uuid,text,bigint)',
    'google_workspace.event_creation_metadata(google_workspace.event_creations)',
    'public.zelo_google_event_creation_get(uuid,text,uuid,uuid)',
    'public.zelo_google_event_creation_prepare(uuid,text,uuid,uuid,text,bigint,jsonb,boolean)',
    'public.zelo_google_event_creation_claim(uuid,text,uuid,uuid,text,bigint,bigint)',
    'public.zelo_google_event_creation_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text)',
    'public.zelo_google_event_creation_retry(uuid,text,uuid,uuid,text,bigint,bigint)',
]
META = {'event_id','payload','payload_fingerprint','with_meet','state','attempt_version','round_attempts',
        'authorized_binding_version','lease_id','lease_until','lease_binding_version','insert_allowed',
        'was_attempted','remote_known','etag','meet_link','failure_code'}
PAYLOAD = json.dumps({'title':'Fictitious meeting','start':'2070-01-01T10:00:00Z','end':'2070-01-01T11:00:00Z'})
MEET = 'https://meet.google.com/abc-defg-hij'

def sql(store, name, event, *args):
    return store.command('event_creation_'+name, event, *args)

def get(store, event):
    return store.fixture.read(sql(store,'get',event),'service_role')

def mutation(store, name, event, *args, version=None, client=b.CLIENT):
    return sql(store,name,event,client,store.binding()['version'] if version is None else version,*args)

def call(store, name, event, *args, **kwargs):
    return store.fixture.read(mutation(store,name,event,*args,**kwargs),'service_role')

def prepare(store, event, with_meet=False):
    store.fixture.read(o.reserve(store,event),'service_role')
    return call(store,'prepare',event,PAYLOAD,with_meet)

def finish(store, lease, result='succeeded', known=True, etag='"fictitious-etag"', meet=None, error=None):
    return mutation(store,'finish',lease['event_id'],lease['attempt_version'],lease['lease_id'],result,known,etag,meet,error,version=lease['lease_binding_version'])

def expire(store, event):
    store.fixture.sql('update '+RELATION+" set lease_until=clock_timestamp()-interval '1 second' where event_id="+quote(event)+';')

def snapshot(f):
    return f.sql('select coalesce(jsonb_agg(to_jsonb(c) order by event_id),\'[]\'::jsonb) from '+RELATION+' c;')

def verify(f, baseline):
    if baseline:
        f.read(sql(b.Store(f),'get',o.EVENT),'service_role')
        check(False,'RED: lifecycle getter unexpectedly exists before migration')
        return
    protected = o.origins(f), b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((o.origins(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==protected,'Migration changed existing history/credentials/privileges')
    check(f.sql('select relrowsecurity from pg_class where oid='+quote(RELATION)+'::regclass;')=='t','Creation storage lacks RLS')
    check(f.sql('select count(*)=0 from pg_policy where polrelid='+quote(RELATION)+'::regclass;')=='t','Creation storage added browser policy')
    for role in ['anon','authenticated']:
        check(f.sql('select has_table_privilege('+quote(role)+','+quote(RELATION)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser inherited private storage')
        f.rejected(sql(b.Store(f),'get',o.EVENT),'Browser could read private creation',role)
    for permission in ['SELECT','INSERT']:
        check(f.sql('select has_table_privilege(\'service_role\','+quote(RELATION)+','+quote(permission)+');')=='t','Backend missing storage access')
    for column in ['event_id','payload','with_meet','created_at']:
        check(f.sql('select has_column_privilege(\'service_role\','+quote(RELATION)+','+quote(column)+",'UPDATE');")=='f','Backend could overwrite immutable intent')
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql('select has_table_privilege(\'service_role\','+quote(RELATION)+','+quote(permission)+');')=='f','Backend inherited excessive table privilege')
    for function in FUNCTIONS:
        check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(function)+'::regprocedure;')=='t','Lifecycle helper elevates rights or search path')
        for role in ['anon','authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(function)+",'EXECUTE');")=='f','Browser inherited lifecycle execution')
        check(f.sql('select has_function_privilege(\'service_role\','+quote(function)+",'EXECUTE');")=='t','Backend missing lifecycle execution')
    stores = [b.Store(f),b.Store(f,company=s.COMPANY_B),b.Store(f,company=None),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]
    for i,store in enumerate(stores): store.save(subject='creation-fixture-'+str(i))
    a, other, personal, foreign = stores
    protected = b.snapshot(f),s.legacy_snapshot(f)
    event=o.EVENT
    initial=prepare(a,event)
    check(set(initial)==META and initial['state']=='queued' and initial['attempt_version']=='0' and not initial['was_attempted'],'Wrong initial immutable lifecycle DTO')
    check(initial['payload']==json.loads(PAYLOAD) and len(initial['payload_fingerprint'])==64,'Private payload/digest missing')
    check(call(a,'prepare',event,PAYLOAD,False)==initial,'Same intent was not idempotent')
    for payload,meet in [(json.dumps({'title':'Different'}),False),(PAYLOAD,True),('[]',False),('null',False),('"string"',False),(json.dumps({'title':'x'*33000}),False),(PAYLOAD,None)]:
        f.rejected(mutation(a,'prepare',event,payload,meet),'Invalid/different intent silently replaced payload','service_role')
    for store in [other,personal,foreign]:
        check(get(store,event) is None,'History getter crossed scope')
        f.rejected(mutation(store,'claim',event,0),'Foreign scope claimed origin','service_role')
    f.rejected(mutation(a,'claim',event,0,client=s.digest('wrong-client')),'Wrong configured client claimed work','service_role')
    check(get(a,event)==initial,'Rejected calls changed lifecycle')
    f.rejected('update '+RELATION+" set payload='{}'::jsonb;",'Backend changed immutable payload','service_role')
    f.rejected('delete from '+RELATION+';','Backend discarded lifecycle history','service_role')
    f.rejected('insert into '+RELATION+"(event_id,payload,with_meet,authorized_binding_version) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef','{}',false,1);",'Creation without an origin bypassed FK','service_role')
    races=o.race(f,[mutation(a,'claim',event,0)]*8)
    check(sum(ok for ok,_ in races)==1 and all(ok or code=='P0001' for ok,code in races),'Concurrent workers both won or deadlocked')
    lease=get(a,event)
    check(lease['state']=='running' and lease['attempt_version']=='1' and lease['round_attempts']==1 and lease['was_attempted'] and lease['insert_allowed'],'Claim failed to persist first attempt authorization')
    check(f.sql('select lease_until>clock_timestamp() and lease_until<clock_timestamp()+interval \'61 seconds\' from '+RELATION+' where event_id='+quote(event)+';')=='t','Lease is not database bounded to 60 seconds')
    stale=dict(lease,lease_id='ffffffff-ffff-4fff-8fff-ffffffffffff')
    f.rejected(finish(a,stale),'Wrong lease completed work','service_role')
    expire(a,event)
    f.rejected(finish(a,lease),'Expired worker completed work','service_role')
    recovered=call(a,'claim',event,lease['attempt_version'])
    check(recovered['lease_id']!=lease['lease_id'] and recovered['attempt_version']=='2' and recovered['round_attempts']==2,'Expired process was not safely reclaimed')
    f.rejected(finish(a,lease),'Old worker overwrote replacement','service_role')
    done=f.read(finish(a,recovered),'service_role')
    check(done['state']=='succeeded' and done['remote_known'] and done['lease_id'] is None,'Completion failed to retain remote identity')
    f.rejected(mutation(a,'claim',event,done['attempt_version']),'Succeeded creation was claimed again','service_role')
    f.rejected(mutation(a,'retry',event,done['attempt_version']),'Explicit retry recreated successful event','service_role')
    # Pending conference is read-only reconciliation, even after explicit retry.
    pending_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
    prepare(a,pending_event,True)
    pending=call(a,'claim',pending_event,0)
    for bad in [dict(result='waiting',known=False,etag=None),dict(result='succeeded',meet='https://evil.example/abc'),dict(result='failed',error='RAW_PROVIDER_DIAGNOSTIC')]:
        f.rejected(finish(a,pending,**bad),'Invalid completion/link/diagnostic stored','service_role')
    waiting=f.read(finish(a,pending,result='waiting'),'service_role')
    check(waiting['state']=='waiting' and waiting['remote_known'],'Pending conference lost known event')
    already_known=call(a,'claim',pending_event,waiting['attempt_version'])
    waiting=f.read(finish(a,already_known,result='retry',known=False,etag=None,error='TEMPORARY'),'service_role')
    check(waiting['remote_known'] and waiting['etag']=='"fictitious-etag"','A later transient failure erased known remote creation')
    retry=call(a,'retry',pending_event,waiting['attempt_version'])
    pending=call(a,'claim',pending_event,retry['attempt_version'])
    check(not pending['insert_allowed'] and pending['remote_known'],'Retry reset sticky known event and allowed another insert')
    succeeded=f.read(finish(a,pending,meet=MEET),'service_role')
    check(succeeded['meet_link']==MEET and succeeded['state']=='succeeded','Valid Meet result not persisted')
    # A new binding revision cannot silently authorize an untouched/ambiguous insert.
    ambiguous_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'
    untouched_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4'
    prepare(a,ambiguous_event);prepare(a,untouched_event)
    ambiguous=call(a,'claim',ambiguous_event,0)
    old_origins=o.origins(f)
    a.call('binding_select_calendar',a.binding()['version'],'new-calendar','Fictitious')
    f.rejected(finish(a,ambiguous),'Stale binding revision committed result','service_role')
    f.rejected(mutation(a,'claim',untouched_event,0),'Untouched creation adopted new binding revision','service_role')
    expire(a,ambiguous_event)
    reconciler=call(a,'claim',ambiguous_event,ambiguous['attempt_version'])
    check(not reconciler['insert_allowed'] and reconciler['was_attempted'],'Ambiguous old attempt silently inserted on changed binding')
    f.read(finish(a,reconciler,result='retry',known=False,etag=None,error='TEMPORARY'),'service_role')
    explicit=call(a,'retry',ambiguous_event,reconciler['attempt_version'])
    check(explicit['was_attempted'] and explicit['round_attempts']==0 and explicit['authorized_binding_version']==str(a.binding()['version']),'Explicit retry discarded attempt history or failed to capture chosen binding')
    f.rejected(finish(a,reconciler),'Explicit retry accepted superseded worker','service_role')
    resumed=call(a,'claim',ambiguous_event,explicit['attempt_version'])
    check(resumed['insert_allowed'] and o.origins(f)==old_origins,'Explicit retry moved original target or did not authorize same logical insert')
    f.read(finish(a,resumed),'service_role')
    # Automatic rounds are bounded; explicit retry retains exact bigint history.
    bounded_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5'
    prepare(a,bounded_event)
    version='0'
    for index in range(10):
        bounded=call(a,'claim',bounded_event,version)
        result=f.read(finish(a,bounded,result='retry',known=False,etag=None,error='TEMPORARY'),'service_role')
        version=result['attempt_version']
        check(result['round_attempts']==index+1,'Automatic attempt counter not durable')
    check(result['state']=='failed' and result['failure_code']=='ATTEMPTS_EXHAUSTED','Automatic retries exceeded bounded round')
    f.rejected(mutation(a,'claim',bounded_event,version),'Failed bounded round ran automatically','service_role')
    huge='9223372036854775790'
    f.sql('update '+RELATION+' set attempt_version='+huge+' where event_id='+quote(bounded_event)+';')
    retried=call(a,'retry',bounded_event,huge)
    check(retried['attempt_version']==str(int(huge)+1) and retried['was_attempted'],'Explicit retry rounded bigint or forgot attempt')
    f.rejected(mutation(a,'retry',bounded_event,huge),'Stale explicit retry mutated winner','service_role')
    blocked_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee6'
    prepare(other,blocked_event,True)
    blocked=call(other,'claim',blocked_event,0)
    failed=f.read(finish(other,blocked,result='failed',error='CONFERENCE_FAILED'),'service_role')
    f.rejected(mutation(other,'retry',blocked_event,failed['attempt_version']),'Definitive conference failure reused the same request operation','service_role')
    unlink_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7'
    prepare(other,unlink_event)
    removed=call(other,'claim',unlink_event,0)
    other.call('binding_unlink',other.binding()['version'])
    f.rejected(finish(other,removed),'Completion revived unlinked connection','service_role')
    check(get(other,unlink_event)['state']=='running','Unlink discarded lifecycle history')
    check(s.legacy_snapshot(f)==protected[1],'Lifecycle changed legacy ciphertext')
    # Independently scoped personal/foreign work stays usable after A is archived.
    prepare(personal,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8')
    prepare(foreign,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee9')
    expired_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeea'
    prepare(personal,expired_event)
    version='0'
    for index in range(10):
        lost=call(personal,'claim',expired_event,version)
        expire(personal,expired_event)
        version=lost['attempt_version']
    f.rejected(mutation(personal,'claim',expired_event,version),'Tenth lost worker allowed an eleventh automatic attempt','service_role')
    renewed=call(personal,'retry',expired_event,version)
    check(renewed['was_attempted'] and not renewed['remote_known'] and renewed['round_attempts']==0,'Explicit retry of lost worker discarded ambiguity')
    f.rejected(finish(personal,lost),'Old tenth worker completed after explicit retry','service_role')
    check(call(personal,'claim',expired_event,renewed['attempt_version'])['round_attempts']==1,'Explicit retry could not resume an exhausted expired lease')
    race_event='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeeb'
    prepare(a,race_event)
    race_lease=call(a,'claim',race_event,0)
    outcomes=o.race(f,[finish(a,race_lease),a.command('binding_unlink',a.binding()['version'])])
    check(outcomes[1][0] and (outcomes[0][0] or outcomes[0][1]=='P0001'),'Finish/unlink race deadlocked or failed unexpectedly')
    check(a.binding()['unlinked_at'] is not None and get(a,race_event)['state']==('succeeded' if outcomes[0][0] else 'running'),'Completion/unlink race revived a connection or lost history')
    a.save(subject='creation-fixture-0',grant_version=a.grant('creation-fixture-0')['version'],binding_version=a.binding()['version'])
    retried=call(a,'retry',bounded_event,retried['attempt_version'])
    check(retried['state']=='queued' and a.binding()['unlinked_at'] is None,'Active same-account retry failed before isolated archive check')
    archived_retry=mutation(a,'retry',bounded_event,retried['attempt_version'])
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';')
    f.rejected(sql(a,'get',event),'Archived workspace read private creation','service_role')
    f.rejected(archived_retry,'Archived workspace retried work','service_role')
    check(get(personal,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee8')['state']=='queued','Archive crossed workspace')
    preserved=snapshot(f),o.origins(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((snapshot(f),o.origins(f),b.snapshot(f),s.legacy_snapshot(f))==preserved,'Rollback removed history or credentials')
    for function in FUNCTIONS:
        check(f.sql('select has_function_privilege(\'service_role\','+quote(function)+",'EXECUTE');")=='f','Rollback retained lifecycle RPC')
    check(f.sql('select has_any_column_privilege(\'service_role\','+quote(RELATION)+",'SELECT,INSERT,UPDATE,REFERENCES');")=='f','Rollback retained column/table access')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');")=='f','Temporary migration CREATE survived')
    print('PASS '+str(s.ASSERTIONS)+' event-creation assertions',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin')
    parser.add_argument('--baseline',action='store_true')
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-creation-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory))
        f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';')
            verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__)
        location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True)
        raise SystemExit(1) from None

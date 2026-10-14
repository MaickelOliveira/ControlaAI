#!/usr/bin/env python3
"""Local effect guards/completion on disposable PostgreSQL, fictitious data only."""
import argparse
import concurrent.futures
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import time
import traceback

spec=importlib.util.spec_from_file_location('local_fixture',pathlib.Path(__file__).with_name('run-google-event-local-links.py'))
l=importlib.util.module_from_spec(spec);spec.loader.exec_module(l)
c,o,b,s=l.c,l.o,l.b,l.s
REPO,quote,check=l.REPO,s.quote,s.check
NAME='20261013110000_google_event_local_effects.sql'
MIGRATOR=l.MIGRATOR
FUNCTIONS=['google_workspace.event_local_context(uuid,text,uuid,uuid)',
 'public.zelo_google_event_local_active(uuid,text,uuid,uuid)',
 'public.zelo_google_event_local_preflight(uuid,text,uuid,uuid,text,bigint,bigint,uuid)',
 'public.zelo_google_event_local_finish(uuid,text,uuid,uuid,text,bigint,bigint,uuid,text,boolean,text,text,text)']

def active(store,event):return store.command('event_local_active',event)
def preflight(store,lease,version=None,client=b.CLIENT):
    return store.command('event_local_preflight',lease['event_id'],client,lease['lease_binding_version'] if version is None else version,lease['attempt_version'],lease['lease_id'])
def finish(store,lease,result='succeeded',known=True,etag='"fictitious-local-etag"',meet=None,error=None):
    return store.command('event_local_finish',lease['event_id'],b.CLIENT,lease['lease_binding_version'],lease['attempt_version'],lease['lease_id'],result,known,etag,meet,error)
def prepare(store,index,meet=False):
    event=l.eid(index);l.call(store,event,kind='meet' if meet else 'appointment',payload=dict(l.PAYLOAD,withMeet=meet))
    return c.call(store,'claim',event,0)
def guard_triggers(f):
    archive=(REPO/'supabase/migrations/20261012010000_company_archive.sql').read_text()
    start=archive.index('create function public.zelo_company_archived_locked(')
    end=archive.index('do $$declare t text;begin',start)
    f.sql(archive[start:end])
    for table in ['appointments','meets']:
        f.sql('create trigger zz_zelo_company_active_guard before insert or update or delete on public.'+table+' for each row execute function public.zelo_company_active_guard();')
def hold_rows(f,sql,marker):
    # Fictitious test session only. Write readiness marker from psql after row locks,
    # not a time-based guess; no customer shell/database/credentials are involved.
    command="set statement_timeout='20s';set lock_timeout='10s';set role service_role;begin;"+sql+'\n\\! touch '+str(marker)+"\nselect pg_sleep(2);commit;"
    return subprocess.Popen([str(f.binary/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-h',str(f.socket),'-p',f.port,'-U','google_state_fixture','-d','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=f.env),command
def contend(f,store,lease,table):
    marker=f.root/('locked-'+table)
    process,command=hold_rows(f,'select 1 from public.'+table+' where id='+quote(lease['event_id'])+' for update;',marker)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        completion=executor.submit(process.communicate,command,timeout=10)
        deadline=time.monotonic()+5
        while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
        check(marker.exists(),'Contention fixture did not acquire row lock')
        try:
            f.sql(preflight(store,lease),'service_role');check(False,'Contended local row allowed effect')
        except s.SqlFailure as error:
            check('SQLSTATE P0001' in str(error),'Local contention escaped through a deadlock/timeout/raw SQL error')
        check(process.poll() is None,'Local contention waited for the holding row instead of NOWAIT')
        completion.result()
    check(process.returncode==0,'Holding fixture session failed')

def verify(f,baseline):
    a=b.Store(f);a.save(subject='fictitious-local-effects')
    lease=prepare(a,1,True)
    if baseline:
        f.read(active(a,lease['event_id']),'service_role');check(False,'RED: missing local active RPC unexpectedly exists');return
    protected=l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==protected,'Effects migration changed existing data/credentials/roles/schema')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Effect helper elevated rights/search path')
        for role in ['anon','authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited effect RPC')
        check(f.sql("select has_function_privilege('service_role',"+quote(signature)+",'EXECUTE');")=='t','Backend missing effect helper')
    check(f.read(active(a,lease['event_id']),'service_role') is True,'Mapped active rows were denied')
    check(f.read(preflight(a,lease),'service_role') is True,'Valid captured lease was denied')
    for role in ['anon','authenticated']:f.rejected(active(a,lease['event_id']),'Browser invoked active check',role)
    for scope in [b.Store(f,company=s.COMPANY_B),b.Store(f,company=None),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:
        f.rejected(active(scope,lease['event_id']),'Foreign scope authorized local effect','service_role')
    f.rejected(active(a,l.eid(900)),'Legacy appointment became effect authority','service_role')
    for patch in [dict(lease_id=l.eid(80)),dict(attempt_version='0'),dict(lease_binding_version='99')]:
        f.rejected(preflight(a,dict(lease,**patch)),'Superseded lease passed preflight','service_role')
    f.rejected(preflight(a,lease,client=s.digest('other-client')),'Wrong client passed preflight','service_role')
    f.sql("update google_workspace.event_creations set lease_until=clock_timestamp()+interval '10 seconds' where event_id="+quote(lease['event_id'])+';')
    f.rejected(preflight(a,lease),'Too-short network lease was accepted','service_role')
    f.sql("update google_workspace.event_creations set lease_until=clock_timestamp()+interval '60 seconds' where event_id="+quote(lease['event_id'])+';')
    # Existing public writers use the real company triggers; NOWAIT has to resolve
    # the opposing row/owner acquisition order rather than leave a deadlock cycle.
    contend(f,a,lease,'appointments');contend(f,a,lease,'meets')
    for table in ['appointments','meets']:
        f.sql('update public.'+table+" set status='cancelled' where id="+quote(lease['event_id'])+';')
        before=l.all_rows(f)
        f.rejected(active(a,lease['event_id']),'Cancelled row passed active check','service_role')
        f.rejected(preflight(a,lease),'Cancelled row passed leased preflight','service_role')
        f.rejected(finish(a,lease,meet=c.MEET),'Cancelled row published provider result','service_role')
        check(l.all_rows(f)==before,'Denied completion partially mutated state/history')
        f.sql('update public.'+table+" set status='scheduled' where id="+quote(lease['event_id'])+';')
    # Provider completion must not overwrite metadata edited since creation.
    f.sql("update public.appointments set title='Locally edited',description='Local note',ata_content='Local minutes',reminder_sent_at='2070-01-01' where id="+quote(lease['event_id'])+";update public.meets set title='Locally edited Meet',ata_content='Local Meet minutes',attendees='[{\"name\":\"Local contact\"}]' where id="+quote(lease['event_id'])+';')
    metadata=f.sql("select jsonb_build_object('a',(select to_jsonb(a)-array['calendar_event_id','meet_link'] from public.appointments a where id="+quote(lease['event_id'])+"),'m',(select to_jsonb(m)-array['calendar_event_id','meet_link'] from public.meets m where id="+quote(lease['event_id'])+'));')
    f.sql("create function public.fixture_fail_publication() returns trigger language plpgsql as $$begin raise exception 'FICTIONAL_PUBLICATION_FAILURE';end;$$;create trigger fixture_fail_publication before update on public.meets for each row execute function public.fixture_fail_publication();")
    before=l.all_rows(f);f.rejected(finish(a,lease,meet=c.MEET),'Second-row publication failure was swallowed','service_role')
    check(l.all_rows(f)==before,'Failed publication left private/public partial completion')
    f.sql('drop trigger fixture_fail_publication on public.meets;drop function public.fixture_fail_publication();')
    done=f.read(finish(a,lease,meet=c.MEET),'service_role')
    check(done['state']=='succeeded' and done['meet_link']==c.MEET,'Valid linked finish failed')
    expected_event=o.expected_id(s.OWNER,'business',s.COMPANY_A,lease['event_id'])
    values=f.read('select jsonb_build_object(\'a\',a.calendar_event_id,\'a_link\',a.meet_link,\'m\',m.calendar_event_id,\'m_link\',m.meet_link) from public.appointments a join public.meets m using(id) where a.id='+quote(lease['event_id'])+';')
    check(values['m']==expected_event and values['a_link']==values['m_link']==c.MEET,'Original event/Meet fields not published together')
    check(json.loads(values['a'][5:])=={'eventId':expected_event,'calendarId':'primary'},'Published agenda moved original calendar/ID')
    after=f.sql("select jsonb_build_object('a',(select to_jsonb(a)-array['calendar_event_id','meet_link'] from public.appointments a where id="+quote(lease['event_id'])+"),'m',(select to_jsonb(m)-array['calendar_event_id','meet_link'] from public.meets m where id="+quote(lease['event_id'])+'));')
    check(after==metadata,'Completion overwrote local note/minutes/reminder/attendees')
    f.rejected(finish(a,lease,meet=c.MEET),'Old successful worker published twice','service_role')
    pending=prepare(a,2,True)
    before=l.rows(f);f.rejected(finish(a,pending,known=False,etag=None,meet=c.MEET),'Publication accepted sticky knowledge instead of current verified outcome','service_role')
    check(l.rows(f)==before,'Invalid verified outcome published fields')
    waiting=f.read(finish(a,pending,result='waiting'),'service_role');check(waiting['state']=='waiting','Conference pending was lost')
    next_lease=c.call(a,'claim',pending['event_id'],waiting['attempt_version'])
    before=l.rows(f);f.read(finish(a,next_lease,result='failed',known=False,etag=None,error='FOREIGN_EVENT'),'service_role')
    check(l.rows(f)==before,'Sticky known failed outcome published new public fields')
    changed=prepare(a,3);original=a.binding();a.call('binding_select_calendar',original['version'],'different-calendar','Fixture')
    before=l.all_rows(f);f.rejected(preflight(a,changed),'Changed binding passed old preflight','service_role');f.rejected(finish(a,changed),'Changed binding published result','service_role');check(l.all_rows(f)==before,'Changed binding result partially committed')
    unlinked=prepare(a,4);a.call('binding_unlink',a.binding()['version']);before=l.all_rows(f)
    f.rejected(finish(a,unlinked),'Unlink revived/published creation','service_role');check(l.all_rows(f)==before,'Unlinked result partially committed')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-personal-effects');own=prepare(personal,5)
    f.read(finish(personal,own),'service_role');check(f.sql('select company_id is null and meet_link is null from public.appointments where id='+quote(own['event_id'])+';')=='t','Personal publication adopted a company/Meet')
    concurrent=b.Store(f,company=s.COMPANY_B);concurrent.save(subject='fictitious-concurrent-effects')
    for index in range(6,10):
        racing=prepare(concurrent,index,True)
        outcomes=o.race(f,[finish(concurrent,racing,meet=c.MEET),"update public.appointments set status='cancelled' where id="+quote(racing['event_id'])+';'])
        check(any(ok for ok,_ in outcomes) and (outcomes[0][0] or outcomes[0][1]=='P0001')
          and (outcomes[1][0] or outcomes[1][1]=='55P03'),'Cancel/finish race deadlocked/timed out or leaked a raw finish SQL error')
        state=c.get(concurrent,racing['event_id'])
        if outcomes[0][0]:
            check(state['state']=='succeeded' and state['meet_link']==c.MEET,'Successful race finish lost private completion')
            check(f.sql("select a.meet_link=m.meet_link and m.meet_link="+quote(c.MEET)+' from public.appointments a join public.meets m using(id) where a.id='+quote(racing['event_id'])+';')=='t','Successful race published only one local result')
        else:
            check(state['state']=='running','Denied race finish partially committed lifecycle')
            check(f.sql("select a.meet_link is null and m.meet_link='' and m.calendar_event_id='' from public.appointments a join public.meets m using(id) where a.id="+quote(racing['event_id'])+';')=='t','Denied race published partial provider fields')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';')
    f.rejected(active(a,lease['event_id']),'Archived scope remained effect-authorized','service_role')
    check(s.legacy_snapshot(f)==protected[2],'Effect guards changed old encrypted credentials')
    before=l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((l.all_rows(f),b.snapshot(f),s.legacy_snapshot(f))==before,'Effects rollback discarded history/credentials')
    f.rejected(active(personal,own['event_id']),'Rollback left new effects access open','service_role')
    check(l.get(personal,own['event_id']) is not None,'Rollback closed pre-existing history getter')
    print('PASS local effect guards/completion: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-local-effects-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={k:v for k,v in f.env.items() if k.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);guard_triggers(f)
            f.sql((REPO/'supabase/migrations'/l.NAME).read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""Atomic local linkage on disposable Unix-socket PostgreSQL, fictitious data only."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback

spec=importlib.util.spec_from_file_location('creation_fixture',pathlib.Path(__file__).with_name('run-google-event-creation.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
o,b,s=c.o,c.b,c.s
check,quote,REPO=s.check,s.quote,o.REPO
NAME='20261013100000_google_event_local_links.sql'
MIGRATOR='google_local_migrator'
RELATION='google_workspace.event_links'
FUNCTIONS=['public.zelo_google_event_local_get(uuid,text,uuid,uuid)',
 'public.zelo_google_event_local_create(uuid,text,uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,jsonb)']
PAYLOAD={'summary':'Fictitious event','description':'Private local note','location':'Fixture room',
 'startAt':'2070-01-01T10:00:00.000Z','endAt':'2070-01-01T11:00:00.000Z',
 'allDay':False,'repeat':'none','attendees':[],'withMeet':False}
ATTENDEES=[{'name':'Fictitious person','phone':'+5511999990000','email':'fixture@example.test'}]

def eid(index):return 'eeeeeeee-eeee-4eee-8eee-'+format(index,'012x')
def get_sql(store,event):return store.command('event_local_get',event)
def get(store,event):return store.fixture.read(get_sql(store,event),'service_role')
def create(store,event,kind='appointment',payload=None,source='web',attendees=None,target=None):
    selected=store.binding() if target is None else target
    values=[event,selected['id'],selected['grant_id'],selected['version'],b.CLIENT,
      json.dumps(PAYLOAD if payload is None else payload),kind,source,json.dumps([] if attendees is None else attendees)]
    return store.command('event_local_create',*values)
def call(store,event,**kwargs):return store.fixture.read(create(store,event,**kwargs),'service_role')
def rows(f):
    return f.sql("select jsonb_build_object('appointments',(select jsonb_agg(to_jsonb(a) order by id) from public.appointments a),"
      "'meets',(select jsonb_agg(to_jsonb(m) order by id) from public.meets m));")
def all_rows(f):return rows(f),o.origins(f),c.snapshot(f),f.sql("select coalesce(jsonb_agg(to_jsonb(l) order by event_id),'[]') from "+RELATION+' l;')
def setup_local(f):
    schema=(REPO/'supabase/schema.sql').read_text()
    for table in ['appointments','meets']:
        start=schema.index('create table if not exists '+table+' (')
        end=schema.index('\n);',start)+3
        f.sql(schema[start:end].replace('create table if not exists','create table')+
         'alter table public.'+table+' add column company_id uuid,add column workspace_legacy boolean not null default true,'
         'add foreign key(company_id,user_id) references public.companies(id,user_id);'
         'alter table public.'+table+' owner to '+MIGRATOR+';alter table public.'+table+' enable row level security;'
         'revoke all on public.'+table+' from public,anon,authenticated;grant select,insert,update,delete on public.'+table+' to service_role;')
    # The actual company trigger must not guess the default company for new rows.
    companies=(REPO/'supabase/migrations/20261011160000_companies.sql').read_text()
    start=companies.index('create function public.zelo_public_company_guard()')
    end=companies.index('revoke all on function public.zelo_public_company_guard()',start)
    f.sql(companies[start:end]+'revoke all on function public.zelo_public_company_guard() from public,anon,authenticated;')
    for table in ['appointments','meets']:
        f.sql('create trigger zelo_company_guard before insert or update on public.'+table+' for each row execute function public.zelo_public_company_guard();')
    f.sql("insert into public.appointments(id,user_id,title,start_at) values("+quote(eid(900))+','+quote(s.OWNER)+",'Existing legacy event','2070-01-01');"
      "insert into public.meets(id,user_id,title,start_at,end_at,attendees) values("+quote(eid(901))+','+quote(s.OWNER)+",'Existing legacy Meet','2070-01-01','2070-01-02','[]');")

def verify(f,baseline):
    if baseline:
        get(b.Store(f),eid(1));check(False,'RED: local-link RPC already exists')
        return
    before=rows(f),o.origins(f),c.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((rows(f),o.origins(f),c.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==before,'Migration changed existing history/credentials/roles/schema privileges')
    check(f.sql('select relrowsecurity from pg_class where oid='+quote(RELATION)+'::regclass;')=='t','Linkage lacks RLS')
    check(f.sql('select count(*)=0 from pg_policy where polrelid='+quote(RELATION)+'::regclass;')=='t','Linkage added browser policy')
    for role in ['anon','authenticated']:
        check(f.sql('select has_table_privilege('+quote(role)+','+quote(RELATION)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser inherited private linkage access')
        f.rejected(get_sql(b.Store(f),eid(1)),'Browser invoked private getter',role)
    for permission in ['SELECT','INSERT']:
        check(f.sql("select has_table_privilege('service_role',"+quote(RELATION)+','+quote(permission)+');')=='t','Backend missing required privilege')
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql("select has_table_privilege('service_role',"+quote(RELATION)+','+quote(permission)+');')=='f','Backend got mutable/destructive linkage access')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Linkage elevates rights/search path')
        for role in ['anon','authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited RPC execution')
    stores=[b.Store(f),b.Store(f,company=s.COMPANY_B),b.Store(f,company=None),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]
    for index,store in enumerate(stores):store.save(subject='local-link-fixture-'+str(index))
    a,other,personal,foreign=stores
    protected=b.snapshot(f),s.legacy_snapshot(f)
    before=all_rows(f)
    invalid=[dict(payload=[]),dict(payload=dict(PAYLOAD,ownerId=s.OTHER)),dict(payload=dict(PAYLOAD,withMeet=None)),
      dict(payload=dict(PAYLOAD,repeat='forever')),dict(payload=dict(PAYLOAD,endAt=PAYLOAD['startAt'])),
      dict(payload=dict(PAYLOAD,startAt='2070-02-30T10:00:00.000Z')),dict(payload=dict(PAYLOAD,startAt='2070-01-01T25:00:00.000Z')),
      dict(payload=dict(PAYLOAD,startAt='2070-01-01T10:00:00-03:00')),dict(payload=dict(PAYLOAD,attendees=[{'email':'fixture@example.test','ownerId':s.OTHER}])),
      dict(payload=dict(PAYLOAD,allDay=True,startAt='2070-02-30',endAt='2070-03-03')),dict(payload=dict(PAYLOAD,summary='')),
      dict(kind='other'),dict(kind='meet'),dict(kind='meet',payload=dict(PAYLOAD,withMeet=True,repeat='daily')),
      dict(source=None),dict(source='other'),dict(attendees=ATTENDEES),dict(kind='meet',payload=dict(PAYLOAD,withMeet=True),attendees=[{'name':'Fictitious','secret':'rejected'}])]
    for patch in invalid:
        f.rejected(create(a,eid(99),**patch),'Malformed/extra local/provider input was accepted','service_role')
    check(all_rows(f)==before,'Invalid input left local/origin records')
    for legacy in [eid(900),eid(901)]:
        check(get(a,legacy) is None,'Legacy row acquired inferred provenance')
        unchanged=all_rows(f)
        f.rejected(create(a,legacy),'Existing local UUID was adopted','service_role')
        check(all_rows(f)==unchanged,'Collision partially reserved origin/payload')
    result=call(a,eid(1))
    check(result=={'event_id':eid(1),'appointment_id':eid(1),'meet_id':None,'kind':'appointment','local_metadata':{'source':'web','attendees':[]}},'Wrong private linkage DTO')
    check(f.sql('select company_id='+quote(s.COMPANY_A)+"::uuid and not workspace_legacy and calendar_event_id is null and meet_link is null from public.appointments where id="+quote(eid(1))+';')=='t','Appointment was not explicitly scoped or leaked provisional provider fields')
    before=all_rows(f)
    check(call(a,eid(1))==result and all_rows(f)==before,'Same intent duplicated/changed records')
    f.sql("update public.appointments set title='Locally edited',ata_content='Local minutes',reminder_sent_at='2070-01-01' where id="+quote(eid(1))+';')
    before=all_rows(f)
    check(call(a,eid(1))==result and all_rows(f)==before,'Retry overwrote edited metadata')
    for store in [other,personal,foreign]:
        check(get(store,eid(1)) is None,'Getter crossed owner/space')
        f.rejected(create(store,eid(1)),'Another scope reused logical UUID','service_role')
    for patch in [dict(payload=dict(PAYLOAD,summary='Different')),dict(kind='meet',payload=dict(PAYLOAD,withMeet=True)),dict(source='whatsapp')]:
        f.rejected(create(a,eid(1),**patch),'Changed immutable input was accepted','service_role')
    check(all_rows(f)==before,'Rejected intent changed local records')
    meeting=dict(PAYLOAD,withMeet=True,attendees=[{'email':'fixture@example.test','displayName':'Fictitious person'}])
    link=call(other,eid(2),kind='meet',payload=meeting,source='whatsapp',attendees=ATTENDEES)
    check(link['appointment_id']==link['meet_id']==eid(2),'Meet and agenda do not share one logical intent')
    check(f.sql("select m.meet_link='' and m.calendar_event_id='' and m.attendees="+quote(json.dumps(ATTENDEES))+"::jsonb and not m.workspace_legacy and not a.workspace_legacy and m.company_id=a.company_id and a.title='🎥 Fictitious event' from public.meets m join public.appointments a using(id) where m.id="+quote(eid(2))+';')=='t','Meet metadata/scope/provisional fields not preserved')
    check(call(other,eid(2),kind='meet',payload=meeting,source='whatsapp',attendees=ATTENDEES)==link,'Meet replay duplicated records')
    f.rejected(create(other,eid(2),kind='meet',payload=meeting,source='whatsapp',attendees=[]),'Local attendee change silently adopted','service_role')
    all_day=dict(PAYLOAD,allDay=True,startAt='2070-01-01',endAt='2070-01-03')
    call(personal,eid(3),payload=all_day)
    check(f.sql("select company_id is null and not workspace_legacy and start_at='2070-01-01T03:00:00Z'::timestamptz and end_at='2070-01-03T03:00:00Z'::timestamptz from public.appointments where id="+quote(eid(3))+';')=='t','Personal/all-day dates shifted or default company was guessed')
    # Failed second public insert must roll back origin, creation and appointment.
    f.sql("create function public.fixture_reject_meet() returns trigger language plpgsql as $$begin raise exception 'FICTIONAL_INSERT_FAILURE';end;$$;create trigger fixture_reject_meet before insert on public.meets for each row execute function public.fixture_reject_meet();")
    before=all_rows(f)
    f.rejected(create(a,eid(4),kind='meet',payload=meeting,attendees=ATTENDEES),'Second insert failure was swallowed','service_role')
    check(all_rows(f)==before,'Failed Meet left a partial local/origin record')
    f.sql('drop trigger fixture_reject_meet on public.meets;drop function public.fixture_reject_meet();')
    races=o.race(f,[create(a,eid(5),kind='meet',payload=meeting,attendees=ATTENDEES)]*8)
    check(all(ok for ok,_ in races) and len({value for _,value in races})==1,'Concurrent replay failed/deadlocked or returned different links')
    check(f.sql('select (select count(*) from public.appointments where id='+quote(eid(5))+')=1 and (select count(*) from public.meets where id='+quote(eid(5))+')=1;')=='t','Concurrent replay created duplicate local records')
    # Actual owner-composite FKs must reject cross-owner references, even on the
    # direct private INSERT privilege; the getter also checks every local scope.
    f.read(o.reserve(foreign,eid(20)),'service_role')
    f.read(c.mutation(foreign,'prepare',eid(20),json.dumps(PAYLOAD),False),'service_role')
    f.sql('insert into public.appointments(id,user_id,company_id,workspace_legacy,title,start_at) values('+quote(eid(20))+','+quote(s.OWNER)+','+quote(s.COMPANY_A)+",false,'Unverified fictitious local row','2070-01-01');")
    for owner in [s.OWNER,s.OTHER]:
        f.rejected('insert into '+RELATION+'(event_id,user_id,appointment_id,kind,local_metadata) values('+quote(eid(20))+','+quote(owner)+','+quote(eid(20))+",'appointment','{}');",'Composite FK accepted borrowed origin/appointment','service_role')
    f.sql('update public.appointments set workspace_legacy=true where id='+quote(eid(1))+';')
    check(get(a,eid(1)) is None,'Getter treated legacy local scope as verified')
    f.sql('update public.appointments set workspace_legacy=false where id='+quote(eid(1))+';')
    collision=o.race(f,[create(personal,eid(6)),create(foreign,eid(6))])
    check(sum(ok for ok,_ in collision)==1 and all(ok or code in ('P0001','23505') for ok,code in collision),'Cross-owner collision had two/zero winners or deadlock')
    # Active/current binding is required only to reserve a new logical event.
    old=a.binding();a.call('binding_select_calendar',old['version'],'changed-calendar','Fixture')
    check(call(a,eid(1),target=old)==result,'History replay consulted changed Google connection')
    f.rejected(create(a,eid(7),target=old),'Stale binding reserved new records','service_role')
    a.call('binding_unlink',a.binding()['version'])
    check(call(a,eid(1),target=old)==result and get(a,eid(1))==result,'Unlink discarded local history/replay')
    f.rejected(create(a,eid(7),target=old),'Unlinked connection reserved new records','service_role')
    raced=o.race(f,[create(other,eid(8)),other.command('binding_unlink',other.binding()['version'])])
    check(raced[1][0] and (raced[0][0] or raced[0][1]=='P0001'),'Create/unlink race deadlocked or revived connection')
    check((get(other,eid(8)) is not None)==raced[0][0],'Race published a partial local link')
    huge='9223372036854775806'
    f.sql('update google_workspace.bindings set version='+huge+' where id='+quote(personal.binding()['id'])+';')
    call(personal,eid(9))
    check(f.sql('select binding_version::text from google_workspace.event_origins where event_id='+quote(eid(9))+';')==huge,'Local transaction rounded binding revision')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';')
    f.rejected(get_sql(a,eid(1)),'Archived workspace still accessible','service_role')
    check(get(personal,eid(3)) is not None and (get(foreign,eid(6)) is not None or get(personal,eid(6)) is not None),'Archive affected unrelated workspace')
    check(s.legacy_snapshot(f)==protected[1],'Local transaction changed legacy credential bytes')
    race_company='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9'
    f.sql('insert into public.companies(id,user_id,name) values('+quote(race_company)+','+quote(s.OTHER)+",'Fictitious archive race');")
    archive_store=b.Store(f,owner=s.OTHER,company=race_company);archive_store.save(subject='local-archive-fixture')
    archive_command='begin;select 1 from public.users where id='+quote(s.OTHER)+' for update;update public.companies set archived_at=clock_timestamp() where id='+quote(race_company)+';commit;'
    outcomes=o.race(f,[create(archive_store,eid(21)),archive_command])
    check(outcomes[1][0] and (outcomes[0][0] or outcomes[0][1]=='P0001'),'Create/archive race deadlocked or accepted archived scope')
    check(f.sql('select count(*) from '+RELATION+' where event_id='+quote(eid(21))+';')==('1' if outcomes[0][0] else '0'),'Archive race partially linked records')
    f.rejected(get_sql(archive_store,eid(21)),'Archived race result remained accessible','service_role')
    # Restrictive FK/append-only mapping preserves history for future cancellation.
    f.rejected('delete from public.appointments where id='+quote(eid(3))+';','Linked appointment deletion discarded provenance','service_role')
    f.rejected('update '+RELATION+" set kind='meet';",'Backend mutated immutable linkage','service_role')
    f.rejected('delete from '+RELATION+';','Backend discarded linkage history','service_role')
    before=all_rows(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((all_rows(f),b.snapshot(f),s.legacy_snapshot(f))==before,'Rollback deleted/rewrote history or credentials')
    f.rejected(get_sql(personal,eid(3)),'Rollback left new access open','service_role')
    print('PASS atomic local linkage: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-local-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={k:v for k,v in f.env.items() if k.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');setup_local(f);verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

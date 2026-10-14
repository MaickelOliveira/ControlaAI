#!/usr/bin/env python3
"""Local-only idempotent appointments on disposable PostgreSQL, fictitious data."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback
spec=importlib.util.spec_from_file_location('owner_fixture',pathlib.Path(__file__).with_name('run-google-active-owner-boundary.py'))
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
j,x,l,c,o,b,s=a.j,a.x,a.l,a.c,a.o,a.b,a.s
REPO,quote,check,MIGRATOR=a.REPO,a.quote,a.check,a.MIGRATOR
NAME='20261013180000_google_local_appointment_receipts.sql'
RELATION='google_workspace.local_appointment_receipts'
FUNCTIONS=['public.zelo_google_local_appointment_get(uuid,text,uuid,uuid)','public.zelo_google_local_appointment_create(uuid,text,uuid,uuid,jsonb,text)']
def create(store,event,payload=None,source='web'):
    return store.command('local_appointment_create',event,json.dumps(l.PAYLOAD if payload is None else payload),source)
def get(store,event):return store.fixture.read(store.command('local_appointment_get',event),'service_role')
def receipts(f):return f.sql("select coalesce(jsonb_agg(to_jsonb(r) order by event_id),'[]') from "+RELATION+' r;')
def verify(f,baseline):
    personal=b.Store(f,company=None);event=l.eid(10)
    if baseline:
        f.read(create(personal,event),'service_role');check(False,'RED: local receipt RPC exists');return
    before=a.protected(f);f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR);check(a.protected(f)==before,'Receipt migration changed public/private history or ACLs')
    check(f.sql('select relrowsecurity from pg_class where oid='+quote(RELATION)+'::regclass;')=='t','Receipt RLS disabled')
    for role in ['anon','authenticated']:
        check(f.sql('select has_table_privilege('+quote(role)+','+quote(RELATION)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser inherited receipts')
        f.rejected(create(personal,event),'Browser created receipt',role)
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql("select has_table_privilege('service_role',"+quote(RELATION)+','+quote(permission)+');')=='f','Backend mutable/destructive receipt privilege')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Receipt RPC elevates rights/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited receipt RPC')
    protected=b.snapshot(f),s.legacy_snapshot(f),a.r.activation_rows(f),o.origins(f),c.snapshot(f)
    receipt=f.read(create(personal,event),'service_role');check(receipt=={'event_id':event,'user_id':s.OWNER,'mode':'personal','company_id':None,'payload':l.PAYLOAD,'source':'web'},'Receipt gained provider IDs or wrong scope')
    check(f.sql('select company_id is null and not workspace_legacy and calendar_event_id is null and meet_link is null from public.appointments where id='+quote(event)+';')=='t','Local appointment inferred company/provenance')
    check((b.snapshot(f),s.legacy_snapshot(f),a.r.activation_rows(f),o.origins(f),c.snapshot(f))==protected,'Local insert created Google state/activation or changed credentials')
    f.sql("update public.appointments set title='Edited',status='cancelled',ata_content='Local minutes',reminder_sent_at='2070-01-01' where id="+quote(event)+';');before=l.rows(f),receipts(f)
    check(f.read(create(personal,event),'service_role')==receipt and (l.rows(f),receipts(f))==before,'Replay overwrote edited/canceled local row')
    for payload in [dict(l.PAYLOAD,summary='Changed'),dict(l.PAYLOAD,withMeet=True)]:f.rejected(create(personal,event,payload),'Changed intent accepted','service_role')
    f.rejected(create(personal,event,source='whatsapp'),'Changed source accepted','service_role')
    business=b.Store(f);other=b.Store(f,company=s.COMPANY_B);foreign=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)
    for store in [business,other,foreign]:
        check(get(store,event) is None,'Receipt getter crossed scope');f.rejected(create(store,event),'Cross-scope UUID reuse accepted','service_role')
    for collision in [l.eid(900),l.eid(901)]:f.rejected(create(business,collision),'Legacy public UUID adopted','service_role')
    business.save(subject='fictitious-receipt-google');linked=j.created(business,20);f.rejected(create(business,linked),'Scoped Google intent became local receipt','service_role')
    for payload in [[],dict(l.PAYLOAD,ownerId=s.OTHER),dict(l.PAYLOAD,withMeet=None),dict(l.PAYLOAD,summary=''),dict(l.PAYLOAD,allDay=None),dict(l.PAYLOAD,endAt=l.PAYLOAD['startAt']),dict(l.PAYLOAD,startAt='2070-02-30T10:00:00.000Z'),dict(l.PAYLOAD,startAt='2070-01-01T25:00:00.000Z'),dict(l.PAYLOAD,repeat='forever'),dict(l.PAYLOAD,attendees=[{'email':'fixture@example.test','displayName':'Fixture','token':'bad'}]),dict(l.PAYLOAD,description='x'*33000)]:
        f.rejected(create(personal,l.eid(99),payload),'Malformed canonical payload accepted','service_role')
    for source in [None,'test']:f.rejected(create(personal,l.eid(99),source=source),'Invalid source accepted','service_role')
    check(get(personal,l.eid(99)) is None,'Rejected input left receipt')
    day=dict(l.PAYLOAD,allDay=True,startAt='2070-01-01',endAt='2070-01-03',repeat='weekly');f.read(create(personal,l.eid(11),day),'service_role')
    check(f.sql("select start_at='2070-01-01T03:00:00Z'::timestamptz and end_at='2070-01-03T03:00:00Z'::timestamptz and repeat='weekly' from public.appointments where id="+quote(l.eid(11))+';')=='t','Local all-day/repeat dates shifted')
    f.sql("create function public.fixture_reject_local() returns trigger language plpgsql as $$begin raise exception 'FICTITIOUS_FAILURE';end;$$;create trigger fixture_reject_local before insert on "+RELATION+' for each row execute function public.fixture_reject_local();');before=l.rows(f),receipts(f)
    f.rejected(create(personal,l.eid(12)),'Receipt failure swallowed','service_role');check((l.rows(f),receipts(f))==before,'Receipt insert failure left orphan appointment');f.sql('drop trigger fixture_reject_local on '+RELATION+';drop function public.fixture_reject_local();')
    raced=o.race(f,[create(personal,l.eid(13))]*8);check(all(ok for ok,_ in raced) and len({value for _,value in raced})==1,'Concurrent repeat deadlocked/differed')
    check(f.sql('select count(*)=1 from public.appointments where id='+quote(l.eid(13))+';')=='t','Concurrent repeat duplicated appointment')
    raced=o.race(f,[create(personal,l.eid(14)),create(foreign,l.eid(14))]);check(sum(ok for ok,_ in raced)==1,'Cross-owner UUID collision had two/zero winners')
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');f.rejected(create(personal,l.eid(15)),'Inactive owner created local record','service_role');f.rejected(personal.command('local_appointment_get',event),'Inactive owner read receipt','service_role')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';');f.read(create(business,l.eid(16)),'service_role');f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');f.rejected(create(business,l.eid(17)),'Archived company created receipt','service_role');f.rejected(business.command('local_appointment_get',l.eid(16)),'Archived company read receipt','service_role')
    # Erasing an owner cascades owned public rows and immutable receipts.
    f.read(create(foreign,l.eid(18)),'service_role');f.sql('delete from public.users where id='+quote(s.OTHER)+';');check(f.sql('select not exists(select 1 from '+RELATION+' where user_id='+quote(s.OTHER)+');')=='t','Owner erasure retained local receipt')
    before=l.rows(f),receipts(f),b.snapshot(f),a.r.activation_rows(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check((l.rows(f),receipts(f),b.snapshot(f),a.r.activation_rows(f))==before,'Rollback destroyed local/history/credential bytes');f.rejected(create(personal,l.eid(19)),'Rollback kept receipt creation open','service_role')
    print('PASS local appointment receipts: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
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
            for name in [l.NAME,x.NAME,j.NAME]:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql(args.activation_migration.read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/a.NAME).read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

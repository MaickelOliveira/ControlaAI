#!/usr/bin/env python3
"""Private original local replay input on disposable fictitious PostgreSQL."""
import argparse
import importlib.util
import pathlib
import tempfile
import traceback
spec=importlib.util.spec_from_file_location('user_fixture',pathlib.Path(__file__).with_name('run-google-event-user-mutations.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
d,a,j,x,l,c,o,b,s=u.d,u.a,u.j,u.x,u.l,u.c,u.o,u.b,u.s
REPO,quote,check,MIGRATOR=u.REPO,u.quote,u.check,u.MIGRATOR
NAME='20261013220000_google_local_mutation_replay.sql'
FUNCTION='public.zelo_google_appointment_local_mutation_get(uuid,text,uuid,uuid,uuid,text)'
def get(store,event,index,expected=None):return store.command('appointment_local_mutation_get',event,j.op(index),expected)
def verify(f,baseline):
    personal=b.Store(f,company=None);event=l.eid(1);f.read(d.create(personal,event),'service_role')
    original=dict(l.PAYLOAD,summary='Accepted local edit');metadata={'ata_content':'Original local minutes'};f.read(u.patch(personal,event,None,original,metadata,index=1),'service_role')
    if baseline:
        f.read(get(personal,event,1),'service_role');check(False,'RED: local mutation receipt getter exists');return
    before=j.snapshot(f),u.receipts(f),b.snapshot(f);f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR);check((j.snapshot(f),u.receipts(f),b.snapshot(f))==before,'Readonly getter migration changed stored bytes')
    check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(FUNCTION)+'::regprocedure;')=='t','Replay getter elevated rights/search path')
    for role in ['anon','authenticated']:
        check(f.sql('select has_function_privilege('+quote(role)+','+quote(FUNCTION)+",'EXECUTE');")=='f','Browser inherited replay input');f.rejected(get(personal,event,1),'Browser read original private input',role)
    expected={'payload':original,'metadata':metadata};check(f.read(get(personal,event,1),'service_role')==expected,'Getter returned private scope/provider metadata or wrong original input')
    f.read(u.patch(personal,event,None,dict(l.PAYLOAD,summary='Later local edit',startAt='2070-01-01T12:00:00.000Z',endAt='2070-01-01T13:00:00.000Z'),{'status':'cancelled'},index=2),'service_role');before=j.snapshot(f),u.receipts(f),b.snapshot(f)
    check(f.read(get(personal,event,1),'service_role')==expected,'Original receipt rebased after later edit/cancellation');check((j.snapshot(f),u.receipts(f),b.snapshot(f))==before,'Replay getter mutated current/history rows')
    check(f.read(get(personal,event,3),'service_role') is None,'Missing receipt adopted existing local row')
    f.rejected(get(personal,event,1,'v1:0:0:0'),'Original nullable token changed on replay','service_role')
    for store in [b.Store(f),b.Store(f,company=s.COMPANY_B),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:f.rejected(get(store,event,1),'Replay input crossed scope','service_role')
    business=b.Store(f);business.save(subject='fictitious-replay-linked');linked=j.created(business,2);token=u.token(business,linked);f.read(u.patch(business,linked,token,metadata={'ata_generated':True},index=10),'service_role')
    f.read(u.prepare(business,linked,11,token),'service_role');check(f.read(get(business,linked,10,token),'service_role')=={'payload':None,'metadata':{'ata_generated':True}},'Metadata receipt demanded latest journal token')
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');f.rejected(get(personal,event,1),'Inactive owner read original private input','service_role')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';');f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');f.rejected(get(business,linked,10,token),'Archived company read original input','service_role')
    before=j.snapshot(f),u.receipts(f),b.snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check((j.snapshot(f),u.receipts(f),b.snapshot(f))==before,'Replay getter rollback destroyed bytes');f.rejected(get(personal,event,1),'Rollback left replay getter open','service_role')
    print('PASS local mutation replay: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
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
            f.sql(args.activation_migration.read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/a.NAME).read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/d.NAME).read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/u.NAME).read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

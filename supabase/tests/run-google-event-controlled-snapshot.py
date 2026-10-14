#!/usr/bin/env python3
"""Controlled snapshot preserves latest guests, disposable fictitious PostgreSQL."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback
spec=importlib.util.spec_from_file_location('user_fixture',pathlib.Path(__file__).with_name('run-google-event-user-mutations.py'))
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
d,a,j,x,l,c,o,b,s=u.d,u.a,u.j,u.x,u.l,u.c,u.o,u.b,u.s
REPO,quote,check,MIGRATOR=u.REPO,u.quote,u.check,u.MIGRATOR
NAME='20261013200000_google_event_controlled_snapshot.sql'
FUNCTION='public.zelo_google_event_controlled_snapshot(uuid,text,uuid,uuid,text)'
def snapshot(store,event,expected=None):return store.command('event_controlled_snapshot',event,u.token(store,event) if expected is None else expected)
def verify(f,baseline):
    store=b.Store(f);store.save(subject='fictitious-controlled-snapshot');event=j.created(store,1)
    if baseline:
        f.read(snapshot(store,event),'service_role');check(False,'RED: controlled snapshot RPC exists');return
    protected=u.google(f),b.snapshot(f),s.legacy_snapshot(f),u.receipts(f);f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR);check((u.google(f),b.snapshot(f),s.legacy_snapshot(f),u.receipts(f))==protected,'Controlled helper migration changed stored bytes')
    check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(FUNCTION)+'::regprocedure;')=='t','Controlled helper elevated rights/search path')
    for role in ['anon','authenticated']:
        check(f.sql('select has_function_privilege('+quote(role)+','+quote(FUNCTION)+",'EXECUTE');")=='f','Browser inherited private controlled guests');f.rejected(snapshot(store,event),'Browser read private payload',role)
    initial=f.read(snapshot(store,event),'service_role');check(initial=={'kind':'appointment','payload':j.CHANGE,'local_attendees':[]},'Unexpected controlled snapshot/provider metadata')
    guests=[{'email':'new-fixture@example.test','displayName':'New guest'}];changed=dict(j.CHANGE,summary='New desired title',attendees=guests)
    f.read(u.prepare(store,event,1,u.token(store,event),payload=changed),'service_role');lease=j.claim(store,event,1);f.read(j.finish(store,lease),'service_role')
    f.read(u.prepare(store,event,2,u.token(store,event),'conference'),'service_role');current=u.token(store,event)
    before=j.snapshot(f),u.receipts(f),b.snapshot(f);read=f.read(snapshot(store,event,current),'service_role')
    check(read['payload']==changed and read['local_attendees']==[],'Conference head discarded latest desired email guests')
    check((j.snapshot(f),u.receipts(f),b.snapshot(f))==before,'Controlled read claimed/mutated journals or local rows')
    lease=j.claim(store,event,2);f.rejected(snapshot(store,event,current),'Controlled read adopted changed worker attempt on same head','service_role')
    f.read(j.finish(store,lease,'waiting'),'service_role');read=f.read(snapshot(store,event),'service_role');check(read['payload']['attendees']==guests,'Waiting conference changed desired attendees')
    for other in [b.Store(f,company=None),b.Store(f,company=s.COMPANY_B),b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)]:f.rejected(other.command('event_controlled_snapshot',event,u.token(store,event)),'Controlled payload crossed scope','service_role')
    personal=b.Store(f,company=None);personal.save(subject='fictitious-controlled-meet');meeting=j.created(personal,2,True);read=f.read(snapshot(personal,meeting),'service_role');check(read['kind']=='meet' and read['payload']['summary']==l.PAYLOAD['summary'],'Meet summary inherited agenda emoji prefix')
    attendees=l.ATTENDEES;guests=[{'email':attendees[0]['email'],'displayName':attendees[0]['name']}];updated=dict(j.CHANGE,summary='Meet current title',attendees=guests)
    f.read(personal.command('event_command_prepare_expected',meeting,j.op(3),u.token(personal,meeting),b.CLIENT,personal.binding()['version'],'update',json.dumps(updated),json.dumps(attendees)),'service_role');lease=j.claim(personal,meeting,3);f.read(j.finish(personal,lease),'service_role')
    read=f.read(snapshot(personal,meeting),'service_role');check(read['local_attendees']==attendees and read['payload']['attendees']==guests and read['payload']['summary']=='Meet current title','Meet desired names/phones or guests were changed/dropped')
    local=l.eid(3);f.read(d.create(personal,local),'service_role')
    for event_id in [local,l.eid(900)]:f.rejected(personal.command('event_controlled_snapshot',event_id,'v1:0:0:0'),'Unowned local/history inferred controlled provider payload','service_role')
    f.sql("update public.appointments set status='done' where id="+quote(meeting)+';');f.rejected(snapshot(personal,meeting),'Done row authorized controlled update','service_role');f.sql("update public.appointments set status='scheduled' where id="+quote(meeting)+";update public.meets set status='cancelled' where id="+quote(meeting)+';');f.rejected(snapshot(personal,meeting),'Canceled secondary Meet authorized controlled update','service_role')
    original=u.token(store,event)
    for status in ['inactive','trial']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');f.rejected(store.command('event_controlled_snapshot',event,original),'Inactive owner read private controlled payload','service_role')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';');f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';');f.rejected(store.command('event_controlled_snapshot',event,original),'Archived company read controlled payload','service_role')
    before=j.snapshot(f),u.receipts(f),b.snapshot(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check((j.snapshot(f),u.receipts(f),b.snapshot(f))==before,'Controlled read rollback destroyed history');f.rejected(personal.command('event_controlled_snapshot',local,'v1:0:0:0'),'Rollback left controlled read open','service_role')
    print('PASS controlled event snapshot: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
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

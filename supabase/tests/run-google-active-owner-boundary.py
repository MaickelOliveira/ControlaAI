#!/usr/bin/env python3
"""Active-owner Google boundary on disposable PostgreSQL, no real accounts."""
import argparse
import importlib.util
import pathlib
import tempfile
import traceback

spec=importlib.util.spec_from_file_location('recovery',pathlib.Path(__file__).with_name('run-google-event-recovery.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
j,x,l,c,o,b,s=r.j,r.x,r.l,r.c,r.o,r.b,r.s
REPO,quote,check,MIGRATOR=r.REPO,r.quote,r.check,r.MIGRATOR
NAME='20261013170000_google_active_owner_boundary.sql'
FUNCTIONS=['google_workspace.lock_workspace(uuid,text,uuid,boolean)','public.zelo_google_owner_activated(uuid)']
def activated(f,owner):return 'select to_jsonb(public.zelo_google_owner_activated('+quote(owner)+'));'
def protected(f):return j.snapshot(f),b.snapshot(f),s.legacy_snapshot(f),r.activation_rows(f),s.role_snapshot(f),s.schema_snapshot(f)
def verify(f,baseline):
    a=b.Store(f);a.save(subject='fictitious-owner-boundary');event=r.queued(a,1)
    selected=r.pending(f);check(any(row['event_id']==event for row in selected),'Fictitious creation absent from authorized batch')
    lease=c.call(a,'claim',event,0)
    command_event=j.created(a,2);f.read(j.prepare(a,command_event,1),'service_role')
    selected=r.pending(f);check(any(row['event_id']==command_event and row['operation_id']==j.op(1) for row in selected),'Fictitious command absent from authorized batch')
    command=j.claim(a,command_event,1)
    if baseline:
        f.sql("update public.users set status='inactive' where id="+quote(s.OWNER)+';')
        f.rejected(x.preflight(a,lease),'RED: inactive owner still passes existing creation preflight','service_role');return
    before=protected(f);f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check(protected(f)==before,'Active-owner migration changed history/credentials/activation/ACLs')
    for signature in FUNCTIONS:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(signature)+'::regprocedure;')=='t','Owner helper elevated rights/search path')
        for role in ['anon','authenticated']:check(f.sql('select has_function_privilege('+quote(role)+','+quote(signature)+",'EXECUTE');")=='f','Browser inherited owner RPC')
        check(f.sql("select has_function_privilege('service_role',"+quote(signature)+",'EXECUTE');")=='t','Backend missing prior owner helper')
    check(f.read(activated(f,s.OWNER),'service_role') is True,'Active owner lost existing activation')
    check(f.read(activated(f,s.OTHER),'service_role') is False,'First active owner consent requires prior activation')
    for status in ['inactive','trial','unknown']:
        f.sql('update public.users set status='+quote(status)+' where id='+quote(s.OWNER)+';');before=protected(f)
        f.rejected(activated(f,s.OWNER),'Old global transport received inactive false fallback','service_role')
        f.rejected('select google_workspace.lock_workspace('+quote(s.OWNER)+",'personal',null,false);",'Inactive owner passed personal read guard','service_role')
        f.rejected(a.command('binding_get'),'Inactive owner loaded scoped binding','service_role')
        f.rejected(l.get_sql(a,event),'Inactive owner loaded private local effect history','service_role')
        f.rejected(x.active(a,event),'Inactive owner entered credential runtime','service_role')
        f.rejected(x.preflight(a,lease),'Creation worker passed preflight after owner deactivation','service_role')
        f.rejected(x.finish(a,lease),'Creation worker published after owner deactivation','service_role')
        f.rejected(a.command('event_command_active',command_event,j.op(1)),'Command entered runtime after deactivation','service_role')
        f.rejected(j.preflight(a,command),'Command worker passed preflight after owner deactivation','service_role')
        f.rejected(j.finish(a,command),'Command worker published after owner deactivation','service_role')
        check(not any(row['user_id']==s.OWNER for row in r.pending(f)),'Deactivated owner retained selectable recovery jobs')
        check(protected(f)==before,'Denied inactive operations partially mutated private/public data')
    f.sql("update public.users set status='active' where id="+quote(s.OWNER)+';')
    check(f.read(x.preflight(a,lease),'service_role') is True and f.read(j.preflight(a,command),'service_role') is True,'Reactivation lost existing original lease/history')
    other=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY);other.save(subject='fictitious-first-owner-consent')
    check(f.read(activated(f,s.OTHER),'service_role') is True,'First scoped save failed to activate active owner')
    before=protected(f);f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR);check(protected(f)==before,'Owner-boundary rollback changed history/access/credentials')
    f.sql("update public.users set status='inactive' where id="+quote(s.OWNER)+';');f.rejected(x.preflight(a,lease),'Rollback restored inactive provider access','service_role');f.rejected(activated(f,s.OWNER),'Rollback restored old global inactive fallback','service_role')
    print('PASS Google active-owner boundary: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--activation-migration',type=pathlib.Path,default=REPO/'supabase/migrations/20261013120000_google_owner_activation.sql');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-active-owner-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';grant trigger on public.google_tokens to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql','20261013080000_google_event_origin.sql','20261013090000_google_event_creation.sql']:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');l.setup_local(f);x.guard_triggers(f)
            for name in [l.NAME,x.NAME,j.NAME]:f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql(args.activation_migration.read_text(),MIGRATOR);f.sql((REPO/'supabase/migrations'/r.NAME).read_text(),MIGRATOR);verify(f,args.baseline)
        finally:f.stop()
if __name__=='__main__':
    try:main()
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((item for item in reversed(frames) if pathlib.Path(item.filename).name==pathlib.Path(__file__).name),None)
        message=str(error) if isinstance(error,(AssertionError,s.SqlFailure)) else 'Fixture failed: '+type(error).__name__
        print(message+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""Sticky activation and legacy-write guard; disposable PostgreSQL only."""
import argparse
import concurrent.futures
import importlib.util
import pathlib
import re
import subprocess
import tempfile
import time

spec=importlib.util.spec_from_file_location('legacy_fixture',pathlib.Path(__file__).with_name('run-google-legacy-assignment.py'))
l=importlib.util.module_from_spec(spec);spec.loader.exec_module(l)
b,s=l.b,l.s
REPO,check,quote=l.REPO,s.check,s.quote
NAME='20261013120000_google_owner_activation.sql'
MIGRATOR=l.MIGRATOR

def activated(f,owner):
    return f.read('select to_jsonb(public.zelo_google_owner_activated('+quote(owner)+'));','service_role')

def new_owner(f,index):
    owner='90000000-0000-4000-8000-'+str(index).zfill(12)
    f.sql('insert into public.users(id,name) values('+quote(owner)+",'Fictitious activation owner');"+
        'insert into public.google_tokens(user_id,access_token,refresh_token,expires_at) values('+','.join(quote(v) for v in [owner,b.CIPHER,b.CIPHER,b.EXPIRY])+');')
    return b.Store(f,owner=owner,company=None)

def start_session(f,command):
    process=subprocess.Popen([str(f.binary/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-h',str(f.socket),'-p',f.port,'-U','google_state_fixture','-d','postgres'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=f.env)
    return process,command

def wait_marker(marker):
    deadline=time.monotonic()+5
    while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
    check(marker.exists(),'Fixture did not reach its declared lock boundary')

def contention(f,store,index):
    # Prove owner -> legacy row against legacy row -> owner, deterministically.
    source=l.read(f,'snapshot',owner=store.owner,mode='personal',company=None)['source_fingerprint']
    token_ready=f.root/('token-ready-'+str(index));owner_ready=f.root/('owner-ready-'+str(index))
    token_command="set statement_timeout='10s';set role service_role;begin;select 1 from public.google_tokens where user_id="+quote(store.owner)+' for update;\n\\! touch '+str(token_ready)+"\n\\! while [ ! -f "+str(owner_ready)+" ]; do sleep 0.01; done\nupdate public.google_tokens set expires_at=expires_at where user_id="+quote(store.owner)+';commit;'
    owner_command="set statement_timeout='10s';set role service_role;begin;select 1 from public.users where id="+quote(store.owner)+' for update;\n\\! touch '+str(owner_ready)+'\n'+l.assign_sql(store,source)+'commit;'
    token,token_command=start_session(f,token_command)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        token_result=pool.submit(token.communicate,token_command,timeout=15);wait_marker(token_ready)
        owner,owner_command=start_session(f,owner_command);owner_result=pool.submit(owner.communicate,owner_command,timeout=15);wait_marker(owner_ready)
        _,token_error=token_result.result();_,owner_error=owner_result.result()
    check(token.returncode!=0 and re.search(r'ERROR:\s+P0001\b',token_error) is not None,'Opposing legacy writer deadlocked/timed out or escaped unsanitized')
    check(owner.returncode==0,'Activation could not finish after NOWAIT refusal ('+('SQL_ERROR' if owner_error else 'EXIT')+')')
    check(activated(f,store.owner) is True,'Contention lost activation')

def verify(f,baseline):
    if baseline:
        activated(f,s.OWNER);check(False,'RED missing activation function unexpectedly exists');return
    legacy=s.legacy_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check(s.legacy_snapshot(f)==legacy,'Activation migration changed old ciphertext/ACLs')
    check(f.sql("select relrowsecurity and not exists(select 1 from pg_policy where polrelid=c.oid) from pg_class c where c.oid='google_workspace.owner_activations'::regclass;")=='t','Activation lacks private RLS')
    for signature in ['public.zelo_google_owner_activated(uuid)','google_workspace.activate_binding_owner()','google_workspace.guard_legacy_token_write()']:
        check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(signature)+'::regprocedure;')=='t','Activation helper elevated rights/search path')
    check(activated(f,s.OWNER) is False and activated(f,s.OTHER) is False,'Migration inferred activation from old credentials')
    for role in ['anon','authenticated']:
        f.rejected('select public.zelo_google_owner_activated('+quote(s.OWNER)+');','Browser read activation',role)
        check(f.sql('select has_table_privilege('+quote(role)+",'google_workspace.owner_activations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');")=='f','Browser has sticky table privileges')
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql("select has_table_privilege('service_role','google_workspace.owner_activations',"+quote(permission)+');')=='f','Backend can erase activation')
    before=b.snapshot(f)
    f.rejected(b.Store(f).save_sql(binding_version=99),'Failed OAuth save activated owner','service_role')
    check(activated(f,s.OWNER) is False and b.snapshot(f)==before,'Rejected save partially activated')
    # Old writes still work before the explicit scoped transaction.
    f.sql('update public.google_tokens set expires_at=expires_at where user_id='+quote(s.OWNER)+';','service_role')
    store=b.Store(f,company=None);binding=store.save(subject='fictitious-activation')
    check(activated(f,s.OWNER) is True,'Successful scoped save did not atomically activate')
    sticky=f.sql('select to_jsonb(a) from google_workspace.owner_activations a;')
    check(activated(f,s.OTHER) is False,'Activation spread to another owner')
    for statement in [
        'update public.google_tokens set expires_at=expires_at where user_id='+quote(s.OWNER)+';',
        'delete from public.google_tokens where user_id='+quote(s.OWNER)+';',
        'insert into public.google_tokens(user_id,access_token,refresh_token,expires_at) values('+','.join(quote(v) for v in [s.OWNER,b.CIPHER,b.CIPHER,b.EXPIRY])+') on conflict(user_id) do update set access_token=excluded.access_token;']:
        f.rejected(statement,'Activated owner allowed global token write','service_role')
    check(s.legacy_snapshot(f)==legacy,'Denied old writes changed credentials')
    store.call('binding_unlink',binding['version'])
    check(activated(f,s.OWNER) is True,'Unlink resumed legacy fallback')
    store.save(subject='fictitious-activation',binding_version=2,grant_version=1)
    check(f.sql('select to_jsonb(a) from google_workspace.owner_activations a;')==sticky,'Reconnect rewrote activation')
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check(activated(f,s.OWNER) is True,'Rollback removed activation guard')
    f.rejected('delete from public.google_tokens where user_id='+quote(s.OWNER)+';','Rollback reopened old credential writes','service_role')
    check(s.legacy_snapshot(f)==legacy,'Rollback changed old credential bytes')
    for index in range(1,9):
        racing=new_owner(f,index)
        if index<3:
            contention(f,racing,index);continue
        source=l.read(f,'snapshot',owner=racing.owner,mode='personal',company=None)['source_fingerprint']
        activation=racing.save_sql(subject='fictitious-race') if index%2 else l.assign_sql(racing,source)
        legacy_write='update public.google_tokens set expires_at=expires_at where user_id='+quote(racing.owner)+';' if index%3 else 'insert into public.google_tokens(user_id,access_token,refresh_token,expires_at) values('+','.join(quote(v) for v in [racing.owner,b.CIPHER,b.CIPHER,b.EXPIRY])+') on conflict(user_id) do update set expires_at=excluded.expires_at;'
        outcomes=l.race_states(f,[activation,legacy_write])
        check(outcomes[0][0] and (outcomes[1][0] or outcomes[1][2]=='P0001'),'Activation/legacy race deadlocked/timed out or leaked raw SQL failure')
        check(activated(f,racing.owner) is True,'Concurrent save lost activation')
        f.rejected(legacy_write,'Writer remained enabled after race','service_role')
    erased=new_owner(f,20);erased.save(subject='fictitious-erasure')
    f.sql('delete from public.users where id='+quote(erased.owner)+';','service_role')
    for table in ['public.google_tokens','google_workspace.owner_activations','google_workspace.bindings','google_workspace.grants']:
        check(f.sql('select count(*)=0 from '+table+' where user_id='+quote(erased.owner)+';')=='t','Owner erasure left private credential/activation data')
    print('PASS sticky activation: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-activation-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={k:v for k,v in f.env.items() if k.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            # The base fixture predates account erasure. Match the real schema
            # google_tokens/companies ownership FKs for this dedicated test.
            f.sql('alter table public.google_tokens drop constraint google_tokens_user_id_fkey;alter table public.google_tokens add foreign key(user_id) references public.users(id) on delete cascade;alter table public.companies drop constraint companies_user_id_fkey;alter table public.companies add foreign key(user_id) references public.users(id) on delete cascade;')
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';grant trigger on public.google_tokens to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on tables to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql','20261013070000_google_legacy_assignment.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except (AssertionError,s.SqlFailure) as error:
        print(str(error),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""One-target legacy Google assignment on disposable local PostgreSQL, fake data."""
import argparse
import concurrent.futures
import importlib.util
import pathlib
import re
import tempfile
import threading
import traceback

REPO=pathlib.Path(__file__).resolve().parents[2]
NAME='20261013070000_google_legacy_assignment.sql'
MIGRATOR='google_legacy_migrator'
spec=importlib.util.spec_from_file_location('binding_fixture',pathlib.Path(__file__).with_name('run-google-bindings.py'))
b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
s=b.base;check,quote=s.check,s.quote
FUNCTIONS=['public.zelo_google_legacy_status(uuid,text,uuid)','public.zelo_google_legacy_snapshot(uuid,text,uuid)','google_workspace.legacy_fingerprint(public.google_tokens)','public.zelo_google_legacy_assign(uuid,text,uuid,text,text,text,bigint,bigint,text,text,timestamptz,text,text)']

def command(name,owner=s.OWNER,mode='business',company=s.COMPANY_A):
    return b.sql_call('legacy_'+name,[owner,mode,company])

def read(f,name,**kwargs):return f.read(command(name,**kwargs),'service_role')

def assign_sql(store,source,subject='fictitious-legacy-account',binding_version=0,grant_version=0,client=b.CLIENT,access=b.CIPHER,refresh=b.CIPHER,expiry=b.EXPIRY,calendar='fictitious-legacy-calendar',name='Fixture legacy'):
    return b.sql_call('legacy_assign',store.scope+[source,subject,client,binding_version,grant_version,access,refresh,expiry,calendar,name])

def claims(f):return f.sql("select coalesce(jsonb_agg(to_jsonb(t) order by user_id),'[]'::jsonb) from google_workspace.legacy_assignments t;")

def race_states(f,commands):
    barrier=threading.Barrier(len(commands))
    def worker(command):
        barrier.wait(timeout=10)
        try:return True,f.sql(command,'service_role'),None
        except s.SqlFailure as error:
            match=re.search(r'SQLSTATE ([A-Z0-9]{5})',str(error))
            return False,None,match.group(1) if match else 'UNKNOWN'
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(commands)) as pool:return list(pool.map(worker,commands))

def verify(f,baseline):
    if baseline:
        check(read(f,'status')['exists'], 'RED: explicit unassigned legacy status is missing');return
    before=s.legacy_snapshot(f),b.snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((s.legacy_snapshot(f),b.snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==before,'Migration altered existing bytes/data/privileges')
    for function in FUNCTIONS:
        check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(function)+'::regprocedure;')=='t','Unsafe legacy function rights/path')
        for role in ['anon','authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(function)+",'EXECUTE');")=='f','Browser inherited legacy function access')
    for role in ['anon','authenticated']:
        f.rejected(command('snapshot'),'Browser read legacy ciphertext',role)
        f.rejected('select * from google_workspace.legacy_assignments;','Browser read legacy claims',role)
    check(f.sql("select relrowsecurity and not exists(select 1 from pg_policy where polrelid=c.oid) from pg_class c where c.oid='google_workspace.legacy_assignments'::regclass;")=='t','Claims missing private RLS')
    for permission in ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
        check(f.sql("select has_table_privilege('service_role','google_workspace.legacy_assignments',"+quote(permission)+');')=='f','Backend inherited unnecessary claim privilege')
    check(read(f,'status')=={'exists':True,'assigned':False,'assignedHere':False},'Legacy was assigned implicitly')
    old=read(f,'snapshot')
    check(set(old)=={'user_id','source_fingerprint','access_ciphertext','refresh_ciphertext','expires_at','binding'},'Snapshot exposed unexpected fields')
    check(old['user_id']==s.OWNER and old['binding'] is None and len(old['source_fingerprint'])==64,'Legacy snapshot selected a default binding or foreign owner')
    check(read(f,'snapshot',mode='personal',company=None)['source_fingerprint']==old['source_fingerprint'],'Fingerprint guessed legacy space')
    tz_fingerprint=f.sql("set timezone='America/Sao_Paulo';select google_workspace.legacy_fingerprint(t) from public.google_tokens t where user_id="+quote(s.OWNER)+';','service_role')
    check(tz_fingerprint==old['source_fingerprint'],'Fingerprint depended on session timezone')
    for kwargs in [dict(owner=None),dict(mode='personal'),dict(company=None),dict(company=s.ARCHIVED),dict(company=s.FOREIGN_COMPANY),dict(owner=s.OTHER)]:
        f.rejected(command('snapshot',**kwargs),'Invalid legacy target accepted','service_role')
    a=b.Store(f);a.save(subject='fictitious-new-connection')
    f.rejected(command('snapshot'),'Snapshot accepted an already connected target','service_role')
    a.call('binding_unlink',a.binding()['version'])
    tombstone=read(f,'snapshot')
    check(tombstone['binding']['id']==a.binding()['id'] and tombstone['binding']['version']==str(a.binding()['version']),'Snapshot lost tombstone identity/revision')
    check(s.legacy_snapshot(f)==before[0],'Read-only preparation changed legacy bytes')
    unchanged=claims(f),b.snapshot(f),s.legacy_snapshot(f)
    for patch in [dict(source=None),dict(source='0'*64),dict(subject=None),dict(subject='bad subject'),dict(client=None),dict(binding_version=0),dict(grant_version=1),dict(access='plaintext'),dict(refresh=None),dict(expiry='infinity'),dict(calendar=''),dict(calendar='bad\ncalendar'),dict(name='bad\nname')]:
        valid=dict(source=tombstone['source_fingerprint'],binding_version=int(tombstone['binding']['version']));valid.update(patch)
        f.rejected(assign_sql(a,**valid),'Malformed/stale legacy assignment accepted','service_role')
    check((claims(f),b.snapshot(f),s.legacy_snapshot(f))==unchanged,'Rejected assignment partially changed data')
    f.sql('update public.google_tokens set access_token=access_token||\':fixture-change\' where user_id='+quote(s.OWNER)+';')
    changed=claims(f),b.snapshot(f),s.legacy_snapshot(f)
    f.rejected(assign_sql(a,tombstone['source_fingerprint'],binding_version=int(tombstone['binding']['version'])),'Changed legacy bytes reused original snapshot','service_role')
    check((claims(f),b.snapshot(f),s.legacy_snapshot(f))==changed,'Source conflict changed assigned data')
    f.sql('update public.google_tokens set access_token='+quote(old['access_ciphertext'])+' where user_id='+quote(s.OWNER)+';')
    assigned=f.read(assign_sql(a,tombstone['source_fingerprint'],binding_version=int(tombstone['binding']['version'])),'service_role')
    check(assigned['id']==tombstone['binding']['id'] and assigned['calendar_id']=='fictitious-legacy-calendar','Explicit assignment lost target identity/calendar')
    check(read(f,'status')=={'exists':True,'assigned':True,'assignedHere':True},'Chosen target did not record assignment')
    check(read(f,'status',company=s.COMPANY_B)=={'exists':True,'assigned':True,'assignedHere':False},'Claim was copied to another space')
    check(b.Store(f,company=s.COMPANY_B).binding() is None,'Assignment created a second workspace binding')
    check(s.legacy_snapshot(f)==before[0],'Assignment changed original legacy bytes')
    committed=claims(f),b.snapshot(f),s.legacy_snapshot(f)
    f.rejected(assign_sql(b.Store(f,company=s.COMPANY_B),old['source_fingerprint']),'Legacy was assigned twice to different spaces','service_role')
    f.rejected(command('snapshot'),'Assigned legacy exposed its private snapshot again','service_role')
    check((claims(f),b.snapshot(f),s.legacy_snapshot(f))==committed,'Repeated assignment changed committed data')
    a.call('binding_unlink',a.binding()['version'])
    check(read(f,'status')['assignedHere'] and read(f,'status')['assigned'],'Unlink released the single-target legacy claim')
    f.rejected(assign_sql(b.Store(f,company=s.COMPANY_B),old['source_fingerprint']),'Unlink made legacy reusable in another space','service_role')
    extra='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6'
    f.sql('insert into public.companies(id,user_id,name) values('+quote(extra)+','+quote(s.OTHER)+",'Same fictitious company');")
    foreign=b.Store(f,owner=s.OTHER,company=s.FOREIGN_COMPANY)
    foreign.save(subject='fictitious-legacy-account',access='enc:'+'QkJC'*12,refresh='enc:'+'Q0ND'*12)
    grant_before=foreign.grant('fictitious-legacy-account')
    personal=b.Store(f,owner=s.OTHER,company=None);company=b.Store(f,owner=s.OTHER,company=extra)
    source=read(f,'snapshot',owner=s.OTHER,mode='personal',company=None)['source_fingerprint']
    f.rejected(assign_sql(personal,old['source_fingerprint'],grant_version=1),'Foreign owner legacy fingerprint assigned','service_role')
    race=race_states(f,[assign_sql(personal,source,grant_version=1),assign_sql(company,source,grant_version=1)])
    check(sum(ok for ok,_,_ in race)==1,'Concurrent cross-space assignment had more/less than one winner')
    check(all(ok or code=='P0001' for ok,_,code in race),'Assignment race deadlocked, timed out or had an unexpected failure')
    check(sum(store.binding() is not None for store in [personal,company])==1,'Race created implicit bindings in both spaces')
    check(foreign.grant('fictitious-legacy-account')==grant_before,'Legacy replaced an already verified grant with older token bytes')
    check(f.sql('select count(*) from google_workspace.legacy_assignments where user_id='+quote(s.OTHER)+';')=='1','Race duplicated an owner claim')
    third='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
    f.sql('insert into public.users(id,name) values('+quote(third)+",'Fictitious FK owner');")
    own=b.Store(f,owner=third,company=None);own.save(subject='fictitious-fk-subject');own_binding=own.binding()
    for mode,comp,binding_id,grant_id in [('personal',None,a.binding()['id'],own_binding['grant_id']),('personal',None,own_binding['id'],assigned['grant_id']),('business',s.COMPANY_A,own_binding['id'],own_binding['grant_id'])]:
        invalid='insert into google_workspace.legacy_assignments(user_id,mode,company_id,binding_id,grant_id,source_fingerprint) values('+','.join(quote(value) for value in [third,mode,comp,binding_id,grant_id,'0'*64])+');'
        f.rejected(invalid,'Claim FK accepted a foreign binding/grant/company','service_role')
    preserved=claims(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((claims(f),b.snapshot(f),s.legacy_snapshot(f),s.role_snapshot(f),s.schema_snapshot(f))==preserved,'Rollback removed history/credentials or changed shared rights')
    for function in FUNCTIONS:
        check(f.sql('select has_function_privilege(\'service_role\','+quote(function)+",'EXECUTE');")=='f','Rollback retained legacy execution')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');")=='f','Temporary CREATE survived')
    print('PASS '+str(s.ASSERTIONS)+' legacy snapshot assertions',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-legacy-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' in schema google_workspace grant all on tables to anon,authenticated,service_role;alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql','20261013060000_google_active_runtime.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';')
            verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except (AssertionError,s.SqlFailure) as error:print(str(error),flush=True);raise SystemExit(1) from None
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__);location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        print('Fixture failed: '+type(error).__name__+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True);raise SystemExit(1) from None

#!/usr/bin/env python3
"""Expected UI revision at OAuth issue; disposable PostgreSQL/fictitious data."""
import argparse
import importlib.util
import pathlib
import tempfile

spec=importlib.util.spec_from_file_location('callback_fixture',pathlib.Path(__file__).with_name('run-google-callback-version.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
b,s=c.b,c.s
REPO,quote,check=c.REPO,s.quote,s.check
NAME='20261013140000_google_expected_authorization.sql'
MIGRATOR=c.MIGRATOR
SIGNATURE='public.zelo_google_state_issue_expected(uuid,text,uuid,text,text,text,text,text,bigint)'

def issue(item,version,owner=s.OWNER,mode='business',company=s.COMPANY_A):
    values=[owner,mode,company,item['state'],item['session'],item['client'],item['nonce'],'pt-BR',version]
    return 'select public.zelo_google_state_issue_expected('+','.join(quote(v) for v in values)+');'

def verify(f,baseline):
    item=s.state('fictitious-expected-consent')
    if baseline:
        f.sql(issue(item,0),'service_role');check(False,'RED missing expected issue unexpectedly exists');return
    before=c.rows(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(),MIGRATOR)
    check((c.rows(f),b.snapshot(f),s.legacy_snapshot(f))==before,'Expected issue migration changed states/credentials')
    check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(SIGNATURE)+'::regprocedure;')=='t','Expected issue elevated rights/search path')
    for role in ['anon','authenticated']:
        f.rejected(issue(item,0),'Browser issued expected consent',role)
    for version in [None,-1,1,'9223372036854775807']:
        f.rejected(issue(item,version),'Malformed/stale UI revision issued consent','service_role')
    check(c.rows(f)==before[0],'Rejected expectation stored a usable OAuth state')
    f.sql(issue(item,0),'service_role');check(f.consume(item)['binding_version']=='0','Original absent binding revision was lost')
    binding=b.Store(f).save(subject='fictitious-expected-account')
    late=s.state('fictitious-stale-ui')
    f.rejected(issue(late,0),'Old settings snapshot acquired new binding revision','service_role')
    f.sql(issue(late,binding['version']),'service_role')
    check(f.consume(late)['binding_version']==str(binding['version']),'Expected issue captured a different revision')
    tombstone=b.Store(f).call('binding_unlink',binding['version'])
    reconnect=s.state('fictitious-tombstone-reconnect')
    f.rejected(issue(reconnect,binding['version']),'Pre-unlink view started a reconnect','service_role')
    f.sql(issue(reconnect,tombstone['version']),'service_role')
    check(f.consume(reconnect)['binding_version']==str(tombstone['version']),'Confirmed tombstone could not start reconnect')
    for index in range(6):
        owner='90000000-0000-4000-8000-'+str(index+50).zfill(12)
        f.sql('insert into public.users(id,name) values('+quote(owner)+",'Fictitious OAuth race');")
        store=b.Store(f,owner=owner,company=None);racing=s.state('fictitious-ui-race-'+str(index))
        outcomes=c.race_with_errors(f,[issue(racing,0,owner=owner,mode='personal',company=None),store.save_sql(subject='fictitious-racing-account')])
        check(outcomes[1][0] and (outcomes[0][0] or outcomes[0][2]=='P0001'),'Expected issue/save race deadlocked or leaked timeout')
        check(f.consume(racing,owner=owner) is None,'Stale state survived the binding change')
    history=c.rows(f),b.snapshot(f),s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(),MIGRATOR)
    check((c.rows(f),b.snapshot(f),s.legacy_snapshot(f))==history,'Expected issue rollback changed history/credentials')
    f.rejected(issue(s.state('fictitious-rollback'),1),'Rollback left expected issue callable','service_role')
    print('PASS expected authorization: '+str(s.ASSERTIONS)+' assertions; fictitious records only',flush=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--bin-dir',default='/private/tmp/zelo-pg-runtime/bin');parser.add_argument('--baseline',action='store_true');args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-expected-pg-',dir='/private/tmp') as directory:
        f=s.Fixture(pathlib.Path(args.bin_dir),pathlib.Path(directory));f.env={k:v for k,v in f.env.items() if k.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(),MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';');verify(f,args.baseline)
        finally:f.stop()

if __name__=='__main__':
    try:main()
    except (AssertionError,s.SqlFailure) as error:
        print(str(error),flush=True);raise SystemExit(1) from None

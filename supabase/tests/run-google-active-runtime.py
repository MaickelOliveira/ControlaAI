#!/usr/bin/env python3
"""Active Google runtime isolation on disposable Unix-socket PostgreSQL, fake data."""
import argparse
import importlib.util
import pathlib
import tempfile
import traceback

REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = '20261013060000_google_active_runtime.sql'
FUNCTION = 'public.zelo_google_runtime_get(uuid,text,uuid,text)'
MIGRATOR = 'google_runtime_migrator'
spec = importlib.util.spec_from_file_location('binding_fixture', pathlib.Path(__file__).with_name('run-google-bindings.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
s = b.base
check, quote = s.check, s.quote

def command(owner=s.OWNER, mode='business', company=s.COMPANY_A, client=b.CLIENT):
    return b.sql_call('runtime_get', [owner, mode, company, client])

def read(f, **kwargs):
    return f.read(command(**kwargs), 'service_role')

def verify(f, baseline):
    if baseline:
        check(read(f) is None, 'RED: missing scoped runtime credential lookup')
        return
    before = b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(), MIGRATOR)
    check((b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)) == before, 'Migration changed data, role or schema permissions')
    check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(FUNCTION)+'::regprocedure;') == 't', 'Runtime acquired elevated rights/path')
    for role in ['anon','authenticated']:
        check(f.sql('select has_function_privilege('+quote(role)+','+quote(FUNCTION)+",'EXECUTE');") == 'f', 'Browser inherited private runtime access')
        f.rejected(command(), 'Browser invoked private runtime', role)
    check(read(f) is None, 'Runtime inferred an unassigned legacy connection')
    a, other = b.Store(f), b.Store(f, company=s.COMPANY_B)
    a.save(subject='fictitious-a');other.save(subject='fictitious-b')
    result = read(f)
    check(result['binding']['company_id'] == s.COMPANY_A and result['grant']['id'] == a.binding()['grant_id'], 'Runtime crossed binding/company')
    check(result['grant']['id'] != read(f, company=s.COMPANY_B)['grant']['id'], 'Same-name companies shared another identity implicitly')
    check(read(f, mode='personal', company=None) is None, 'Runtime fell back to a business grant in Personal')
    check(read(f, client=s.digest('other-client')) is None, 'Runtime fell back to another OAuth client')
    check(set(result) == {'binding','grant'} and set(result['binding']) == b.META, 'Runtime metadata fields changed')
    check(set(result['grant']) == {'id','user_id','client_fingerprint','access_ciphertext','refresh_ciphertext','expires_at','version'}, 'Runtime exposed identity/email or unexpected fields')
    check(result['binding']['version'] == '1' and result['grant']['version'] == '1', 'Runtime returned imprecise numeric revisions')
    for kwargs in [dict(owner=None),dict(mode='personal'),dict(company=None),dict(company=s.ARCHIVED),dict(company=s.FOREIGN_COMPANY),dict(owner=s.OTHER),dict(client=None),dict(client='bad')]:
        f.rejected(command(**kwargs), 'Malformed or inaccessible runtime accepted', 'service_role')
    other.save(subject='fictitious-a', grant_version=1, binding_version=other.binding()['version'])
    a.call('binding_select_calendar', a.binding()['version'], 'fictitious-calendar-a', 'Fixture A')
    other.call('binding_select_calendar', other.binding()['version'], 'fictitious-calendar-b', 'Fixture B')
    initial = read(f)
    check(initial['grant']['id'] == read(f,company=s.COMPANY_B)['grant']['id'], 'Explicit same-identity sharing lost its grant')
    check(initial['binding']['calendar_id'] != read(f,company=s.COMPANY_B)['binding']['calendar_id'], 'Explicit sharing collapsed calendar choices')
    a_meta, other_meta = a.binding(), other.binding()
    grant = a.grant('fictitious-a')
    check(other.call('grant_refresh',grant['id'],b.CLIENT,grant['version'],b.CIPHER,b.CIPHER,b.EXPIRY) is True, 'Fixture shared refresh failed')
    check(a.binding() == a_meta and other.binding() == other_meta, 'Grant refresh replaced calendar/binding metadata')
    check(int(read(f)['grant']['version']) == grant['version']+1, 'Runtime missed the committed shared winner')
    huge = '9223372036854775806'
    f.sql('update google_workspace.grants set version='+huge+' where id='+quote(grant['id'])+';')
    f.sql('update google_workspace.bindings set version='+huge+' where id='+quote(a_meta['id'])+';')
    precise = read(f)
    check(precise['binding']['version'] == huge and precise['grant']['version'] == huge, 'Runtime rounded a bigint identity/revision')
    race = s.concurrent_processes(f,[command()]*6+[a.command('binding_unlink',huge)])
    check(all(ok for ok,_ in race), 'Runtime/unlink cross-process race deadlocked or failed')
    check(read(f) is None and read(f, company=s.COMPANY_B) is not None, 'Unlink lost another workspace or left runtime usable')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_B)+';')
    f.rejected(command(company=s.COMPANY_B), 'Archived company kept runtime access', 'service_role')
    before = b.snapshot(f), s.legacy_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(), MIGRATOR)
    check((b.snapshot(f), s.legacy_snapshot(f)) == before, 'Rollback altered history/credentials')
    check(f.sql('select has_function_privilege(\'service_role\','+quote(FUNCTION)+",'EXECUTE');") == 'f', 'Rollback retained runtime execution')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');") == 'f', 'Temporary CREATE survived')
    print('PASS '+str(s.ASSERTIONS)+' active-runtime assertions', flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir', default='/private/tmp/zelo-pg-runtime/bin')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-runtime-pg-', dir='/private/tmp') as directory:
        f = s.Fixture(pathlib.Path(args.bin_dir), pathlib.Path(directory))
        f.env = {key:value for key,value in f.env.items() if key.startswith('PG')};f.env['PATH']='/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql','20261013050000_google_grant_versions.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(), MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';')
            verify(f,args.baseline)
        finally:f.stop()

if __name__ == '__main__':
    try:main()
    except (AssertionError,s.SqlFailure) as error:
        print(str(error),flush=True);raise SystemExit(1) from None
    except Exception as error:
        frames=traceback.extract_tb(error.__traceback__)
        location=next((x for x in reversed(frames) if pathlib.Path(x.filename).name==pathlib.Path(__file__).name),None)
        print('Fixture failed: '+type(error).__name__+(' at '+location.name+':'+str(location.lineno) if location else ''),flush=True)
        raise SystemExit(1) from None

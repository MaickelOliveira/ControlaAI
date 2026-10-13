#!/usr/bin/env python3
"""Pre-exchange revision snapshots on disposable local PostgreSQL, fake data only."""
import argparse
import importlib.util
import pathlib
import tempfile
import traceback

REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = '20261013050000_google_grant_versions.sql'
FUNCTION = 'public.zelo_google_grant_versions(uuid,text,uuid,text)'
MIGRATOR = 'google_snapshot_migrator'
spec = importlib.util.spec_from_file_location('binding_fixture', pathlib.Path(__file__).with_name('run-google-bindings.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
s = b.base
check, quote = s.check, s.quote


def command(owner=s.OWNER, mode='business', company=s.COMPANY_A, client=b.CLIENT):
    return b.sql_call('grant_versions', [owner, mode, company, client])


def revisions(f, **kwargs):
    return f.read(command(**kwargs), 'service_role')


def verify(f, baseline):
    if baseline:
        check(revisions(f) == [], 'RED: expected a private snapshot of an empty identity set')
        return
    before = b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)
    f.sql((REPO/'supabase/migrations'/NAME).read_text(), MIGRATOR)
    check((b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)) == before, 'Migration changed history, credentials, roles or shared schema access')
    check(f.sql('select not prosecdef and proconfig=array[\'search_path=pg_catalog\'] from pg_proc where oid='+quote(FUNCTION)+'::regprocedure;') == 't', 'Snapshot function acquired elevated rights/path')
    for role in ['anon', 'authenticated']:
        check(f.sql('select has_function_privilege('+quote(role)+','+quote(FUNCTION)+",'EXECUTE');") == 'f', 'Browser inherited snapshot execution')
        f.rejected(command(), 'Browser invoked private snapshot', role)
    check(revisions(f) == [], 'Snapshot inferred a legacy Google identity')
    a, other, personal = b.Store(f), b.Store(f, company=s.COMPANY_B), b.Store(f, company=None)
    a.save(subject='fictitious-first')
    other.save(subject='fictitious-second')
    personal.save(subject='fictitious-client-two', client=s.digest('client-two'))
    b.Store(f, owner=s.OTHER, company=s.FOREIGN_COMPANY).save(subject='fictitious-foreign')
    expected = [{'subject':'fictitious-first','version':'1'}, {'subject':'fictitious-second','version':'1'}]
    check(revisions(f) == expected, 'Snapshot crossed owner/client or lost a same-owner identity before subject verification')
    check(revisions(f, company=None, mode='personal') == expected, 'Snapshot inferred a different identity from the current workspace')
    check(revisions(f, client=s.digest('client-two')) == [{'subject':'fictitious-client-two','version':'1'}], 'Snapshot crossed OAuth clients')
    check(revisions(f, owner=s.OTHER, company=s.FOREIGN_COMPANY) == [{'subject':'fictitious-foreign','version':'1'}], 'Snapshot crossed owners')
    check(all(set(row) == {'subject','version'} and isinstance(row['version'], str) for row in revisions(f)), 'Snapshot exposed credentials, email or unsafe numeric revisions')
    before = b.snapshot(f)
    for kwargs in [dict(owner=None),dict(mode='personal'),dict(company=None),dict(company=s.ARCHIVED),dict(company=s.FOREIGN_COMPANY),dict(owner=s.OTHER),dict(client=None),dict(client='wrong')]:
        f.rejected(command(**kwargs), 'Malformed/inaccessible snapshot accepted', 'service_role')
    check(b.snapshot(f) == before, 'Rejected snapshot changed private data')
    print('PASS snapshot ACL/isolation: invoker only, no browser/credential access, exact owner/client, active workspace', flush=True)

    captured = revisions(f)
    grant = a.grant('fictitious-first')
    check(a.call('grant_refresh', grant['id'], b.CLIENT, grant['version'], b.CIPHER, b.CIPHER, b.EXPIRY) is True, 'Fixture renewal failed')
    before = b.snapshot(f)
    captured_version = int(next(row['version'] for row in captured if row['subject'] == 'fictitious-first'))
    f.rejected(a.save_sql(subject='fictitious-first', grant_version=captured_version, binding_version=a.binding()['version']), 'Delayed callback replaced a refresh completed after snapshot', 'service_role')
    check(b.snapshot(f) == before, 'Rejected delayed callback altered history/credentials')
    check(revisions(f)[0]['version'] == '2', 'Snapshot failed to observe the committed new revision')
    new_capture = revisions(f)
    personal.save(subject='fictitious-created-late', binding_version=personal.binding()['version'])
    check(not any(row['subject'] == 'fictitious-created-late' for row in new_capture), 'Fixture accidentally captured a future identity')
    before = b.snapshot(f)
    f.rejected(other.save_sql(subject='fictitious-created-late', grant_version=0, binding_version=other.binding()['version']), 'Callback created before grant insertion overwrote the newer grant', 'service_role')
    check(b.snapshot(f) == before, 'Rejected late grant creation changed private data')
    grant = a.grant('fictitious-first')
    results = s.concurrent_processes(f, [command(), a.command('grant_refresh', grant['id'], b.CLIENT, grant['version'], b.CIPHER, b.CIPHER, b.EXPIRY)])
    check(all(ok for ok,_ in results), 'Snapshot/refresh race deadlocked or failed')
    print('PASS revision races: delayed callback and future identity refused; snapshot/refresh lock order succeeds', flush=True)

    huge = '9223372036854775806'
    f.sql('update google_workspace.grants set version='+huge+' where id='+quote(grant['id'])+';')
    check(next(row['version'] for row in revisions(f) if row['subject'] == 'fictitious-first') == huge, 'Snapshot rounded a bigint revision')
    a.call('binding_unlink', a.binding()['version'])
    check(any(row['subject'] == 'fictitious-first' for row in revisions(f)), 'Historical identity disappeared when its binding was removed')
    f.sql('update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';')
    f.rejected(command(), 'Archived company read a new snapshot', 'service_role')
    check(revisions(f, company=s.COMPANY_B) is not None, 'Archival changed another workspace')
    before = b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)
    f.sql((REPO/'supabase/rollback'/NAME).read_text(), MIGRATOR)
    check((b.snapshot(f), s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)) == before, 'Rollback removed/changed private or legacy data')
    check(f.sql('select has_function_privilege(\'service_role\','+quote(FUNCTION)+",'EXECUTE');") == 'f', 'Rollback left accessor callable')
    f.rejected(command(company=s.COMPANY_B), 'Rollback retained execution', 'service_role')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');") == 'f', 'Temporary CREATE survived fixture verification')
    print('PASS bigint/history/rollback: exact revisions, history retained, access disabled', flush=True)
    print('PASS '+str(s.ASSERTIONS)+' grant-version assertions', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir', default='/private/tmp/zelo-pg-runtime/bin')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-grants-pg-', dir='/private/tmp') as directory:
        f = s.Fixture(pathlib.Path(args.bin_dir), pathlib.Path(directory))
        f.env = {key:value for key,value in f.env.items() if key.startswith('PG')}
        f.env['PATH'] = '/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' grant all on functions to anon,authenticated,service_role;')
            for name in ['20261013010000_google_oauth_state.sql','20261013030000_google_bindings.sql','20261013040000_google_callback_version.sql']:
                f.sql((REPO/'supabase/migrations'/name).read_text(), MIGRATOR)
            f.sql('revoke create on database postgres from '+MIGRATOR+';')
            verify(f, args.baseline)
        finally:
            f.stop()


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, s.SqlFailure) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
    except Exception as error:
        frames = traceback.extract_tb(error.__traceback__)
        location = next((x for x in reversed(frames) if pathlib.Path(x.filename).name == pathlib.Path(__file__).name), None)
        print('Fixture failed: '+type(error).__name__+(' at '+location.name+':'+str(location.lineno) if location else ''), flush=True)
        raise SystemExit(1) from None

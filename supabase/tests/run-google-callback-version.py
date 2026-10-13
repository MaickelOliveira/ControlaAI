#!/usr/bin/env python3
"""Dormant OAuth revision checks; disposable Unix-socket PostgreSQL and fictitious data."""
import argparse
import concurrent.futures
import re
import threading
import importlib.util
import json
import pathlib
import tempfile
import traceback

REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = '20261013040000_google_callback_version.sql'
spec = importlib.util.spec_from_file_location('binding_fixture', pathlib.Path(__file__).with_name('run-google-bindings.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
s = b.base
check, quote = s.check, s.quote
MIGRATOR = 'google_callback_migrator'
KEYS = s.RETURN_KEYS | {'binding_version'}


def rows(f):
    return f.sql("select coalesce(jsonb_agg(to_jsonb(t) order by state_hash),'[]'::jsonb) from google_workspace.oauth_states t;")


def race_with_errors(f, commands):
    barrier = threading.Barrier(len(commands))
    def worker(command):
        barrier.wait(timeout=10)
        try:
            return True, f.sql(command, 'service_role'), None
        except s.SqlFailure as error:
            match = re.search(r'SQLSTATE ([A-Z0-9]{5})', str(error))
            return False, None, match.group(1) if match else 'UNKNOWN'
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(commands)) as pool:
        return list(pool.map(worker, commands))


def verify(f, baseline):
    a, other = b.Store(f), b.Store(f, company=s.COMPANY_B)
    if baseline:
        item = s.state('baseline-late-callback')
        f.issue(item)
        a.save()
        check(f.consume(item) is None, 'RED: late callback remained usable after the connection changed')
        return
    migration = REPO / 'supabase/migrations' / NAME
    rollback = REPO / 'supabase/rollback' / NAME
    check(migration.is_file() and rollback.is_file(), 'Callback revision migration/rollback missing')
    old = s.state('existing-live')
    f.issue(old)
    before = rows(f)
    f.rejected(migration.read_text(), 'Migration accepted a live state without an original revision', MIGRATOR)
    check(rows(f) == before, 'Rejected migration changed a live authorization')
    check(f.consume(old) is not None, 'Rejected migration destroyed the original usable authorization')
    expired = s.state('existing-expired')
    f.issue(expired)
    f.expire(expired)
    old_bytes = rows(f)
    legacy, roles, schema = s.legacy_snapshot(f), s.role_snapshot(f), s.schema_snapshot(f)
    f.sql(migration.read_text(), MIGRATOR)
    check(f.sql("select coalesce(jsonb_agg(to_jsonb(t)-'binding_version' order by state_hash),'[]'::jsonb) from google_workspace.oauth_states t;") == old_bytes, 'Migration altered old expired state bytes')
    check(s.legacy_snapshot(f) == legacy and s.role_snapshot(f) == roles and s.schema_snapshot(f) == schema, 'Migration altered legacy, roles or schema access')
    check(f.consume(expired) is None, 'Expired authorization became usable')
    for function in [s.ISSUE, s.CONSUME]:
        check(f.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid="+quote(function)+"::regprocedure;") == 't', 'Unsafe OAuth function privileges/path')
        for role in ['anon', 'authenticated']:
            check(f.sql('select has_function_privilege('+quote(role)+','+quote(function)+",'EXECUTE');") == 'f', 'Browser inherited OAuth execution')
    for role in ['anon', 'authenticated']:
        f.rejected('select binding_version from google_workspace.oauth_states;', 'Browser read private revision', role)
        f.rejected(f.issue_sql(s.state('browser-'+role)), 'Browser issued OAuth state', role)
    check(f.sql("select relrowsecurity and not exists(select 1 from pg_policy where polrelid=c.oid) from pg_class c where c.oid='google_workspace.oauth_states'::regclass;") == 't', 'State RLS became public')
    for permission in ['UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']:
        check(f.sql("select has_table_privilege('service_role','google_workspace.oauth_states',"+quote(permission)+');') == 'f', 'Backend acquired unnecessary state privilege')
    print('PASS migration/ACL: live states guarded, expired bytes retained, no browser access or elevated role', flush=True)

    bound = s.state('session-owner-client')
    f.issue(bound)
    for kwargs in [dict(owner=s.OTHER), dict(session=s.digest('wrong-session')), dict(client=s.digest('wrong-client'))]:
        check(f.consume(bound, **kwargs) is None and f.count(bound) == 1, 'Mismatched owner/session/client consumed state')
    result = f.consume(bound)
    check(result['user_id'] == s.OWNER and result['company_id'] == s.COMPANY_A and result['nonce_hash'] == bound['nonce'], 'Authorized state crossed its captured owner/company/nonce')

    personal = s.state('personal-empty')
    f.issue(personal, mode='personal', company=None)
    result = f.consume(personal)
    check(set(result) == KEYS and result['binding_version'] == '0' and result['company_id'] is None, 'Personal snapshot was not exact/null')
    late = s.state('late-new-connection')
    f.issue(late)
    a.save()
    check(f.consume(late) is None and f.count(late) == 0, 'New binding failed to invalidate old callback')
    binding = a.binding()
    active = s.state('active-stable')
    f.issue(active)
    result = f.consume(active)
    check(set(result) == KEYS and result['binding_version'] == str(binding['version']), 'Current callback lost original revision')
    changed = s.state('calendar-change')
    f.issue(changed)
    a.call('binding_select_calendar', binding['version'], 'fixture-calendar', 'Fixture calendar')
    check(f.consume(changed) is None, 'Calendar change failed to invalidate old callback')
    binding = a.binding()
    changed = s.state('unlink-before-callback')
    f.issue(changed)
    a.call('binding_unlink', binding['version'])
    check(f.consume(changed) is None, 'Unlink failed to invalidate old callback')
    tombstone = a.binding()
    changed = s.state('tombstone-before-reconnect')
    f.issue(changed)
    a.save(grant_version=1, binding_version=tombstone['version'])
    check(f.consume(changed) is None, 'Reconnection reused a tombstone callback')
    print('PASS callback revisions: new connection, calendar change, unlink and reconnect invalidate stale state', flush=True)

    stable = s.state('other-workspace-change')
    f.issue(stable)
    other.save(subject='fictitious-other-subject')
    check(f.consume(stable)['binding_version'] == str(a.binding()['version']), 'Another workspace invalidated authorization')
    stable = s.state('grant-refresh')
    f.issue(stable)
    grant = a.grant()
    check(a.call('grant_refresh', grant['id'], b.CLIENT, grant['version'], b.CIPHER, b.CIPHER, b.EXPIRY) is True, 'Fixture refresh failed')
    check(f.consume(stable)['binding_version'] == str(a.binding()['version']), 'Grant-only refresh invalidated callback')
    for owner, mode, company in [(s.OTHER,'business',s.COMPANY_A),(s.OWNER,'business',s.FOREIGN_COMPANY),(s.OWNER,'business',s.ARCHIVED),(s.OWNER,'personal',s.COMPANY_A),(s.OWNER,'business',None)]:
        f.rejected(f.issue_sql(s.state('invalid-'+str(company)+str(owner)+mode), owner=owner, mode=mode, company=company), 'Invalid workspace accepted', 'service_role')
    once = s.state('single-consume')
    f.issue(once)
    results = s.concurrent_processes(f, [f.consume_sql(once)]*8)
    check(all(ok for ok,_ in results), 'Concurrent consume had a storage failure')
    check(sum(json.loads(value) is not None for _,value in results) == 1, 'More than one process consumed state')
    race = s.state('issue-unlink-race')
    version = a.binding()['version']
    results = s.concurrent_processes(f, [f.issue_sql(race), a.command('binding_unlink', version)])
    check(all(ok for ok,_ in results), 'Issue/unlink lock order deadlocked or rejected valid input')
    captured = int(f.sql('select binding_version from google_workspace.oauth_states where state_hash='+quote(race['state'])+';'))
    result = f.consume(race)
    check((captured == version and result is None) or (captured == version+1 and result['binding_version'] == str(version+1)), 'Race fabricated or bypassed the original revision')
    race = s.state('issue-archive-race')
    archive = 'begin;select 1 from public.users where id='+quote(s.OWNER)+' for update;update public.companies set archived_at=clock_timestamp() where id='+quote(s.COMPANY_A)+';commit;'
    results = race_with_errors(f, [f.issue_sql(race), archive])
    check(results[1][0], 'Fixture archive failed')
    check(results[0][0] or results[0][2] == 'P0001', 'Issue/archive race deadlocked, timed out or had an unexpected failure')
    check(f.consume(race) is None, 'Archive left a usable OAuth callback')
    print('PASS concurrency: eight consumers, issue/unlink and issue/archive races; other workspace/refresh preserved', flush=True)

    huge = '9223372036854775806'
    other_binding = other.binding()
    f.sql('update google_workspace.bindings set version='+huge+' where id='+quote(other_binding['id'])+';')
    item = s.state('exact-bigint')
    f.issue(item, company=s.COMPANY_B)
    check(f.consume(item)['binding_version'] == huge, 'Bigint snapshot lost precision')
    live = s.state('rollback-live')
    f.issue(live, company=s.COMPANY_B)
    before = rows(f), b.snapshot(f), s.legacy_snapshot(f)
    f.sql(rollback.read_text(), MIGRATOR)
    check((rows(f), b.snapshot(f), s.legacy_snapshot(f)) == before, 'Rollback deleted state, bindings, grants or legacy')
    for function in [s.ISSUE, s.CONSUME]:
        check(f.sql("select has_function_privilege('service_role',"+quote(function)+",'EXECUTE');") == 'f', 'Rollback left OAuth state callable')
    f.sql('revoke create on schema public,google_workspace from '+MIGRATOR+';revoke references on public.users,public.companies from '+MIGRATOR+';')
    check(f.sql('select has_schema_privilege('+quote(MIGRATOR)+",'public','CREATE') or has_schema_privilege("+quote(MIGRATOR)+",'google_workspace','CREATE');") == 'f', 'Temporary CREATE survived')
    check(s.role_snapshot(f) == roles, 'Role/member capabilities changed')
    print('PASS bigint/rollback: exact decimal revision, live state/history preserved and access disabled', flush=True)
    print('PASS '+str(s.ASSERTIONS)+' callback-revision assertions', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bin-dir', default='/private/tmp/zelo-pg-runtime/bin')
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='zelo-google-callback-pg-', dir='/private/tmp') as directory:
        f = s.Fixture(pathlib.Path(args.bin_dir), pathlib.Path(directory))
        f.env = {key:value for key,value in f.env.items() if key.startswith('PG')}
        f.env['PATH'] = '/usr/bin:/bin'
        try:
            f.start();s.bootstrap(f)
            f.sql('create role '+MIGRATOR+' nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;grant create on database postgres to '+MIGRATOR+';alter schema google_workspace owner to '+MIGRATOR+';grant usage,create on schema public,google_workspace to '+MIGRATOR+';grant references on public.users,public.companies to '+MIGRATOR+';alter default privileges for role '+MIGRATOR+' in schema google_workspace grant all on tables to service_role;')
            for name in ['20261013010000_google_oauth_state.sql', '20261013030000_google_bindings.sql']:
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

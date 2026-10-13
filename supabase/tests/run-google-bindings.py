#!/usr/bin/env python3
"""Private Google grant/binding checks on disposable PostgreSQL, fictitious data only."""
import argparse
import importlib.util
import json
import pathlib
import tempfile
import traceback

REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = "20261013030000_google_bindings.sql"
spec = importlib.util.spec_from_file_location("google_state_fixture", pathlib.Path(__file__).with_name("run-google-oauth-state.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
check, quote = base.check, base.quote
OWNER, OTHER, A, B = base.OWNER, base.OTHER, base.COMPANY_A, base.COMPANY_B
CLIENT = base.digest("fixture-client")
# Well-formed but wholly fictitious AES-GCM envelopes; never decrypt or use them.
CIPHER = "enc:" + "QUFB" * 12
EXPIRY = "2070-01-01T00:00:00Z"
META = {"id", "user_id", "mode", "company_id", "grant_id", "calendar_id", "calendar_name", "version", "unlinked_at"}
MIGRATOR = "google_binding_migrator"
FUNCTIONS = [
    "public.zelo_google_binding_get(uuid,text,uuid)",
    "public.zelo_google_grant_for_identity(uuid,text,uuid,text,text)",
    "public.zelo_google_binding_save(uuid,text,uuid,text,text,text,text,timestamptz,bigint,bigint)",
    "public.zelo_google_binding_select_calendar(uuid,text,uuid,bigint,text,text)",
    "public.zelo_google_binding_unlink(uuid,text,uuid,bigint)",
    "public.zelo_google_grant_refresh(uuid,text,uuid,uuid,text,bigint,text,text,timestamptz)",
    "google_workspace.lock_workspace(uuid,text,uuid,boolean)",
    "google_workspace.binding_metadata(google_workspace.bindings)",
    "google_workspace.validate_identity(text,text)",
    "google_workspace.validate_tokens(text,text,timestamptz)",
]


def sql_call(name, values):
    return "select coalesce(to_jsonb(public.zelo_google_" + name + "(" + ",".join(quote(v) for v in values) + ")), 'null'::jsonb)::text;"


class Store:
    def __init__(self, fixture, owner=OWNER, company=A):
        self.fixture, self.owner, self.company = fixture, owner, company

    @property
    def scope(self):
        return [self.owner, "personal" if self.company is None else "business", self.company]

    def command(self, name, *values):
        return sql_call(name, self.scope + list(values))

    def call(self, name, *values):
        return self.fixture.read(self.command(name, *values), "service_role")

    def save_sql(self, subject="fixture-subject-one", grant_version=0, binding_version=0, client=CLIENT, access=CIPHER, refresh=CIPHER, expiry=EXPIRY):
        return self.command("binding_save", subject, client, access, refresh, expiry, grant_version, binding_version)

    def save(self, **kwargs):
        return self.fixture.read(self.save_sql(**kwargs), "service_role")

    def binding(self):
        result = self.call("binding_get")
        if result is not None:
            check(set(result) == META, "Binding metadata exposed unexpected fields")
        return result

    def grant(self, subject="fixture-subject-one", client=CLIENT):
        return self.call("grant_for_identity", subject, client)


def snapshot(fixture):
    return fixture.sql("select jsonb_build_object('grants',(select jsonb_agg(to_jsonb(g) order by id) from google_workspace.grants g),'bindings',(select jsonb_agg(to_jsonb(b) order by id) from google_workspace.bindings b));")


def verify(fixture, migration, rollback):
    # A non-superuser owns only the new objects. Simulate permissive production
    # defaults, then prove the migration replaces them rather than inheriting ALL.
    fixture.sql("create role " + MIGRATOR + " nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;"
                "grant usage,create on schema public,google_workspace to " + MIGRATOR + ";"
                "grant references on public.users,public.companies to " + MIGRATOR + ";"
                "alter default privileges for role " + MIGRATOR + " in schema google_workspace grant all on tables to anon,authenticated,service_role;"
                "alter default privileges for role " + MIGRATOR + " grant all on functions to anon,authenticated,service_role;")
    legacy_before, roles_before = base.legacy_snapshot(fixture), base.role_snapshot(fixture)
    schema_before = base.schema_snapshot(fixture)
    fixture.sql(migration.read_text(), MIGRATOR)
    check(base.legacy_snapshot(fixture) == legacy_before, "Migration changed legacy bytes or permissions")
    check(base.role_snapshot(fixture) == roles_before, "Migration created/elevated roles or memberships")
    check(base.schema_snapshot(fixture) == schema_before, "Migration changed shared schema permissions")
    for table in ["grants", "bindings"]:
        relation = "google_workspace." + table
        check(fixture.sql("select relrowsecurity and not relforcerowsecurity from pg_class where oid=" + quote(relation) + "::regclass;") == "t", "Private table missing RLS")
        check(fixture.sql("select count(*)=0 from pg_policy where polrelid=" + quote(relation) + "::regclass;") == "t", "Private table has browser policies")
        for role in ["anon", "authenticated"]:
            check(fixture.sql("select has_table_privilege(" + quote(role) + "," + quote(relation) + ",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');") == "f", "Browser inherited private-table access")
            fixture.rejected("select * from " + relation + ";", "Browser read private storage", role)
        for permission in ["SELECT", "INSERT", "UPDATE"]:
            check(fixture.sql("select has_table_privilege('service_role'," + quote(relation) + "," + quote(permission) + ");") == "t", "Backend lost required access")
        for permission in ["DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]:
            check(fixture.sql("select has_table_privilege('service_role'," + quote(relation) + "," + quote(permission) + ");") == "f", "Backend inherited excessive access")
    for signature in FUNCTIONS:
        for role in ["anon", "authenticated"]:
            check(fixture.sql("select has_function_privilege(" + quote(role) + "," + quote(signature) + ",'EXECUTE');") == "f", "Browser inherited private-function execution")
        check(fixture.sql("select not prosecdef and proconfig=array['search_path=pg_catalog'] from pg_proc where oid=" + quote(signature) + "::regprocedure;") == "t", "Function has elevated rights or unsafe path")
        check(fixture.sql("select has_function_privilege('service_role'," + quote(signature) + ",'EXECUTE');") == "t", "Backend cannot use storage function")
    for role in ["anon", "authenticated"]:
        fixture.rejected(Store(fixture).command("binding_get"), "Browser invoked metadata RPC", role)
        fixture.rejected(Store(fixture).save_sql(), "Browser invoked token-writing RPC", role)
    print("PASS ACL/RLS: non-superuser migration, restrictive defaults, invoker-only RPCs and no browser access", flush=True)
    stores = [Store(fixture, company=None), Store(fixture), Store(fixture, company=B), Store(fixture, OTHER, base.FOREIGN_COMPANY)]
    for store in stores:
        check(store.binding() is None and store.grant() is None, "Legacy connection was assigned or copied implicitly")
    for index, store in enumerate(stores):
        store.save(subject="fixture-subject-" + str(index))
    bindings = [store.binding() for store in stores]
    check(len({b["id"] for b in bindings}) == 4 and len({b["grant_id"] for b in bindings}) == 4, "Owners/workspaces with equal names share implicit bindings")
    for store, binding in zip(stores, bindings):
        check([binding["user_id"], binding["mode"], binding["company_id"]] == store.scope, "Binding escaped its exact owner/mode/company")
    a, b = stores[1], stores[2]
    before = snapshot(fixture)
    for owner, mode, company in [(None, "personal", None), (OWNER, "personal", A), (OWNER, "business", None), (OWNER, "invalid", A), (OWNER, None, A), (OWNER, "business", base.FOREIGN_COMPANY), (OTHER, "business", A), (OWNER, "business", base.ARCHIVED)]:
        fixture.rejected(sql_call("binding_get", [owner, mode, company]), "Invalid workspace accepted", "service_role")
    check(snapshot(fixture) == before, "Invalid workspace altered data")
    fixture.sql("update public.companies set name='Same renamed company' where user_id=" + quote(OWNER) + ";update public.users set active_mode='personal' where id=" + quote(OWNER) + ";")
    check(a.binding() == bindings[1] and b.binding() == bindings[2], "Names/current mode changed stored workspace")
    check(base.legacy_snapshot(fixture) == legacy_before, "Explicit connections changed legacy ciphertext")
    print("PASS isolation: Personal, two equal-name companies, another owner; legacy remains byte-for-byte unassigned", flush=True)

    # Explicitly authorize A's same verified identity into B, with concurrency snapshots.
    b.save(subject="fixture-subject-1", grant_version=1, binding_version=1)
    shared = a.grant("fixture-subject-1")
    check(shared["id"] == a.binding()["grant_id"] == b.binding()["grant_id"] and shared["version"] == 2, "Explicit identity reuse duplicated or crossed grants")
    a.call("binding_select_calendar", 1, "fixture-calendar-a", "Agenda A")
    b.call("binding_select_calendar", 2, "fixture-calendar-b", "Agenda B")
    a_meta, b_meta = a.binding(), b.binding()
    a.call("grant_refresh", shared["id"], CLIENT, 2, CIPHER, CIPHER, EXPIRY)
    check(a.binding() == a_meta and b.binding() == b_meta, "Refresh overwrote a calendar selection or binding version")
    a.call("binding_unlink", a_meta["version"])
    after_unlink = snapshot(fixture)
    check(a.call("grant_refresh", shared["id"], CLIENT, 3, CIPHER, CIPHER, EXPIRY) is False, "Unlinked workspace refreshed a grant")
    check(snapshot(fixture) == after_unlink and b.binding() == b_meta, "Stale refresh resurrected a binding or changed another workspace")
    check(b.call("grant_refresh", shared["id"], CLIENT, 3, CIPHER, CIPHER, EXPIRY) is True, "Remaining explicit workspace lost its shared grant")
    check(a.binding()["unlinked_at"] is not None, "Other workspace's refresh resurrected removed binding")
    print("PASS shared identity: explicit bindings keep independent calendars; unlink is local; refresh cannot restore removed links", flush=True)

    # Wrong owner, grant/client, stale snapshots and malformed tokens must not
    # change either credential bytes or calendars, even on a partial failure.
    before = snapshot(fixture)
    check(b.grant("fixture-subject-1", base.digest("another-client")) is None, "Client fingerprint did not isolate identity")
    check(stores[3].grant("fixture-subject-1") is None, "Identity lookup crossed owners")
    for patch in [{"subject": None}, {"subject": ""}, {"subject": "bad subject"}, {"client": ""}, {"client": None},
                  {"access": "plaintext"}, {"access": "enc:invalid"}, {"refresh": None}, {"expiry": "infinity"},
                  {"expiry": "2000-01-01"}, {"grant_version": None}, {"binding_version": None}, {"grant_version": -1}]:
        valid = {"subject": "fixture-subject-1", "grant_version": 4, "binding_version": b_meta["version"]}
        if "subject" in patch or "client" in patch:
            valid["grant_version"] = 0  # Changed identity is absent, so CAS cannot mask invalid input.
        valid.update(patch)
        fixture.rejected(b.save_sql(**valid), "Invalid authorization result stored", "service_role")
    fixture.rejected(a.save_sql(subject="fixture-subject-1", grant_version=4, binding_version=2), "Delayed OAuth callback restored unlinked binding", "service_role")
    fixture.rejected(b.save_sql(subject="fixture-subject-1", grant_version=3, binding_version=b_meta["version"]), "Stale OAuth result replaced a newer refresh", "service_role")
    fixture.rejected(b.command("binding_select_calendar", 1, "stale-calendar", None), "Stale selection was accepted", "service_role")
    fixture.rejected(b.command("binding_unlink", 1), "Stale unlink was accepted", "service_role")
    for grant_id, client in [(bindings[3]["grant_id"], CLIENT), (shared["id"], base.digest("wrong-client"))]:
        check(b.call("grant_refresh", grant_id, client, 4, CIPHER, CIPHER, EXPIRY) is False, "Grant/client mismatch refreshed credentials")
    fixture.rejected("update google_workspace.bindings set grant_id=" + quote(bindings[3]["grant_id"]) + " where id=" + quote(b_meta["id"]) + ";", "Composite FK allowed a foreign owner's grant", "service_role")
    fixture.rejected("update google_workspace.bindings set company_id=" + quote(base.FOREIGN_COMPANY) + " where id=" + quote(b_meta["id"]) + ";", "Composite FK allowed a foreign company", "service_role")
    check(snapshot(fixture) == before, "Rejected mutation changed a token/calendar/binding")

    # A second account or OAuth client gets a new grant and a fresh calendar;
    # other spaces keep their original selection and historical grant.
    b_new = b.save(subject="fixture-subject-new", binding_version=b_meta["version"])
    check(b_new["grant_id"] != shared["id"] and b_new["calendar_id"] == "primary" and b_new["calendar_name"] is None, "New identity inherited another account's calendar")
    check(a.binding()["grant_id"] == shared["id"] and a.binding()["calendar_id"] == "fixture-calendar-a", "Reconnection redirected another workspace")
    check(a.grant("fixture-subject-1")["version"] == 4, "Historical grant disappeared or changed")
    b_client = b.save(subject="fixture-subject-new", client=base.digest("new-client"), binding_version=b_new["version"])
    check(b_client["grant_id"] != b_new["grant_id"], "Different OAuth clients shared a grant")
    print("PASS rejected writes: cross-owner FKs, malformed results, stale callbacks, new identities/clients and calendar reset", flush=True)

    # Reauthorize one space explicitly; changing its selected calendar does not
    # invalidate a concurrent token refresh or overwrite the selection.
    a_active = a.save(subject="fixture-subject-1", grant_version=4, binding_version=a.binding()["version"])
    check(a_active["id"] == a_meta["id"] and a_active["calendar_id"] == "fixture-calendar-a", "Same-identity reconnect lost stable ID/calendar")
    refresh_sql = a.command("grant_refresh", shared["id"], CLIENT, 5, CIPHER, CIPHER, EXPIRY)
    results = base.concurrent_processes(fixture, [refresh_sql] * 8)
    check(all(success for success, _ in results) and sum(value == "true" for _, value in results) == 1, "Concurrent refreshes lost CAS exclusivity")
    check(a.grant("fixture-subject-1")["version"] == 6, "Refresh race advanced version more than once")
    refresh_sql = a.command("grant_refresh", shared["id"], CLIENT, 6, CIPHER, CIPHER, EXPIRY)
    calendar_sql = a.command("binding_select_calendar", a_active["version"], "fixture-selected-concurrently", None)
    results = base.concurrent_processes(fixture, [refresh_sql, calendar_sql])
    check(all(success for success, _ in results) and results[0][1] == "true", "Refresh/calendar race failed")
    check(a.binding()["calendar_id"] == "fixture-selected-concurrently", "Concurrent refresh reverted calendar")
    before_race = a.binding()
    results = base.concurrent_processes(fixture, [a.command("grant_refresh", shared["id"], CLIENT, 7, CIPHER, CIPHER, EXPIRY), a.command("binding_unlink", before_race["version"])])
    check(all(success for success, _ in results) and a.binding()["unlinked_at"] is not None, "Refresh/unlink race restored binding")
    check(a.binding()["version"] == before_race["version"] + 1, "Refresh mutated binding version")
    # Two callbacks with the same captured revisions have exactly one winner.
    current_grant, current_binding = a.grant("fixture-subject-1"), a.binding()
    callback = a.save_sql(subject="fixture-subject-1", grant_version=current_grant["version"], binding_version=current_binding["version"])
    results = base.concurrent_processes(fixture, [callback] * 6)
    check(sum(success for success, _ in results) == 1, "Concurrent authorization callbacks both committed")
    print("PASS cross-process races: one refresh/callback winner; calendar selection and unlink survive renewal", flush=True)

    # Archival takes the existing owner->company locks. Once archived, every
    # storage operation rejects the company; Personal and other owners work.
    archive_sql = "begin;select id from public.users where id=" + quote(OWNER) + " for update;update public.companies set archived_at=now() where id=" + quote(A) + ";commit;"
    binding_before_archive = a.binding()
    grant_before_archive = a.grant("fixture-subject-1")
    results = base.concurrent_processes(fixture, [archive_sql, a.command("grant_refresh", shared["id"], CLIENT, grant_before_archive["version"], CIPHER, CIPHER, EXPIRY)])
    check(results[0][0], "Concurrent archive failed")
    # Refresh can finish before archival, or be denied after it. Once archive
    # has committed, no following call can use the company or mutate history.
    check(not results[1][0] or results[1][1] == "true", "Refresh/archive race produced an unexpected result")
    archived_before = snapshot(fixture)
    token_version = grant_before_archive["version"] + (1 if results[1][0] else 0)
    binding_version = binding_before_archive["version"]
    for command in [a.command("binding_get"), a.command("grant_for_identity", "fixture-subject-1", CLIENT),
                    a.save_sql(subject="fixture-subject-1", grant_version=token_version, binding_version=binding_version),
                    a.command("binding_unlink", binding_version), a.command("binding_select_calendar", binding_version, "calendar", None),
                    a.command("grant_refresh", shared["id"], CLIENT, token_version, CIPHER, CIPHER, EXPIRY)]:
        fixture.rejected(command, "Archived company used Google storage", "service_role")
    check(snapshot(fixture) == archived_before, "Archival checks modified stored history")
    check(stores[0].binding() is not None and b.binding() is not None and stores[3].binding() is not None, "Archive affected another workspace")
    fixture.sql("update public.companies set archived_at=null where id=" + quote(A) + ";")
    check(a.binding()["grant_id"] == shared["id"], "Restoration lost binding history")

    check(base.legacy_snapshot(fixture) == legacy_before, "Storage operations changed legacy bytes or access")
    pending = base.state("bindings-rollback-independent-live-oauth")
    fixture.issue(pending)
    saved, roles, schema = snapshot(fixture), base.role_snapshot(fixture), base.schema_snapshot(fixture)
    oauth_before = fixture.sql("select jsonb_agg(to_jsonb(s) order by state_hash) from google_workspace.oauth_states s;")
    fixture.sql(rollback.read_text(), MIGRATOR)
    check(snapshot(fixture) == saved and base.legacy_snapshot(fixture) == legacy_before, "Rollback changed credential/binding/legacy bytes")
    check(base.role_snapshot(fixture) == roles and base.schema_snapshot(fixture) == schema, "Rollback changed roles/shared schema")
    check(fixture.sql("select jsonb_agg(to_jsonb(s) order by state_hash) from google_workspace.oauth_states s;") == oauth_before, "Rollback touched independent OAuth states")
    base.expect_authorization(fixture.consume(pending), pending)
    for signature in FUNCTIONS:
        check(fixture.sql("select has_function_privilege('service_role'," + quote(signature) + ",'EXECUTE');") == "f", "Rollback left backend function active")
    for table in ["grants", "bindings"]:
        fixture.rejected("select * from google_workspace." + table + ";", "Rollback left private reads active", "service_role")
    fixture.rejected(a.command("binding_get"), "Rollback left RPC reachable", "service_role")
    fixture.sql("revoke create on schema public,google_workspace from " + MIGRATOR + ";revoke references on public.users,public.companies from " + MIGRATOR + ";")
    check(fixture.sql("select has_schema_privilege(" + quote(MIGRATOR) + ",'public','CREATE') or has_schema_privilege(" + quote(MIGRATOR) + ",'google_workspace','CREATE');") == "f", "Temporary CREATE permission remained")
    check(fixture.sql("select count(*)=0 from pg_auth_members where member=(select oid from pg_roles where rolname=" + quote(MIGRATOR) + ");") == "t", "Temporary membership remained")
    print("PASS archive/rollback: unauthorized companies denied; all history/legacy preserved and new access disabled", flush=True)
    print("PASS " + str(base.ASSERTIONS) + " private-storage assertions", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", default="/private/tmp/zelo-pg-runtime/bin")
    parser.add_argument("--baseline-no-bindings", action="store_true")
    args = parser.parse_args()
    migration, rollback = REPO / "supabase/migrations" / NAME, REPO / "supabase/rollback" / NAME
    with tempfile.TemporaryDirectory(prefix="zelo-google-bindings-pg-", dir="/private/tmp") as directory:
        fixture = base.Fixture(pathlib.Path(args.bin_dir), pathlib.Path(directory))
        try:
            fixture.start()
            base.bootstrap(fixture)
            fixture.sql((REPO / "supabase/migrations/20261013010000_google_oauth_state.sql").read_text())
            if args.baseline_no_bindings:
                check(Store(fixture).binding() is None, "RED: private Google bindings are absent")
            check(migration.is_file() and rollback.is_file(), "RED: private Google binding storage not implemented")
            verify(fixture, migration, rollback)
        finally:
            fixture.stop()


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, base.SqlFailure) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
    except Exception as error:
        frames = traceback.extract_tb(error.__traceback__)
        location = next((f for f in reversed(frames) if pathlib.Path(f.filename).name == pathlib.Path(__file__).name), None)
        print("Fixture failed: " + type(error).__name__ + (" at " + location.name + ":" + str(location.lineno) if location else ""), flush=True)
        raise SystemExit(1) from None

#!/usr/bin/env python3
"""Disposable PostgreSQL OAuth-state checks using fictitious data and Unix sockets.

The baseline switch represents the pre-state schema at 5d6e994, without applying
the new migration. It must report the missing capability before the GREEN run.
"""

import argparse
import concurrent.futures
import datetime
import hashlib
import json
import os
import pathlib
import re
import secrets
import subprocess
import tempfile
import threading
import traceback


REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = "20261013010000_google_oauth_state.sql"
ISSUE = "public.zelo_google_state_issue(uuid,text,uuid,text,text,text,text,text)"
CONSUME = "public.zelo_google_state_consume(uuid,text,text,text)"
OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
COMPANY_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
COMPANY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
FOREIGN_COMPANY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3"
ARCHIVED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4"
DELETED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5"
RETURN_KEYS = {"user_id", "mode", "company_id", "locale", "nonce_hash", "expires_at"}
ASSERTIONS = 0


def check(condition, message):
    global ASSERTIONS
    ASSERTIONS += 1
    if not condition:
        raise AssertionError(message)


def quote(value):
    return "null" if value is None else "'" + str(value).replace("'", "''") + "'"


def digest(label):
    return hashlib.sha256(("fictitious-oauth-state:" + label).encode()).hexdigest()


def state(label):
    return {
        "state": digest(label + ":state"), "session": digest(label + ":session"),
        "client": digest("fixture-oauth-client"), "nonce": digest(label + ":nonce"),
    }


class SqlFailure(RuntimeError):
    """Never expose query text, row values, or PostgreSQL DETAIL/CONTEXT."""


class Fixture:
    def __init__(self, binary, root):
        self.binary = binary
        self.root = root
        self.data = root / "data"
        self.socket = root / "socket"
        self.socket.mkdir()
        self.port = str(30000 + secrets.randbelow(20000))
        # Avoid inherited database credentials, service files, and remote PG settings.
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
        self.env.update(PGHOST=str(self.socket), PGPORT=self.port, PGUSER="google_state_fixture", PGDATABASE="postgres", PGPASSWORD="")
        self.started = False

    def start(self):
        subprocess.run(
            [str(self.binary / "initdb"), "-D", str(self.data), "-U", "google_state_fixture", "--auth=trust", "--no-locale"],
            check=True, capture_output=True, text=True, env=self.env, timeout=40,
        )
        options = f"-k {self.socket} -p {self.port} -c listen_addresses='' -c timezone=UTC -c max_connections=40 -c log_min_error_statement=panic"
        subprocess.run(
            [str(self.binary / "pg_ctl"), "-D", str(self.data), "-l", str(self.root / "postgres.log"), "-o", options, "-w", "start"],
            check=True, capture_output=True, text=True, env=self.env, timeout=40,
        )
        self.started = True

    def stop(self):
        if self.started:
            subprocess.run(
                [str(self.binary / "pg_ctl"), "-D", str(self.data), "-m", "immediate", "-w", "stop"],
                capture_output=True, text=True, env=self.env, timeout=20,
            )

    def sql(self, command, role=None):
        prefix = "set statement_timeout='20s';set lock_timeout='10s';"
        if role:
            prefix += "set role " + role + ";"
        process = subprocess.run(
            [str(self.binary / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate",
             "-h", str(self.socket), "-p", self.port, "-U", "google_state_fixture", "-d", "postgres"],
            input=prefix + command, text=True, capture_output=True, env=self.env, timeout=30,
        )
        if process.returncode:
            code = re.search(r"ERROR:\s*([A-Z0-9]{5})\b", process.stderr)
            raise SqlFailure("PostgreSQL operation rejected" + (" (SQLSTATE " + code.group(1) + ")" if code else ""))
        return process.stdout.strip()

    def read(self, command, role=None):
        return json.loads(self.sql(command, role))

    def rejected(self, command, label, role=None):
        try:
            self.sql(command, role)
        except SqlFailure:
            check(True, label)
            return
        check(False, label)

    def issue_sql(self, item, owner=OWNER, mode="business", company=COMPANY_A, locale="pt-BR"):
        values = [owner, mode, company, item["state"], item["session"], item["client"], item["nonce"], locale]
        return "select public.zelo_google_state_issue(" + ",".join(quote(value) for value in values) + ");"

    def issue(self, item, **kwargs):
        self.sql(self.issue_sql(item, **kwargs), "service_role")

    def consume_sql(self, item, owner=OWNER, session=None, client=None):
        values = [owner, item["state"], session or item["session"], client or item["client"]]
        return "select coalesce(public.zelo_google_state_consume(" + ",".join(quote(value) for value in values) + "),'null'::jsonb)::text;"

    def consume(self, item, **kwargs):
        return self.read(self.consume_sql(item, **kwargs), "service_role")

    def count(self, item=None, owner=None, live=False):
        where = []
        if item:
            where.append("state_hash=" + quote(item["state"]))
        if owner:
            where.append("user_id=" + quote(owner))
        if live:
            where.append("expires_at>clock_timestamp()")
        return int(self.sql("select count(*) from google_workspace.oauth_states" + (" where " + " and ".join(where) if where else "") + ";"))

    def clear(self):
        self.sql("delete from google_workspace.oauth_states;")

    def expire(self, item=None):
        predicate = " where state_hash=" + quote(item["state"]) if item else ""
        self.sql("update google_workspace.oauth_states set created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute'" + predicate + ";")


def bootstrap(fixture):
    fixture.sql(f"""
      create role anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role service_role nologin nosuperuser nocreatedb nocreaterole bypassrls;
      revoke create on schema public from public;
      create table public.users(id uuid primary key,name text not null,active_mode text not null default 'business',status text not null default 'active',company text);
      create table public.companies(id uuid primary key,user_id uuid not null references public.users(id),name text not null,
        is_default boolean not null default false,archived_at timestamptz,created_at timestamptz not null default now(),unique(id,user_id));
      create table public.google_tokens(user_id uuid primary key references public.users(id),access_token text not null,refresh_token text not null,expires_at timestamptz not null);
      alter table public.users enable row level security;
      alter table public.companies enable row level security;
      alter table public.google_tokens enable row level security;
      revoke all on public.users,public.companies,public.google_tokens from public,anon,authenticated;
      grant usage on schema public to service_role;
      grant select,insert,update,delete on public.users,public.companies,public.google_tokens to service_role;
      create schema google_workspace;
      -- Real migrators may have permissive defaults; the migration must narrow
      -- inherited privileges rather than merely add its intended grants.
      alter default privileges in schema google_workspace grant all on tables to service_role;
      revoke all on schema google_workspace from public,anon,authenticated;
      grant usage on schema google_workspace to service_role;
      create table google_workspace.fixture_marker(note text not null);
      insert into google_workspace.fixture_marker values('Existing fictitious private module');
      grant select on google_workspace.fixture_marker to service_role;
      insert into public.users(id,name,company) values('{OWNER}','Owner fictitious A','Same fictitious company'),('{OTHER}','Owner fictitious B','Same fictitious company');
      insert into public.companies(id,user_id,name,is_default,archived_at) values
        ('{COMPANY_A}','{OWNER}','Same fictitious company',true,null),('{COMPANY_B}','{OWNER}','Same fictitious company',false,null),
        ('{FOREIGN_COMPANY}','{OTHER}','Same fictitious company',true,null),('{ARCHIVED}','{OWNER}','Archived fictitious company',false,now()),
        ('{DELETED}','{OWNER}','Deleted-target fictitious company',false,null);
      insert into public.google_tokens values
        ('{OWNER}','v1:fictitious-access:00ffAABB+/=','v1:fictitious-refresh:001122cc+/=','2070-01-01T00:00:00Z'),
        ('{OTHER}','v1:fictitious-access:99ffAABB+/=','v1:fictitious-refresh:991122cc+/=','2070-01-01T00:00:00Z');
    """)


def schema_snapshot(fixture):
    return fixture.sql("select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','google_workspace');")


def role_snapshot(fixture):
    return fixture.sql("select jsonb_build_object('roles',(select jsonb_agg(jsonb_build_object('oid',oid,'name',rolname,'super',rolsuper,'create_role',rolcreaterole,'login',rolcanlogin,'bypass',rolbypassrls) order by oid) from pg_roles),'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member,grantor),'[]'::jsonb) from pg_auth_members m));")


def legacy_snapshot(fixture):
    # Compare exact stored bytes and metadata in memory; never print the result.
    return fixture.sql("select jsonb_build_object('rows',(select jsonb_agg(jsonb_build_object('user',user_id,'access',encode(convert_to(access_token,'UTF8'),'hex'),'refresh',encode(convert_to(refresh_token,'UTF8'),'hex'),'expiry',expires_at) order by user_id) from public.google_tokens),'table',(select jsonb_build_object('owner',relowner,'acl',relacl::text,'rls',relrowsecurity) from pg_class where oid='public.google_tokens'::regclass));")


def expect_authorization(result, item, owner=OWNER, mode="business", company=COMPANY_A, locale="pt-BR"):
    check(isinstance(result, dict) and set(result) == RETURN_KEYS, "Consumed state exposed unexpected fields or omitted the authorization tuple")
    check(result["user_id"] == owner and result["mode"] == mode and result["company_id"] == company, "Captured target workspace changed during OAuth")
    check(result["locale"] == locale and result["nonce_hash"] == item["nonce"], "Captured locale or nonce hash changed")
    # PostgreSQL omits trailing fractional zeros; Python 3.9 fromisoformat rejects
    # valid timestamp fractions unless they have exactly three or six digits.
    timestamp = result["expires_at"].replace("Z", "+00:00")
    pattern = "%Y-%m-%dT%H:%M:%S" + (".%f" if "." in timestamp[19:] else "") + "%z"
    expires = datetime.datetime.strptime(timestamp, pattern)
    check(expires.tzinfo is not None, "Expiry must carry a timezone")


def concurrent_processes(fixture, commands):
    # Each worker starts its own psql process and PostgreSQL connection after the shared barrier.
    barrier = threading.Barrier(len(commands))

    def worker(command):
        barrier.wait(timeout=10)
        try:
            return True, fixture.sql(command, "service_role")
        except SqlFailure:
            return False, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(commands)) as executor:
        return list(executor.map(worker, commands))


def verify(fixture, migration, rollback):
    roles_before = role_snapshot(fixture)
    schema_before = schema_snapshot(fixture)
    legacy_before = legacy_snapshot(fixture)
    fixture.sql(migration.read_text())
    check(role_snapshot(fixture) == roles_before, "Migration created or elevated a role/membership")
    check(schema_snapshot(fixture) == schema_before, "Migration changed pre-existing schema grants")
    check(legacy_snapshot(fixture) == legacy_before, "Migration changed legacy ciphertext bytes or access metadata")
    check(fixture.sql("select relrowsecurity from pg_class where oid='google_workspace.oauth_states'::regclass;") == "t", "Private OAuth states do not have RLS enabled")
    check(fixture.sql("select count(*) from pg_policy where polrelid='google_workspace.oauth_states'::regclass;") == "0", "Private OAuth states acquired a browser RLS policy")
    columns = set(fixture.read("select jsonb_agg(column_name) from information_schema.columns where table_schema='google_workspace' and table_name='oauth_states';"))
    required = {"state_hash", "session_hash", "client_fingerprint", "nonce_hash", "user_id", "mode", "company_id", "locale", "created_at", "expires_at"}
    check(columns == required, "State storage contract added raw secret fields or missed hashed metadata")
    primary = fixture.read("select jsonb_agg(a.attname order by array_position(c.conkey,a.attnum)) from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey) where c.conrelid='google_workspace.oauth_states'::regclass and c.contype='p';")
    check(primary == ["state_hash"], "OAuth state hash is not the unique primary identity")
    for signature in [ISSUE, CONSUME]:
        metadata = fixture.read("select jsonb_build_object('definer',prosecdef,'config',proconfig) from pg_proc where oid=" + quote(signature) + "::regprocedure;")
        check(metadata["definer"] is False and "search_path=pg_catalog" in (metadata["config"] or []), "OAuth RPC does not use invoker rights and a fixed pg_catalog search path")
        check(fixture.sql("select has_function_privilege('service_role'," + quote(signature) + ",'EXECUTE');") == "t", "Trusted backend lacks explicit RPC access")
        check(fixture.sql("select count(*) from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=" + quote(signature) + "::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE';") == "0", "PUBLIC can execute an OAuth RPC")
        for role in ["anon", "authenticated"]:
            check(fixture.sql("select has_function_privilege(" + quote(role) + "," + quote(signature) + ",'EXECUTE');") == "f", "Browser role can execute an OAuth RPC")
    for role in ["anon", "authenticated"]:
        check(fixture.sql("select has_schema_privilege(" + quote(role) + ",'google_workspace','USAGE');") == "f", "Browser role can enter the private schema")
        check(fixture.sql("select has_table_privilege(" + quote(role) + ",'google_workspace.oauth_states','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');") == "f", "Browser role has direct state privileges")
        fixture.rejected("select count(*) from google_workspace.oauth_states;", "Browser role read private state storage", role)
        fixture.rejected(fixture.issue_sql(state("browser-denied")), "Browser role started OAuth state", role)
        fixture.rejected(fixture.consume_sql(state("browser-denied")), "Browser role consumed OAuth state", role)
    for privilege in ["SELECT", "INSERT", "DELETE"]:
        check(fixture.sql("select has_table_privilege('service_role','google_workspace.oauth_states'," + quote(privilege) + ");") == "t", "Trusted backend lacks a required minimal state privilege")
    for privilege in ["UPDATE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]:
        check(fixture.sql("select has_table_privilege('service_role','google_workspace.oauth_states'," + quote(privilege) + ");") == "f", "Trusted backend inherited an excessive state privilege: " + privilege)
    check(fixture.sql("select has_schema_privilege('service_role','google_workspace','CREATE');") == "f", "Trusted backend acquired private schema CREATE")
    print("PASS private storage: RLS/ACL, hashes, invoker RPCs, fixed search path, unchanged roles and legacy bytes", flush=True)

    for label, owner, mode, company, locale in [
        ("personal", OWNER, "personal", None, "pt-BR"), ("company-a", OWNER, "business", COMPANY_A, "es"),
        ("company-b", OWNER, "business", COMPANY_B, "pt-PT"), ("other-owner", OTHER, "business", FOREIGN_COMPANY, "pt-BR"),
    ]:
        item = state(label)
        fixture.issue(item, owner=owner, mode=mode, company=company, locale=locale)
        ttl = fixture.sql("select extract(epoch from expires_at-created_at) from google_workspace.oauth_states where state_hash=" + quote(item["state"]) + ";")
        check(float(ttl) == 600, "The database did not fix state expiry to ten minutes")
        fixture.rejected("update google_workspace.oauth_states set expires_at=created_at+interval '11 minutes' where state_hash=" + quote(item["state"]) + ";", "Database accepted an expiry above ten minutes")
        expect_authorization(fixture.consume(item, owner=owner), item, owner, mode, company, locale)
        check(fixture.count(item) == 0 and fixture.consume(item, owner=owner) is None, "OAuth state was not consumed exactly once")

    for label, owner, mode, company in [
        ("null-owner", None, "personal", None), ("unknown-owner", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9", "personal", None),
        ("invalid-mode", OWNER, "shared", None), ("missing-mode", OWNER, None, None),
        ("personal-company", OWNER, "personal", COMPANY_A), ("business-no-company", OWNER, "business", None),
        ("foreign-company", OWNER, "business", FOREIGN_COMPANY), ("archived-company", OWNER, "business", ARCHIVED),
        ("missing-company", OWNER, "business", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9"),
    ]:
        item = state(label)
        fixture.rejected(fixture.issue_sql(item, owner, mode, company), "An invalid owner/workspace tuple was accepted", "service_role")
        check(fixture.count(item) == 0, "A rejected target persisted OAuth state")
    for field in ["state", "session", "client", "nonce"]:
        for raw in [None, "", "fictitious-raw-value", "g" * 64]:
            item = state("invalid-hash:" + field + str(raw))
            item[field] = raw
            fixture.rejected(fixture.issue_sql(item), "A non-SHA256 metadata field was stored", "service_role")
    print("PASS issue: independent Personal/companies/owners, captured locale, database TTL and rejected invalid tuples/hashes", flush=True)

    item = state("mismatch-preserves-state")
    fixture.issue(item)
    for mismatch in [{"owner": OTHER}, {"session": digest("wrong-session")}, {"client": digest("wrong-client")}]:
        try:
            rejected = fixture.consume(item, **mismatch)
        except SqlFailure:
            rejected = None
        check(rejected is None and fixture.count(item) == 1, "A wrong owner/session/client obtained authorization or consumed another browser's state")
    fixture.rejected(fixture.issue_sql(item, locale="es"), "A duplicate state overwrote its captured metadata", "service_role")
    expect_authorization(fixture.consume(item), item)

    expired = state("expired")
    fixture.issue(expired)
    fixture.expire(expired)
    check(fixture.consume(expired) is None and fixture.count(expired) == 0, "Expired state was not removed without returning authorization")
    archived = state("archived-after-start")
    fixture.issue(archived, company=COMPANY_B)
    fixture.sql("update public.companies set archived_at=now() where id=" + quote(COMPANY_B) + ";")
    check(fixture.consume(archived) is None and fixture.count(archived) == 0, "Archived target granted authorization or fell back to another workspace")
    fixture.sql("update public.companies set archived_at=null where id=" + quote(COMPANY_B) + ";")
    deleted = state("deleted-after-start")
    fixture.issue(deleted, company=DELETED)
    fixture.sql("delete from public.companies where id=" + quote(DELETED) + ";")
    check(fixture.consume(deleted) is None and fixture.count(deleted) == 0, "Deleted target granted authorization or retained an authorizing state")

    immutable = state("immutable-target")
    fixture.issue(immutable, company=COMPANY_A, locale="es")
    fixture.sql("update public.users set active_mode='personal',company='Renamed remembered company' where id=" + quote(OWNER) + ";update public.companies set name='Identical renamed company',is_default=false where id=" + quote(COMPANY_A) + ";update public.companies set name='Identical renamed company',is_default=true where id=" + quote(COMPANY_B) + ";")
    expect_authorization(fixture.consume(immutable), immutable, company=COMPANY_A, locale="es")
    print("PASS consume: mismatches preserve state; expired/archived/deleted targets never authorize; names/mode/default company cannot change the captured target", flush=True)

    callbacks = state("concurrent-callbacks")
    fixture.issue(callbacks)
    results = concurrent_processes(fixture, [fixture.consume_sql(callbacks)] * 8)
    check(all(success for success, _ in results), "Concurrent callback consumption failed instead of returning a single authorization")
    authorized = [json.loads(value) for _, value in results if value != "null"]
    check(len(authorized) == 1 and fixture.count(callbacks) == 0, "Concurrent callback processes returned more or fewer than one authorization")
    expect_authorization(authorized[0], callbacks)
    fixture.clear()
    for index in range(20):
        fixture.issue(state("cap:" + str(index)))
    fixture.rejected(fixture.issue_sql(state("cap:21")), "The database accepted more than twenty live states for an owner", "service_role")
    fixture.issue(state("other-owner-cap"), owner=OTHER, company=FOREIGN_COMPANY)
    check(fixture.count(owner=OWNER, live=True) == 20 and fixture.count(owner=OTHER, live=True) == 1, "The state limit leaked across owners")
    fixture.expire(state("cap:0"))
    fixture.issue(state("cap:replacement"))
    check(fixture.count(owner=OWNER, live=True) == 20, "Expired rows counted toward the live-state cap")
    fixture.clear()
    for index in range(19):
        fixture.issue(state("concurrent-cap-seed:" + str(index)))
    starts = concurrent_processes(fixture, [fixture.issue_sql(state("concurrent-cap:" + str(index))) for index in range(6)])
    check(sum(success for success, _ in starts) == 1 and fixture.count(owner=OWNER, live=True) == 20, "Concurrent starts exceeded the twenty-state owner limit")
    print("PASS real cross-process races: one callback result, twenty-state cap, owner independence and expired-state capacity", flush=True)

    fixture.clear()
    live = state("rollback-live")
    fixture.issue(live)
    schema_after = schema_snapshot(fixture)
    fixture.rejected(rollback.read_text(), "Rollback discarded an unexpired OAuth state")
    check(fixture.count(live) == 1, "Rejected rollback changed a live state")
    check(schema_snapshot(fixture) == schema_after and role_snapshot(fixture) == roles_before, "Rejected rollback changed grants or roles")
    expect_authorization(fixture.consume(live), live)
    fixture.issue(state("rollback-expired"))
    fixture.expire()
    fixture.sql(rollback.read_text())
    check(fixture.sql("select to_regclass('google_workspace.oauth_states') is null;") == "t", "Expired-only rollback left OAuth state storage active")
    for signature in [ISSUE, CONSUME]:
        check(fixture.sql("select to_regprocedure(" + quote(signature) + ") is null;") == "t", "Rollback left an OAuth RPC callable")
    check(legacy_snapshot(fixture) == legacy_before, "Rollback changed legacy ciphertext or its grants")
    check(schema_snapshot(fixture) == schema_after and role_snapshot(fixture) == roles_before, "Rollback changed shared schema grants or role memberships")
    check(fixture.sql("select count(*) from google_workspace.fixture_marker;") == "1", "Rollback deleted another private module's table")
    print("PASS rollback: refuses live states, permits expired states, preserves private schema/grants, other tables and exact legacy bytes", flush=True)
    print("PASS " + str(ASSERTIONS) + " assertions across five PostgreSQL integration groups", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", default="/private/tmp/zelo-pg-runtime/bin")
    parser.add_argument("--baseline-no-state", action="store_true", help="Exercise the pre-state capability at baseline 5d6e994 without applying the working-tree migration")
    args = parser.parse_args()
    binary = pathlib.Path(args.bin_dir)
    for name in ["initdb", "pg_ctl", "psql"]:
        check((binary / name).is_file(), "Required local PostgreSQL executable is unavailable")
    migration, rollback = REPO / "supabase/migrations" / NAME, REPO / "supabase/rollback" / NAME
    with tempfile.TemporaryDirectory(prefix="zelo-google-state-pg-", dir="/private/tmp") as directory:
        fixture = Fixture(binary, pathlib.Path(directory))
        try:
            fixture.start()
            bootstrap(fixture)
            if args.baseline_no_state:
                available = fixture.sql("select to_regprocedure(" + quote(ISSUE) + ") is not null and to_regprocedure(" + quote(CONSUME) + ") is not null;")
                check(available == "t", "RED: capacidade ausente no baseline (5d6e994); OAuth-state RPCs have not been installed in this fixture")
            check(migration.is_file() and rollback.is_file(), "RED: persistent OAuth-state migration/rollback is not implemented")
            verify(fixture, migration, rollback)
        finally:
            fixture.stop()


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, SqlFailure) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
    except Exception as error:
        # Unexpected local failures also avoid dumping SQL, fixture rows, or secret-looking fake values.
        frames = traceback.extract_tb(error.__traceback__)
        location = next((frame for frame in reversed(frames) if pathlib.Path(frame.filename).name == pathlib.Path(__file__).name), None)
        print("Fixture execution failed: " + type(error).__name__ + (" at " + location.name + ":" + str(location.lineno) if location else ""), flush=True)
        raise SystemExit(1) from None

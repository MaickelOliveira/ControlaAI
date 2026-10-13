#!/usr/bin/env python3
"""Real, disposable PostgreSQL schedule-index regression; no provider or TCP access.

Run with --bin-dir /private/tmp/zelo-pg-runtime/bin. Before the migration exists,
the existing schema/authorized reads run and the absent index is the RED result.
Local SQL execution times are evidence only, never a pass/fail threshold.
"""

import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import secrets
import subprocess
import tempfile
import traceback
import uuid


REPO = pathlib.Path(__file__).resolve().parents[2]
NAME = "20261013020000_bank_schedule_index.sql"
INDEX = "sync_jobs_complete_lookup_idx"
OWNER = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
ASSERTIONS = 0
MIGRATIONS = [
    "20261009193000_open_finance_storage", "20261009213000_open_finance_server_access",
    "20261009220000_open_finance_consents", "20261009230000_open_finance_sync_queue",
    "20261009234000_open_finance_report", "20261010185000_open_finance_categories",
    "20261010230000_open_finance_public", "20261011030000_open_finance_notifications",
    "20261011090000_open_finance_connection_management", "20261011093000_open_finance_subscription_retirement",
    "20261011110000_open_finance_archive_history", "20261011160000_companies",
    "20261011170000_open_finance_companies", "20261011210000_nfse_preparation",
    "20261012000000_bank_identity", "20261012010000_company_archive",
    "20261012020000_finance_account_filter", "20261012030000_bank_workspace_reconnect",
    "20261012040000_preserve_bank_movement_facts", "20261012050000_credit_funded_payments",
    "20261012060000_whatsapp_quiet_activity", "20261012070000_credit_pix_questions",
    "20261012071000_credit_pix_question_completion", "20261012072000_credit_pix_verified_holder",
    "20261012073000_legacy_server_only_access", "20261012090000_bank_ledger_batch",
]


def check(condition, message):
    global ASSERTIONS
    ASSERTIONS += 1
    if not condition:
        raise AssertionError(message)


def quote(value):
    return "null" if value is None else "'" + str(value).replace("'", "''") + "'"


def fixture_id(label):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://example.test/bank-schedule-index/" + label))


class SqlFailure(RuntimeError):
    """Fixed safe diagnostics: never print SQL, headers, or fixture rows."""


class Fixture:
    def __init__(self, binary, root):
        self.binary, self.root = binary, root
        self.data, self.socket = root / "data", root / "socket"
        self.socket.mkdir()
        self.port = str(30000 + secrets.randbelow(20000))
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
        self.env.update(PGHOST=str(self.socket), PGPORT=self.port, PGUSER="schedule_index_fixture", PGDATABASE="postgres", PGPASSWORD="")
        self.started = False

    def start(self):
        subprocess.run([str(self.binary / "initdb"), "-D", str(self.data), "-U", "schedule_index_fixture", "--auth=trust", "--no-locale"], check=True, capture_output=True, text=True, env=self.env, timeout=40)
        options = f"-k {self.socket} -p {self.port} -c listen_addresses='' -c timezone=UTC -c max_connections=20 -c log_min_error_statement=panic"
        subprocess.run([str(self.binary / "pg_ctl"), "-D", str(self.data), "-l", str(self.root / "fixture.log"), "-o", options, "-w", "start"], check=True, capture_output=True, text=True, env=self.env, timeout=40)
        self.started = True

    def stop(self):
        if self.started:
            subprocess.run([str(self.binary / "pg_ctl"), "-D", str(self.data), "-m", "immediate", "-w", "stop"], capture_output=True, text=True, env=self.env, timeout=20)

    def sql(self, command, role=None, scope=None):
        # psql reads individual statements from stdin. In particular a concurrent
        # index build/drop is never batched into an implicit transaction by -c.
        prefix = "set statement_timeout='60s';set lock_timeout='10s';"
        if role:
            prefix += "set role " + role + ";"
        if scope:
            headers = json.dumps({"x-zelo-owner": scope["owner"], "x-zelo-company": scope["company"]})
            prefix += "set request.headers to " + quote(headers) + ";"
        result = subprocess.run([str(self.binary / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-h", str(self.socket), "-p", self.port, "-U", "schedule_index_fixture", "-d", "postgres"], input=prefix + command, text=True, capture_output=True, env=self.env, timeout=70)
        if result.returncode:
            code = re.search(r"ERROR:\s*([A-Z0-9]{5})\b", result.stderr)
            raise SqlFailure("PostgreSQL operation rejected" + (" (SQLSTATE " + code.group(1) + ")" if code else ""))
        return result.stdout.strip()

    def read(self, command, role=None, scope=None):
        return json.loads(self.sql(command, role, scope))

    def denied(self, command, label, role, scope):
        try:
            self.sql(command, role, scope)
        except SqlFailure:
            check(True, label)
            return
        check(False, label)

    def rpc_sql(self, scope, name, undated=True):
        if name == "agenda":
            values = [scope["owner"], scope["mode"], self.period_from, self.period_to]
            return "select public.zelo_of_agenda(" + ",".join(quote(value) for value in values) + "," + ("true" if undated else "false") + ");"
        return "select public.zelo_of_overview(" + ",".join(quote(value) for value in [scope["owner"], "production", scope["mode"]]) + ");"

    def rpc(self, scope, name, undated=True):
        return self.read(self.rpc_sql(scope, name, undated), "service_role", scope)

    def explain(self, command, role, scope):
        return self.read("explain (analyze,buffers,format json) " + command, role, scope)[0]


def bootstrap(fixture):
    fixture.sql("""
        create role anon nologin nosuperuser nocreatedb nocreaterole nobypassrls;
        create role authenticated nologin nosuperuser nocreatedb nocreaterole nobypassrls;
        create role service_role nologin nosuperuser nocreatedb nocreaterole bypassrls;
        create schema storage;
        create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    """ + (REPO / "supabase/schema.sql").read_text().replace('create extension if not exists "pgcrypto";', ""))
    for name in MIGRATIONS:
        fixture.sql((REPO / "supabase/migrations" / (name + ".sql")).read_text())
    for index, owner in enumerate([OWNER, OTHER], 1):
        fixture.sql("insert into public.users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode,company) values(" + ",".join(quote(value) for value in [owner, "551100000000" + str(index), "Fictitious owner", "fixture" + str(index) + "@example.test", "fictitious-password-hash", "business", "active"]) + ",now()+interval '7 days','business','Identical fictitious company');")
    companies = {owner: fixture.sql("select id from public.companies where user_id=" + quote(owner) + " and is_default;") for owner in [OWNER, OTHER]}
    alternate = fixture.sql("insert into public.companies(user_id,name) values(" + quote(OWNER) + ",'Identical fictitious company') returning id;")
    fixture.today = datetime.date.fromisoformat(fixture.sql("select (now() at time zone 'America/Sao_Paulo')::date;"))
    fixture.period_from, fixture.period_to = fixture.today - datetime.timedelta(days=30), fixture.today + datetime.timedelta(days=30)
    return [
        {"label": "owner-a-company-a", "owner": OWNER, "company": companies[OWNER], "mode": "business", "incomplete": True},
        {"label": "owner-a-company-b", "owner": OWNER, "company": alternate, "mode": "business", "incomplete": False},
        {"label": "owner-a-personal", "owner": OWNER, "company": companies[OWNER], "mode": "personal", "incomplete": False},
        {"label": "owner-b-company", "owner": OTHER, "company": companies[OTHER], "mode": "business", "incomplete": True},
        {"label": "owner-b-personal", "owner": OTHER, "company": companies[OTHER], "mode": "personal", "incomplete": False},
    ]


def seed_scope(fixture, scope):
    label, owner, mode = scope["label"], scope["owner"], scope["mode"]
    consent = {"id": fixture_id(label + ":consent"), "cliente_user_id": owner, "institution_id": fixture_id(label + ":institution"), "institution_name": "Fictitious bank " + label, "status": "AUTHORISED", "products": ["CREDIT_CARD_ACCOUNT"]}
    fixture.sql("select public.zelo_of_enable_brazil(" + quote(owner) + "," + quote(mode) + ",'BR',true);", "service_role", scope)
    result = fixture.read("select public.zelo_of_save_consent(" + quote(owner) + "," + quote(mode) + "," + quote(json.dumps(consent)) + "::jsonb);", "service_role", scope)
    scope["connection"] = result["id"]
    cards = {}
    for card in ["current", "stale", "replaced", "matched", "unmatched", "pending-source", "other-kind", "other-resource"]:
        resource = fixture_id(label + ":card:" + card)
        external = label + "-" + card
        cards[card] = {"id": resource, "external": external}
        fixture.sql("insert into open_finance.resources(id,connection_id,user_id,environment,mode,resource_type,external_id,name,subtype,currency) values(" + ",".join(quote(value) for value in [resource, scope["connection"], owner, "production", mode, "card", external, "Fictitious card " + card, "credit-cards", "BRL"]) + ");")

    def job(key, card, kind="installments", status="complete", days=2, window=None):
        identifier = fixture_id(label + ":job:" + key)
        stamp = str(fixture.today - datetime.timedelta(days=days)) + "T12:00:00Z"
        fixture.sql("insert into open_finance.sync_jobs(id,connection_id,user_id,mode,kind,family,external_resource_id,filter_window,status,created_at,updated_at) values(" + ",".join(quote(value) for value in [identifier, scope["connection"], owner, mode, kind, "credit-cards", cards[card]["external"]]) + "," + quote(json.dumps(window or {})) + "::jsonb," + ",".join(quote(value) for value in [status, stamp, stamp]) + ");")
        return identifier

    current_installments = job("current-installments", "current")
    current_recurring = job("current-recurrings", "current", "recurrings")
    stale = job("stale-old", "stale", days=4)
    job("stale-new", "stale")
    replaced_old = job("replaced-old", "replaced", days=4)
    replaced_new = job("replaced-new", "replaced")
    pending = job("pending-source", "pending-source", status="pending")
    job("matched-pending", "matched", status="pending", days=3)
    job("matched-pending-complete", "matched")
    job("matched-failed", "matched", "recurrings", "failed", 3)
    job("matched-failed-complete", "matched", "recurrings")
    # A pending source remains hidden, even when a completed replacement removes
    # its incomplete warning. Only the unmatched jobs below keep that warning.
    job("pending-source-complete", "pending-source", days=1)
    if scope["incomplete"]:
        job("wrong-window-failed", "unmatched", status="failed", days=3, window={"fromUpdatedAt": "2026-01-01"})
        job("wrong-window-complete", "unmatched", window={"fromUpdatedAt": "2026-02-01"})
        job("wrong-kind-pending", "other-kind", status="pending", days=3)
        job("wrong-kind-complete", "other-kind", "recurrings")
        job("wrong-resource-failed", "other-resource", "recurrings", "failed", 3)
        job("wrong-resource-complete", "unmatched", "recurrings")

    def schedule(key, card, source, kind="installment", due=1, total=12, observed=2, currency="BRL"):
        identifier = fixture_id(label + ":schedule:" + key)
        source_key = hashlib.sha256((label + ":" + key).encode()).hexdigest()
        date = fixture.today + datetime.timedelta(days=due) if due is not None else None
        values = [identifier, cards[card]["id"], owner, "production", mode, source_key, kind, label + " " + key, "52.25", currency, str(date) if date else None, total, observed, source]
        fixture.sql("insert into open_finance.card_schedules(id,resource_id,user_id,environment,mode,source_key,kind,description,amount,currency,due_date,total_installments,observed_installments,last_job_id,observed_transactions,regularity_score,period_months) values(" + ",".join(quote(value) for value in values) + ",array['fictitious-transaction'],0.95,1);")
        return identifier

    scope["visible"] = {
        schedule("current-installments", "current", current_installments),
        schedule("last-installment", "current", current_installments, due=2, total=3, observed=3),
        schedule("current-recurring", "current", current_recurring, "recurring", 3, None, None, "USD"),
        schedule("undated-recurring", "current", current_recurring, "recurring", None, None, None),
        schedule("replacement-current", "replaced", replaced_new, due=4),
    }
    scope["hidden"] = {
        schedule("superseded-stale", "stale", stale),
        schedule("superseded-replaced", "replaced", replaced_old),
        schedule("unfinished-source", "pending-source", pending),
    }
    scope["lookup_external"] = cards["stale"]["external"]
    scope["lookup_after"] = str(fixture.today - datetime.timedelta(days=4)) + "T12:00:00Z"
    external_array = "array[" + ",".join(quote(card["external"]) for card in cards.values()) + "]"
    # Representative completed history across real cards/kinds/windows; all older
    # than the sources above, so these rows cannot change which schedule is current.
    fixture.sql("insert into open_finance.sync_jobs(connection_id,user_id,mode,kind,family,external_resource_id,filter_window,status,created_at,updated_at) select " + ",".join(quote(value) for value in [scope["connection"], owner, mode]) + ",case when i%2=0 then 'installments' else 'recurrings' end,'credit-cards',(" + external_array + ")[1+i%8],jsonb_build_object('fromUpdatedAt','historical-'||i),'complete'," + quote(str(fixture.today - datetime.timedelta(days=60))) + "::timestamptz+i*interval '1 second'," + quote(str(fixture.today - datetime.timedelta(days=60))) + "::timestamptz+i*interval '1 second' from generate_series(1,2500) i;")


def metadata_snapshot(fixture):
    # Definitions are fingerprinted in PostgreSQL. No source/row content is printed.
    return fixture.read("""
        select jsonb_build_object(
          'schemas',(select jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance')),
          'roles',(select jsonb_agg(to_jsonb(r) order by oid) from pg_roles r),
          'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by roleid,member,grantor),'[]'::jsonb) from pg_auth_members m),
          'relations',(select jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'options',c.reloptions) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','open_finance') and c.relkind in ('r','v','S')),
          'policies',(select jsonb_agg(to_jsonb(p) order by oid) from pg_policy p),
          'functions',(select jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl::text,'config',p.proconfig,'definition',md5(pg_get_functiondef(p.oid))) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','open_finance')),
          'views',(select jsonb_agg(jsonb_build_object('oid',c.oid,'definition',md5(pg_get_viewdef(c.oid))) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','open_finance') and c.relkind='v'),
          'existing_indexes',(select jsonb_agg(jsonb_build_object('oid',c.oid,'definition',pg_get_indexdef(c.oid),'valid',i.indisvalid,'ready',i.indisready) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_index i on i.indexrelid=c.oid where n.nspname in ('public','open_finance') and c.relname<>'sync_jobs_complete_lookup_idx'));
    """)


def data_snapshot(fixture):
    tables = fixture.read("select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','open_finance') and c.relkind='r';")
    result = {}
    for table in tables:
        name = table["schema"] + "." + table["table"]
        identifier = '"' + table["schema"].replace('"', '""') + '"."' + table["table"].replace('"', '""') + '"'
        result[name] = fixture.read("select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),''))) from " + identifier + " t;")
    return result


def security_checks(fixture, scopes):
    role = fixture.read("select jsonb_build_object('login',rolcanlogin,'super',rolsuper,'bypass',rolbypassrls,'inherit',rolinherit) from pg_roles where rolname='zelo_of_workspace';")
    check(role == {"login": False, "super": False, "bypass": False, "inherit": False}, "RPC execution role stopped being a restricted NOLOGIN/RLS principal")
    check(fixture.sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);") == "0", "Fixture migrator retained a workspace role membership")
    for signature in ["public.zelo_of_agenda(uuid,text,date,date,boolean)", "public.zelo_of_overview(uuid,text,text)"]:
        metadata = fixture.read("select jsonb_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig) from pg_proc where oid=" + quote(signature) + "::regprocedure;")
        check(metadata["owner"] == "zelo_of_workspace" and metadata["definer"] and "row_security=on" in metadata["config"] and "search_path=pg_catalog" in metadata["config"], "Authorized read changed its RLS owner/search path")
        for role in ["anon", "authenticated"]:
            check(fixture.sql("select has_function_privilege(" + quote(role) + "," + quote(signature) + ",'EXECUTE');") == "f", "Browser can invoke bank RPC")
    for role in ["anon", "authenticated", "service_role"]:
        fixture.denied("select count(*) from open_finance.sync_jobs;", "Non-workspace principal read private jobs", role, scopes[0])
    wrong_company = dict(scopes[0], company=scopes[3]["company"])
    wrong_owner = dict(scopes[0], owner=OTHER)
    for name in ["agenda", "overview"]:
        for headers in [wrong_company, wrong_owner]:
            fixture.denied(fixture.rpc_sql(scopes[0], name), "Cross-owner/company read was accepted", "service_role", headers)
        for role in ["anon", "authenticated"]:
            fixture.denied(fixture.rpc_sql(scopes[0], name), "Browser read was accepted", role, scopes[0])


def capture_reads(fixture, scopes):
    result = {}
    for scope in scopes:
        agenda, overview = fixture.rpc(scope, "agenda"), fixture.rpc(scope, "overview")
        ids = {item["id"] for item in agenda["items"]}
        check(ids == scope["visible"] and ids.isdisjoint(scope["hidden"]), "Authorized agenda leaked another workspace or retained superseded/unfinished schedules")
        check(agenda["incomplete"] is scope["incomplete"], "Replacement matching changed the agenda incomplete flag")
        check({item["id"] for item in overview["agenda"]["items"]} == ids, "Overview agenda differs from the authorized schedule set")
        dated = fixture.rpc(scope, "agenda", undated=False)
        check(len(dated["items"]) == 4 and all(item["due_date"] for item in dated["items"]), "Undated schedule selection changed")
        result[scope["label"]] = {"agenda": agenda, "overview": overview, "dated": dated}
    return result


def lookup_sql(scope):
    return "select id from open_finance.sync_jobs where connection_id=" + quote(scope["connection"]) + " and kind='installments' and external_resource_id=" + quote(scope["lookup_external"]) + " and status='complete' and updated_at>" + quote(scope["lookup_after"]) + "::timestamptz order by updated_at desc limit 1;"


def index_names(plan):
    names = {plan["Index Name"]} if "Index Name" in plan else set()
    for child in plan.get("Plans", []):
        names.update(index_names(child))
    return names


def timings(fixture, scope):
    return {name: fixture.explain(fixture.rpc_sql(scope, name), "service_role", scope)["Execution Time"] for name in ["agenda", "overview"]}


def single_statement(path, expected):
    text = path.read_text()
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"--[^\n]*", "", text)
    actual = re.sub(r"\s+", "", text).rstrip(";").lower()
    check(actual == re.sub(r"\s+", "", expected), "Migration/rollback must contain only the prescribed concurrent index statement, without a transaction")
    return text


def verify(fixture, scopes):
    for scope in scopes:
        seed_scope(fixture, scope)
    fixture.sql("analyze open_finance.sync_jobs;analyze open_finance.card_schedules;analyze open_finance.resources;analyze open_finance.connections;")
    security_checks(fixture, scopes)
    before_reads = capture_reads(fixture, scopes)
    before_metadata, before_data = metadata_snapshot(fixture), data_snapshot(fixture)
    before_timing = timings(fixture, scopes[0])
    before_plan = fixture.explain(lookup_sql(scopes[0]), "zelo_of_workspace", scopes[0])
    check(before_plan["Plan"]["Actual Rows"] == 1, "Scoped completed lookup did not find its legitimate newer replacement")
    check(INDEX not in index_names(before_plan["Plan"]), "Fixture baseline already contains the new completed lookup index")
    print("PASS baseline: real scoped agenda/overview, five workspaces, stale/current schedules, replacement flags and restricted NOLOGIN/RLS role", flush=True)
    print("BASELINE local SQL execution ms: agenda=" + str(before_timing["agenda"]) + "; overview=" + str(before_timing["overview"]) + "; newer-complete=" + str(before_plan["Execution Time"]), flush=True)
    migration, rollback = REPO / "supabase/migrations" / NAME, REPO / "supabase/rollback" / NAME
    if migration.is_file():
        fixture.sql(single_statement(migration, "create index concurrently sync_jobs_complete_lookup_idx on open_finance.sync_jobs(connection_id,kind,external_resource_id,updated_at desc) where status='complete'"))
    present = fixture.sql("select to_regclass('open_finance.sync_jobs_complete_lookup_idx') is not null;")
    check(present == "t", "RED: completed-job lookup index is absent from the existing bank schema")
    check(rollback.is_file(), "Concurrent index rollback has not been implemented")
    metadata = fixture.read("select jsonb_build_object('valid',i.indisvalid,'ready',i.indisready,'unique',i.indisunique,'table',i.indrelid::regclass::text,'keys',(select jsonb_agg(pg_get_indexdef(i.indexrelid,k,true) order by k) from generate_series(1,i.indnkeyatts) k),'updated_desc',(i.indoption[3]&1)=1,'predicate',pg_get_expr(i.indpred,i.indrelid)) from pg_index i where i.indexrelid='open_finance.sync_jobs_complete_lookup_idx'::regclass;")
    check(metadata["valid"] and metadata["ready"] and not metadata["unique"], "Concurrent completed-job index is not valid/ready or changes uniqueness")
    # pg_get_indexdef(index, column, pretty) returns the key expression without
    # ordering modifiers. Inspect pg_index.indoption for the actual DESC flag.
    check(metadata["table"] == "open_finance.sync_jobs" and metadata["keys"] == ["connection_id", "kind", "external_resource_id", "updated_at"] and metadata["updated_desc"], "Completed lookup index has the wrong table/key order")
    check(metadata["predicate"] == "(status = 'complete'::text)", "Completed lookup index includes other job statuses")
    after_reads = capture_reads(fixture, scopes)
    check(after_reads == before_reads, "Index changed agenda/overview JSON, ordering or incomplete flags")
    check(metadata_snapshot(fixture) == before_metadata, "Index changed ACL/RLS, roles, functions, views or existing indexes")
    check(data_snapshot(fixture) == before_data, "Index changed jobs, schedules or other stored data")
    security_checks(fixture, scopes)
    check(fixture.sql("show enable_seqscan;") == "on", "Fixture disabled sequential scans to force the planner")
    after_plan = fixture.explain(lookup_sql(scopes[0]), "zelo_of_workspace", scopes[0])
    check(INDEX in index_names(after_plan["Plan"]), "Normal planner did not use the completed index for the scoped newer-complete lookup")
    check(after_plan["Plan"]["Actual Rows"] == before_plan["Plan"]["Actual Rows"], "Index changed the authorized completed lookup result")
    after_timing = timings(fixture, scopes[0])
    print("PASS concurrent build: valid/ready partial keys, exact authorized JSON and all data/security metadata preserved, normal RLS planner uses index", flush=True)
    print("AFTER local SQL execution ms: agenda=" + str(after_timing["agenda"]) + "; overview=" + str(after_timing["overview"]) + "; newer-complete=" + str(after_plan["Execution Time"]), flush=True)
    fixture.sql(single_statement(rollback, "drop index concurrently open_finance.sync_jobs_complete_lookup_idx"))
    check(fixture.sql("select to_regclass('open_finance.sync_jobs_complete_lookup_idx') is null;") == "t", "Rollback left the completed lookup index installed")
    check(capture_reads(fixture, scopes) == before_reads, "Rollback changed authorized agenda/overview JSON")
    check(metadata_snapshot(fixture) == before_metadata, "Rollback changed roles, grants, RLS, functions, views or another index")
    check(data_snapshot(fixture) == before_data, "Rollback changed stored data")
    jobs = before_data["open_finance.sync_jobs"]["count"]
    schedules = before_data["open_finance.card_schedules"]["count"]
    print("PASS rollback: only completed index removed; " + str(jobs) + " fictitious jobs and " + str(schedules) + " schedules preserved", flush=True)
    print("PASS " + str(ASSERTIONS) + " assertions; timings are local evidence, not page-load/network measurements or a speed threshold", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin-dir", default="/private/tmp/zelo-pg-runtime/bin")
    args = parser.parse_args()
    binary = pathlib.Path(args.bin_dir)
    for name in ["initdb", "pg_ctl", "psql"]:
        check((binary / name).is_file(), "Required local PostgreSQL executable is unavailable")
    with tempfile.TemporaryDirectory(prefix="zelo-schedule-index-pg-", dir="/private/tmp") as directory:
        fixture = Fixture(binary, pathlib.Path(directory))
        try:
            fixture.start()
            verify(fixture, bootstrap(fixture))
        finally:
            fixture.stop()


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, SqlFailure) as error:
        print(str(error), flush=True)
        raise SystemExit(1) from None
    except Exception as error:
        frames = traceback.extract_tb(error.__traceback__)
        location = next((frame for frame in reversed(frames) if pathlib.Path(frame.filename).name == pathlib.Path(__file__).name), None)
        print("Fixture execution failed: " + type(error).__name__ + (" at " + location.name + ":" + str(location.lineno) if location else ""), flush=True)
        raise SystemExit(1) from None

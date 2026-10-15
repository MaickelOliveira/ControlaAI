#!/usr/bin/env python3
"""Disposable PostgreSQL checks for confirmed, account-scoped transfer patterns."""
import argparse
import ast
import json
import os
import pathlib
import re
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--bin-dir", required=True)
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parents[2]
binary = pathlib.Path(args.bin_dir)
root = pathlib.Path(tempfile.mkdtemp(prefix="zelo-transfer-patterns-", dir="/private/tmp"))
data = root / "data"
socket = root / "socket"
socket.mkdir()
env = dict(os.environ, PGHOST=str(socket), PGPORT="55444", PGUSER="transfer_fixture", PGDATABASE="postgres", PGPASSWORD="")
started = False


def sql(statement):
    result = subprocess.run([str(binary / "psql"), "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], input=statement, text=True, capture_output=True, env=env, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip().splitlines()[-1] if result.stdout.strip() else ""


def scoped(user, company, statement):
    headers = json.dumps({"x-zelo-owner": user, "x-zelo-company": company})
    return "set role service_role; select set_config('request.headers','" + headers + "',false);" + statement


try:
    subprocess.run([str(binary / "initdb"), "-D", str(data), "-U", "transfer_fixture", "--auth=trust", "--no-locale"], check=True, capture_output=True, text=True)
    subprocess.run([str(binary / "pg_ctl"), "-D", str(data), "-l", str(root / "fixture.log"), "-o", "-k " + str(socket) + " -p 55444 -c listen_addresses=''", "-w", "start"], check=True, capture_output=True, text=True)
    started = True
    bootstrap = "create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);"
    bootstrap += (repo / "supabase/schema.sql").read_text().replace('create extension if not exists "pgcrypto";', "")
    base_test = (repo / "supabase/tests/run-bank-ledger-batch.py").read_text()
    migrations = ast.literal_eval(re.search(r"migrations=(\[[^\n]+\])", base_test).group(1))
    migrations.append("20261012090000_bank_ledger_batch")
    for name in migrations:
        bootstrap += "\n" + (repo / "supabase/migrations" / (name + ".sql")).read_text()
    sql(bootstrap)

    owner = "00000000-0000-4000-8000-000000000001"
    other = "00000000-0000-4000-8000-000000000002"
    for number, user in enumerate([owner, other], 1):
        sql("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode) values('" + user + "','551100000000" + str(number) + "','Fixture','fixture" + str(number) + "@example.test','fictitious','business','active',now()+interval '7 days','business');")
    primary = sql("select id from companies where user_id='" + owner + "' and is_default;")
    alternate = sql("insert into companies(user_id,name) values('" + owner + "','Alternate fixture') returning id;")
    other_company = sql("select id from companies where user_id='" + other + "' and is_default;")

    def account(user, company, suffix):
        consent = {"id": "10000000-0000-4000-8000-0000000000" + suffix, "cliente_user_id": user, "institution_id": "20000000-0000-4000-8000-000000000001", "institution_name": "Fixture Bank", "status": "AUTHORISED", "products": ["ACCOUNT"]}
        result = sql(scoped(user, company, "select public.zelo_of_enable_brazil('" + user + "','business','BR',true);select public.zelo_of_save_consent('" + user + "','business','" + json.dumps(consent) + "'::jsonb);"))
        connection = json.loads(result)["id"]
        return sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values('" + connection + "','" + user + "','production','business','account','" + suffix + "','Fixture Account','CHECKING_ACCOUNT') returning id;")

    account_one = account(owner, primary, "01")
    account_two = account(owner, alternate, "02")
    account_other = account(other, other_company, "03")

    def movement(user, resource, suffix, date, description, direction="debit", amount=1200):
        escaped = description.replace("'", "''")
        return sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,transaction_date,description,amount,currency,direction,classification,source_type) values('" + resource + "','" + user + "','production','business','account','" + suffix + "','" + date + "','" + escaped + "'," + str(amount) + ",'BRL','" + direction + "','unknown','PIX') returning id;")

    september = movement(owner, account_one, "sept", "2026-09-02", "PIX ENVIADO PARA SAMIRA")
    october = movement(owner, account_one, "oct", "2026-10-02", "PIX ENVIADO PARA SAMIRA")
    unrelated = movement(owner, account_one, "other-name", "2026-10-02", "PIX ENVIADO PARA JOAO")
    different_amount = movement(owner, account_one, "other-amount", "2026-10-02", "PIX ENVIADO PARA SAMIRA", amount=30)
    opposite_direction = movement(owner, account_one, "opposite", "2026-10-02", "PIX ENVIADO PARA SAMIRA", direction="credit")
    alternate_movement = movement(owner, account_two, "other-company", "2026-09-02", "PIX ENVIADO PARA SAMIRA")
    other_movement = movement(other, account_other, "other-user", "2026-09-02", "PIX ENVIADO PARA SAMIRA")
    sql((repo / "supabase/migrations/20261015103000_confirmed_own_transfer_patterns.sql").read_text())
    count = sql(scoped(owner, primary, "select public.zelo_of_confirm_own_transfer_pattern('" + owner + "','business','" + september + "');"))
    assert count == "2", count
    assert sql("select count(*) from open_finance.movements where id in ('" + september + "','" + october + "') and user_category='Transferência entre contas próprias';") == "2"
    assert sql("select count(*) from open_finance.movements where id in ('" + unrelated + "','" + different_amount + "','" + opposite_direction + "','" + alternate_movement + "','" + other_movement + "') and user_category is null;") == "5"
    assert sql(scoped(owner, alternate, "select public.zelo_of_confirm_own_transfer_pattern('" + owner + "','business','" + september + "');")) == "-1"
    assert sql(scoped(owner, primary, "select public.zelo_of_set_movement_category('" + owner + "','business','" + alternate_movement + "','Outros');")) == "f"
    future = movement(owner, account_one, "future", "2026-11-02", "PIX ENVIADO PARA SAMIRA")
    assert sql("select user_category from open_finance.movements where id='" + future + "';") == "Transferência entre contas próprias"
    future_other_amount = movement(owner, account_one, "future-other-amount", "2026-11-02", "PIX ENVIADO PARA SAMIRA", amount=30)
    assert sql("select user_category is null from open_finance.movements where id='" + future_other_amount + "';") == "t"
    assert sql(scoped(owner, primary, "select public.zelo_of_clear_own_transfer_pattern('" + owner + "','business','" + september + "');")) == "t"
    assert sql("select user_category is null from open_finance.movements where id='" + september + "';") == "t"
    after_clear = movement(owner, account_one, "after-clear", "2026-12-02", "PIX ENVIADO PARA SAMIRA")
    assert sql("select user_category is null from open_finance.movements where id='" + after_clear + "';") == "t"
    assert sql("select user_category from open_finance.movements where id='" + october + "';") == "Transferência entre contas próprias"
    print("Confirmed own-transfer patterns: history, future import, holder/company isolation and reversal passed")
finally:
    if started:
        subprocess.run([str(binary / "pg_ctl"), "-D", str(data), "-m", "immediate", "-w", "stop"], capture_output=True, text=True)

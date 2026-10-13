#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-ledger-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
env=dict(os.environ,PGHOST=str(socket),PGPORT='55442',PGUSER='ledger_fixture',PGDATABASE='postgres',PGPASSWORD='')
started=False
def sql(text):
    r=subprocess.run([str(binary/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,env=env,timeout=60)
    if r.returncode:raise RuntimeError(r.stderr)
    return r.stdout.strip()
def read(text):return json.loads(sql(text))
def scoped(owner,company,text,role='service_role'):
    headers=json.dumps({'x-zelo-owner':owner,'x-zelo-company':company})
    return "set role "+role+";select set_config('request.headers','"+headers+"',false);"+text
def value(owner,company,name,after=None):
    args="'"+owner+"','business','2026-10-01','2026-10-31'"+((' ,null' if after is None else ",'"+after+"'") if name=='zelo_of_report' else '')
    output=sql(scoped(owner,company,"select public."+name+"("+args+");"))
    return json.loads(output.splitlines()[-1])
def denied(owner,company,name,role='service_role'):
    try:value(owner,company,name) if role=='service_role' else sql(scoped(owner,company,"select public."+name+"('"+owner+"','business','2026-10-01','2026-10-31');",role))
    except RuntimeError:return
    raise AssertionError('Unauthorized report was accepted')
try:
    subprocess.run([str(binary/'initdb'),'-D',str(data),'-U','ledger_fixture','--auth=trust','--no-locale'],check=True,capture_output=True,text=True)
    subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-l',str(root/'fixture.log'),'-o',"-k "+str(socket)+" -p 55442 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
    bootstrap="create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);"
    bootstrap+=(repo/'supabase/schema.sql').read_text().replace('create extension if not exists "pgcrypto";','')
    migrations=['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts','20261012050000_credit_funded_payments','20261012060000_whatsapp_quiet_activity','20261012070000_credit_pix_questions','20261012071000_credit_pix_question_completion','20261012072000_credit_pix_verified_holder','20261012073000_legacy_server_only_access']
    for name in migrations:bootstrap+='\n'+(repo/('supabase/migrations/'+name+'.sql')).read_text()
    sql(bootstrap)
    owner='00000000-0000-4000-8000-000000000001';other='00000000-0000-4000-8000-000000000002'
    for n,user in enumerate([owner,other],1):sql("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode) values('"+user+"','551100000000"+str(n)+"','Fixture','fixture"+str(n)+"@example.test','fictitious','business','active',now()+interval '7 days','business');")
    companies={u:sql("select id from companies where user_id='"+u+"' and is_default;") for u in [owner,other]}
    alternate=sql("insert into companies(user_id,name) values('"+owner+"','Same fixture name') returning id;")
    before=read("select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef,'volatility',provolatile) from pg_proc where oid='public.zelo_of_report(uuid,text,date,date,uuid)'::regprocedure;")
    def fixture(user,company,mode,count):
        consent={'id':str(__import__('uuid').uuid4()),'cliente_user_id':user,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['ACCOUNT','CREDIT_CARD_ACCOUNT']}
        result=sql(scoped(user,company,"select public.zelo_of_enable_brazil('"+user+"','"+mode+"','BR',true);select public.zelo_of_save_consent('"+user+"','"+mode+"','"+json.dumps(consent)+"'::jsonb);"))
        connection=json.loads(result.splitlines()[-1])['id']
        resource=sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values('"+connection+"','"+user+"','production','"+mode+"','account','fixture-account','Fixture Account','CHECKING_ACCOUNT') returning id;")
        sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,transaction_date,description,amount,currency,direction,classification) select '"+resource+"','"+user+"','production','"+mode+"','account','fixture-'||i,'2026-10-11','Fixture movement '||i,case when i%9=0 then null else 0.10 end,'BRL',case when i%7=0 then 'credit' else 'debit' end,case when i%5=0 then 'transfer' else 'purchase' end from generate_series(1,"+str(count)+") i;")
        return resource
    resource=fixture(owner,companies[owner],'business',2000)
    fixture(owner,alternate,'business',3);fixture(other,companies[other],'business',4);fixture(owner,companies[owner],'personal',5)
    # Snapshot the existing implementation before installing the new shared core.
    baseline=[];baseline_first=None;baseline_cursor=None;old_bytes=0
    for page in range(40):
        old=value(owner,companies[owner],'zelo_of_report',baseline_cursor)
        baseline_first=baseline_first or old;baseline+=old['movements'];baseline_cursor=old['next']
        old_bytes+=len(json.dumps(old,separators=(',',':')).encode())
        if baseline_cursor is None:break
    assert len(baseline)==2000 and baseline_cursor is None
    migration=repo/'supabase/migrations/20261012090000_bank_ledger_batch.sql'
    if migration.exists():sql(migration.read_text())
    assert sql("select to_regprocedure('public.zelo_of_ledger_report(uuid,text,date,date)') is not null;")=='t','RED: batch RPC does not exist'
    after=read("select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef,'volatility',provolatile) from pg_proc where oid='public.zelo_of_report(uuid,text,date,date,uuid)'::regprocedure;")
    assert before==after,'Existing paginated RPC metadata changed'
    batch=value(owner,companies[owner],'zelo_of_ledger_report');assert len(batch['movements'])==2000 and batch['next'] is None
    first=None;all_movements=[];cursor=None
    for page in range(40):
        current=value(owner,companies[owner],'zelo_of_report',cursor);first=first or current;assert len(current['movements'])<=50
        all_movements+=current['movements'];cursor=current['next']
        if cursor is None:break
    assert all_movements==batch['movements']==baseline,'Batch changed order or movement facts'
    for key in ['totals','missing_dates','sync_pending','last_successful_sync_at','from','to','history_complete']:assert batch[key]==first[key]==baseline_first[key],key
    assert len(value(owner,alternate,'zelo_of_ledger_report')['movements'])==3
    assert len(value(other,companies[other],'zelo_of_ledger_report')['movements'])==4
    denied(owner,companies[other],'zelo_of_ledger_report')
    for role in ['anon','authenticated']:denied(owner,companies[owner],'zelo_of_ledger_report',role)
    signatures=['public.zelo_of_ledger_report(uuid,text,date,date)','open_finance.report_page(uuid,text,date,date,uuid,integer)']
    for signature in signatures:
        metadata=read("select json_build_object('owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig) from pg_proc where oid='"+signature+"'::regprocedure;")
        assert metadata['owner']=='zelo_of_workspace' and metadata['definer'] and 'row_security=on' in metadata['config']
        for role in ['anon','authenticated']:assert sql("select has_function_privilege('"+role+"','"+signature+"','EXECUTE');")=='f'
    assert sql("select has_function_privilege('service_role','open_finance.report_page(uuid,text,date,date,uuid,integer)','EXECUTE');")=='f'
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    assert sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);")=='0'
    sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,transaction_date,description,amount,currency,direction,classification) values('"+resource+"','"+owner+"','production','business','account','fixture-over-limit','2026-10-11','Fixture extra',1,'BRL','debit','purchase');")
    overflow=value(owner,companies[owner],'zelo_of_ledger_report');assert len(overflow['movements'])==2000 and overflow['next'] is not None
    assert sql("select count(*) from open_finance.movements;")=='2013'
    rollback=repo/'supabase/rollback/20261012090000_bank_ledger_batch.sql'
    sql(rollback.read_text())
    assert value(owner,companies[owner],'zelo_of_report')['movements']==overflow['movements'][:50]
    assert sql("select to_regprocedure('public.zelo_of_ledger_report(uuid,text,date,date)') is null;")=='t'
    sql(migration.read_text())
    assert value(owner,companies[owner],'zelo_of_ledger_report')['next'] is not None
    # Effective privileges inherited from PUBLIC must not become new direct grants.
    sql(rollback.read_text())
    sql('grant create on schema public,open_finance to public;')
    schema_acl=sql("select json_agg(json_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance');")
    sql(migration.read_text())
    assert sql("select json_agg(json_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance');")==schema_acl,'Inherited CREATE became a new direct privilege'
    sql(rollback.read_text())
    assert sql("select json_agg(json_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance');")==schema_acl
    sql('revoke create on schema public,open_finance from public;')
    sql(migration.read_text())
    # Managed migrators can administer a role without SET/INHERIT access.
    sql(rollback.read_text())
    sql("create role managed_migrator nologin createrole noinherit;grant usage,create on schema public,open_finance to managed_migrator with grant option;grant zelo_of_workspace to managed_migrator with admin true,inherit false,set false;")
    def membership_snapshot():
        return sql("select json_agg(json_build_object('grantor',grantor,'admin',admin_option,'inherit',inherit_option,'set',set_option) order by grantor) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member='managed_migrator'::regrole;")
    for own,set_option in [(False,False),(True,False),(True,True)]:
        if own:
            sql("set role managed_migrator;grant zelo_of_workspace to managed_migrator with admin false,inherit false,set "+('true' if set_option else 'false')+" granted by managed_migrator;")
        original_memberships=membership_snapshot()
        original_acl=sql("select json_agg(json_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance');")
        sql('set role managed_migrator;'+migration.read_text())
        assert membership_snapshot()==original_memberships,'Migrator memberships changed'
        assert sql("select json_agg(json_build_object('name',nspname,'acl',nspacl::text) order by nspname) from pg_namespace where nspname in ('public','open_finance');")==original_acl
        sql('set role managed_migrator;'+rollback.read_text())
        assert membership_snapshot()==original_memberships,'Rollback memberships changed'
    sql(migration.read_text())
    print('PASS fixture report bytes:',old_bytes,'serial ->',len(json.dumps(batch,separators=(',',':')).encode()),'batch',flush=True)
    print('PASS PostgreSQL: 2000 facts/order/metadata match40 pages; owner/company/mode isolation; bounded overflow; ACL/RLS/owner and no temporary privileges',flush=True)
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],capture_output=True,text=True)

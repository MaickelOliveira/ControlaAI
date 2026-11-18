#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);p.add_argument('--before-fix',action='store_true');a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-sync-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
env=dict(os.environ,PGHOST=str(socket),PGPORT='55443',PGUSER='ledger_fixture',PGDATABASE='postgres',PGPASSWORD='')
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
    subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-l',str(root/'fixture.log'),'-o',"-k "+str(socket)+" -p 55443 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
    bootstrap="create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);"
    bootstrap+=(repo/'supabase/schema.sql').read_text().replace('create extension if not exists "pgcrypto";','')
    migrations=['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts','20261012050000_credit_funded_payments','20261012060000_whatsapp_quiet_activity','20261012070000_credit_pix_questions','20261012071000_credit_pix_question_completion','20261012072000_credit_pix_verified_holder','20261012073000_legacy_server_only_access']
    for name in migrations:bootstrap+='\n'+(repo/('supabase/migrations/'+name+'.sql')).read_text()
    sql(bootstrap)
    owner='00000000-0000-4000-8000-000000000001';other='00000000-0000-4000-8000-000000000002'
    for n,user in enumerate([owner,other],1):sql("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode) values('"+user+"','551100000000"+str(n)+"','Fixture','fixture"+str(n)+"@example.test','fictitious','business','active',now()+interval '7 days','business');")
    companies={u:sql("select id from companies where user_id='"+u+"' and is_default;") for u in [owner,other]}
    alternate=sql("insert into companies(user_id,name) values('"+owner+"','Same fixture name') returning id;")
    sql((repo/'supabase/migrations/20261012090000_bank_ledger_batch.sql').read_text())
    def connection(user,company,mode='business'):
        consent={'id':str(__import__('uuid').uuid4()),'cliente_user_id':user,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['ACCOUNT']}
        result=sql(scoped(user,company,"select public.zelo_of_enable_brazil('"+user+"','"+mode+"','BR',true);select public.zelo_of_save_consent('"+user+"','"+mode+"','"+json.dumps(consent)+"'::jsonb);"))
        return json.loads(result.splitlines()[-1])['id']
    bank=connection(owner,companies[owner]);second=connection(owner,alternate);foreign=connection(other,companies[other]);personal=connection(owner,companies[owner],'personal')
    def job(c,user=owner,mode='business',status='pending',error=None):
        return sql("insert into open_finance.sync_jobs(connection_id,user_id,environment,mode,kind,family,external_resource_id,status,error_code) values('"+c+"','"+user+"','production','"+mode+"','catalog','accounts','fixture', '"+status+"',"+("'"+error+"'" if error else 'null')+") returning id;")
    j=job(bank,status='failed',error='INVALID_CREDIT_PAYMENTS')
    job(second,status='pending');job(foreign,user=other,status='failed');job(personal,mode='personal',status='pending')
    signatures=['open_finance.report_page(uuid,text,date,date,uuid,integer)','public.zelo_of_report(uuid,text,date,date,uuid)','public.zelo_of_ledger_report(uuid,text,date,date)']
    def permissions():return read("select json_agg(json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef) order by oid) from pg_proc where oid=any(array["+','.join("'"+s+"'::regprocedure" for s in signatures)+"]);")
    before=permissions()
    if not a.before_fix:sql((repo/'supabase/migrations/20261118170000_bank_sync_status.sql').read_text())
    def report(company=companies[owner],mode='business'):
        return json.loads(sql(scoped(owner,company,"select public.zelo_of_ledger_report('"+owner+"','"+mode+"','2026-11-01','2026-11-30');")).splitlines()[-1])
    assert report().get('sync_status')=='failed','failed jobs must never be represented as updating'
    assert report()['sync_pending'] is True
    assert report(alternate)['sync_status']=='updating','a failure in another company cannot leak into this workspace'
    assert report(mode='personal')['sync_status']=='updating','business failures cannot change personal status'
    sql("update open_finance.sync_jobs set status='pending',error_code='INVALID_CREDIT_PAYMENTS',available_at=now()+interval '5 minutes' where id='"+j+"';")
    assert report()['sync_status']=='failed','retry backoff is an error, not an import currently running'
    sql("update open_finance.sync_jobs set status='running',lease_until=now()+interval '1 minute' where id='"+j+"';")
    assert report()['sync_status']=='updating'
    sql("update open_finance.sync_jobs set lease_until=now()-interval '1 second' where id='"+j+"';")
    assert report()['sync_status']=='failed','expired worker lease must not show a neverending spinner'
    sql("update open_finance.sync_jobs set status='failed',lease_until=null where id='"+j+"';")
    job(bank,status='complete')
    sql("update open_finance.sync_jobs set updated_at=now()+interval '1 second' where connection_id='"+bank+"' and status='complete';")
    assert report()['sync_status']=='idle','a repaired import supersedes its previous failed attempt'
    sql("update open_finance.sync_jobs set updated_at=now()+interval '2 seconds' where id='"+j+"';")
    assert report()['sync_status']=='failed'
    for column,assignment in [('archived_at','now()'),('revoked_at','now()'),('consent_expires_at',"now()-interval '1 day'")]:
        sql("update open_finance.connections set "+column+'='+assignment+(",status='revoked'" if column=='archived_at' else '')+" where id='"+bank+"';")
        assert report()['sync_status']=='idle','closed or expired connections must not keep imports updating'
        sql("update open_finance.connections set "+column+"=null,status='active' where id='"+bank+"';")
    assert permissions()==before,'migration preserves all existing owners, ACLs and RLS settings'
    assert sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);")=='0'
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    sql((repo/'supabase/migrations/20261118170000_bank_sync_status.sql').read_text())
    assert report()['sync_status']=='failed','migration is idempotent'
    print('PASS PostgreSQL: failed, retry, expired lease, repaired import, archived/revoked/expired consent, company/mode isolation, unchanged permissions')
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],capture_output=True,text=True)

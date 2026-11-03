#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-scheduled-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
env=dict(os.environ,PGHOST=str(socket),PGPORT='55448',PGUSER='ledger_fixture',PGDATABASE='postgres',PGPASSWORD='')
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
    subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-l',str(root/'fixture.log'),'-o',"-k "+str(socket)+" -p 55448 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
    bootstrap="create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);"
    bootstrap+=(repo/'supabase/schema.sql').read_text().replace('create extension if not exists "pgcrypto";','')
    migrations=['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261011210000_nfse_preparation','20261012000000_bank_identity','20261012010000_company_archive','20261012020000_finance_account_filter','20261012030000_bank_workspace_reconnect','20261012040000_preserve_bank_movement_facts','20261012050000_credit_funded_payments','20261012060000_whatsapp_quiet_activity','20261012070000_credit_pix_questions','20261012071000_credit_pix_question_completion','20261012072000_credit_pix_verified_holder','20261012073000_legacy_server_only_access']
    for name in migrations:bootstrap+='\n'+(repo/('supabase/migrations/'+name+'.sql')).read_text()
    sql(bootstrap)
    owner='00000000-0000-4000-8000-000000000001';other='00000000-0000-4000-8000-000000000002'
    for n,user in enumerate([owner,other],1):sql("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode) values('"+user+"','551100000000"+str(n)+"','Fixture','fixture"+str(n)+"@example.test','fictitious','business','active',now()+interval '7 days','business');")
    companies={u:sql("select id from companies where user_id='"+u+"' and is_default;") for u in [owner,other]}
    alternate=sql("insert into companies(user_id,name) values('"+owner+"','Same fixture name') returning id;")
    import uuid
    def quote(value):return "'"+str(value).replace("'","''")+"'"
    def invoke(user,company,mode,name,args='',role='service_role'):
        out=sql(scoped(user,company,'select public.'+name+'('+quote(user)+','+quote(mode)+args+');',role))
        return out.splitlines()[-1]
    def rejected(callback):
        try:callback()
        except RuntimeError:return
        raise AssertionError('Invalid/unauthorized operation was accepted')
    for name in ['20261012090000_bank_ledger_batch','20261015200000_bank_installment_anchors','20261017210000_bank_schedule_purchase_evidence','20261102210000_forecast_categories']:
        sql((repo/('supabase/migrations/'+name+'.sql')).read_text())
    def fixture(user,company,mode):
        consent={'id':str(uuid.uuid4()),'cliente_user_id':user,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['CREDIT_CARD_ACCOUNT']}
        invoke(user,company,mode,'zelo_of_enable_brazil',",'BR',true")
        connection=json.loads(invoke(user,company,mode,'zelo_of_save_consent',','+quote(json.dumps(consent))+'::jsonb'))['id']
        resource=sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values("+','.join(map(quote,[connection,user,'production',mode,'card','fixture-card','Fixture Card','credit-cards']))+") returning id;")
        job=sql("insert into open_finance.sync_jobs(connection_id,user_id,environment,mode,kind,family,external_resource_id,status) values("+','.join(map(quote,[connection,user,'production',mode,'installments','credit-cards','fixture-card','complete']))+") returning id;")
        series=sql("insert into open_finance.card_schedules(id,resource_id,user_id,environment,mode,source_key,kind,description,amount,currency,total_installments,observed_transactions,last_job_id) values("+','.join(map(quote,[str(uuid.uuid4()),resource,user,'production',mode,'f'*64,'installment','Fixture Shop']))+",57.34,null,3,array['fixture-1'],'"+job+"') returning id;")
        sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,transaction_date,bill_month,description,amount,currency,direction,classification,installment_number,installment_count) select "+','.join(map(quote,[resource,user,'production',mode,'card']))+",'fixture-'||i,current_date-10,date_trunc('month',current_date)+(i+1)*interval '1 month','Fixture Shop '||i||'/3',case when i=1 then 57.34 else 57.33 end,'BRL','debit','purchase',i,3 from generate_series(1,3)i;")
        return connection,resource,series
    connection,resource,series=fixture(owner,companies[owner],'business')
    _,alternate_resource,_=fixture(owner,alternate,'business')
    _,other_resource,_=fixture(other,companies[other],'business')
    _,personal_resource,_=fixture(owner,companies[owner],'personal')
    signature='public.zelo_of_installment_anchors(uuid,text)'
    meta="select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid="+quote(signature)+'::regprocedure;'
    before=read(meta)
    migration=repo/'supabase/migrations/20261103103000_scheduled_bank_installments.sql'
    sql(migration.read_text())
    assert before==read(meta),'Anchor reader security metadata changed'
    def result(user=owner,company=None,mode='business'):
        return json.loads(invoke(user,company or companies[user],mode,'zelo_of_installment_anchors'))
    response=result();assert response['items']==[],'Future installments changed the historical anchor contract'
    assert len(response['scheduled'])==3 and not response['incomplete']
    assert [float(row['amount']) for row in response['scheduled']]==[57.34,57.33,57.33]
    assert response['scheduled'][0]['schedule_ids']==[series] and response['scheduled'][1]['schedule_ids']==[]
    assert all(row['currency']=='BRL' and row['resource_id']==resource for row in response['scheduled'])
    assert all(row['resource_id']==alternate_resource for row in result(company=alternate)['scheduled'])
    assert all(row['resource_id']==other_resource for row in result(user=other)['scheduled'])
    assert all(row['resource_id']==personal_resource for row in result(mode='personal')['scheduled'])
    rejected(lambda:result(company=companies[other]))
    for role in ['anon','authenticated']:rejected(lambda:invoke(owner,companies[owner],'business','zelo_of_installment_anchors',role=role))
    # A card without a position currency still retains each movement's bank currency.
    sql("update open_finance.movements set currency='USD' where resource_id="+quote(resource)+" and installment_number=2;")
    assert result()['scheduled'][1]['currency']=='USD','Foreign currency was converted into BRL'
    sql("update open_finance.movements set amount=null,currency=null where resource_id="+quote(resource)+" and installment_number=3;")
    assert len(result()['scheduled'])==2,'Missing source value was guessed'
    sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,transaction_date,bill_month,description,amount,currency,direction,classification,installment_number,installment_count) select "+','.join(map(quote,[resource,owner,'production','business','card']))+",'bulk-fixture-'||i,current_date-5,date_trunc('month',current_date)+interval '1 month','Fixture bulk purchase '||i,1,'BRL','debit','purchase',1,2 from generate_series(1,4001)i;")
    overflow=result();assert len(overflow['scheduled'])==4000 and overflow['incomplete'],'Overflow was silently claimed complete'
    sql("update open_finance.connections set status='revoked' where id="+quote(connection)+';')
    assert result()['scheduled']==[],'Revoked consent leaked future purchases'
    assert sql('select count(*) from finances;')=='0','Forecast posted an expense'
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    assert sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);")=='0'
    sql((repo/'supabase/rollback/20261103103000_scheduled_bank_installments.sql').read_text())
    assert 'scheduled' not in result() and before==read(meta)
    print('PASS: future bill facts, exact cents, personal/company/owner isolation, unknown currency, revoked consent, unchanged access/payment facts, rollback')
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','stop'],capture_output=True,timeout=30)

#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-credit-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
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
    import uuid
    def quote(value):return "'"+str(value).replace("'","''")+"'"
    def invoke(user,company,mode,name,args='',role='service_role'):
        out=sql(scoped(user,company,'select public.'+name+'('+quote(user)+','+quote(mode)+args+');',role))
        return out.splitlines()[-1]
    def rejected(callback):
        try:callback()
        except RuntimeError:return
        raise AssertionError('Invalid/unauthorized operation was accepted')
    def fixture(user,company,mode):
        consent={'id':str(uuid.uuid4()),'cliente_user_id':user,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['CREDIT_OPERATIONS']}
        invoke(user,company,mode,'zelo_of_enable_brazil',",'BR',true")
        connection=json.loads(invoke(user,company,mode,'zelo_of_save_consent',','+quote(json.dumps(consent))+'::jsonb'))['id']
        resource=sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values("+','.join(map(quote,[connection,user,'production',mode,'financing','fixture-car','Fixture vehicle','financings']))+") returning id;")
        sql("insert into open_finance.credit_details(resource_id,user_id,environment,mode,resource_type,currency,outstanding_amount,due_date) values("+','.join(map(quote,[resource,user,'production',mode,'financing','BRL']))+",10000,'2027-05-31');")
        return connection,resource
    connection,resource=fixture(owner,companies[owner],'business')
    _,alternate_resource=fixture(owner,alternate,'business')
    _,other_resource=fixture(other,companies[other],'business')
    _,personal_resource=fixture(owner,companies[owner],'personal')
    metadata="select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid='public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)'::regprocedure;"
    before=read(metadata)
    migration=repo/'supabase/migrations/20261102163000_credit_installment_plans.sql';sql(migration.read_text())
    assert before==read(metadata),'Commit access gates/owner metadata changed'
    progress_metadata=metadata.replace('public.zelo_of_commit_page(uuid,text,uuid,uuid,jsonb,text,jsonb)','public.zelo_of_credit_data(uuid,text,date,date)')
    progress_before=read(progress_metadata)
    sql((repo/'supabase/migrations/20261102190000_credit_installment_progress.sql').read_text())
    assert progress_before==read(progress_metadata),'Credit reader access metadata changed'
    sql("update open_finance.credit_details set paid_installments=8,remaining_installments=7 where resource_id='"+resource+"';")
    plan={'amount':'890.10','currency':'BRL','first_due_date':'2026-09-30','last_due_date':'2027-05-30'}
    args=','+quote(resource)+','+quote(json.dumps(plan))+'::jsonb'
    assert invoke(owner,companies[owner],'business','zelo_of_set_credit_plan',args)=='t'
    def credit_data(user=owner,company=None,mode='business'):
        return json.loads(invoke(user,company or companies[user],mode,'zelo_of_credit_data',",'2026-09-01','2026-11-30'"))
    assert credit_data()['plans']==[dict(plan,resource_id=resource)]
    assert credit_data()['progress']==[{'resource_id':resource,'paid_installments':8,'remaining_installments':7,'due_date':'2027-05-31'}]
    sql((repo/'supabase/migrations/20261102203000_credit_schedule_units.sql').read_text())
    assert before==read(metadata) and progress_before==read(progress_metadata),'Credit access metadata changed'
    assert credit_data()['progress'][0]['remaining_installments'] is None,'Legacy duration exposed as a count'
    assert all(row['resource_id']!=resource for row in credit_data(company=alternate)['progress'])
    assert credit_data(company=alternate)['plans']==[]
    assert credit_data(user=other)['plans']==[]
    assert credit_data(mode='personal')['plans']==[]
    for target in [alternate_resource,other_resource,personal_resource]:assert invoke(owner,companies[owner],'business','zelo_of_set_credit_plan',','+quote(target)+','+quote(json.dumps(plan))+'::jsonb')=='f'
    rejected(lambda:credit_data(company=companies[other]))
    for role in ['anon','authenticated']:
        rejected(lambda:invoke(owner,companies[owner],'business','zelo_of_set_credit_plan',args,role))
        rejected(lambda:invoke(owner,companies[owner],'business','zelo_of_credit_data',",'2026-09-01','2026-11-30'",role))
    for patch in [{'amount':None},{'currency':None},{'amount':'-1'},{'amount':'0'},{'amount':'0.001'},{'currency':'USD'},{'first_due_date':'2026-02-30'},{'last_due_date':'2026-01-01'},{'last_due_date':'2076-09-30'},{'user_id':other}]:
        rejected(lambda:invoke(owner,companies[owner],'business','zelo_of_set_credit_plan',','+quote(resource)+','+quote(json.dumps(dict(plan,**patch)))+'::jsonb'))
    release={'external_id':'repayment-1','date':'2026-09-15','amount':'500.25','currency':'BRL'}
    def commit(history,updated='2026-11-02T12:00:00Z',lease_override=None,schedule=None):
        lease=str(uuid.uuid4())
        job=sql("insert into open_finance.sync_jobs(connection_id,user_id,environment,mode,kind,family,external_resource_id,status,lease_token,lease_until) values("+','.join(map(quote,[connection,owner,'production','business','catalog','financings','fixture-consent','running',lease]))+",now()+interval '1 minute') returning id;")
        rows={'credit':[{'resource_external_id':'fixture-car','resource_type':'financing','currency':'BRL','outstanding_amount':'0','source_updated_at':updated,'payment_history':history,'paid_installments':8,'remaining_installments':7,'credit_schedule':schedule}]}
        call=','+quote(job)+','+quote(lease_override or lease)+','+quote(json.dumps(rows))+'::jsonb,null,\'[]\'::jsonb'
        try:return invoke(owner,companies[owner],'business','zelo_of_commit_page',call)
        finally:sql("update open_finance.sync_jobs set status='complete' where id="+quote(job)+';')
    schedule={'version':1,'periodicity':'MENSAL','first_due_date':'2026-03-31','total_installments':15,'remaining_installments':7}
    commit([release],schedule=schedule)
    assert credit_data()['progress'][0]['total_installments']==15
    assert credit_data()['progress'][0]['remaining_installments']==7
    first=credit_data();assert len(first['payments'])==1 and first['payments'][0]['date']=='2026-09-15'
    assert first['payments'][0]['amount']=='500.25' and first['payments'][0]['resource_type']=='financing'
    assert first['plans']==[dict(plan,resource_id=resource)],'Bank refresh erased manual plan'
    commit(None);commit([])
    assert credit_data()['payments']==first['payments'],'Partial snapshots erased past payments'
    commit([dict(release,amount='1')],updated='2026-10-01T12:00:00Z')
    assert credit_data()['payments']==first['payments'],'Stale snapshot replaced history'
    rejected(lambda:commit([dict(release,amount='1')],lease_override=str(uuid.uuid4())))
    assert credit_data()['payments']==first['payments'],'Invalid lease wrote history'
    for bad in [dict(release,currency=None),dict(release,date='2026-02-30'),dict(release,private='discard'),dict(release,amount='-1')]:rejected(lambda:commit([bad]))
    assert sql('select count(*) from finances;')=='0','Manual plans posted payments'
    for signature in ['public.zelo_of_credit_data(uuid,text,date,date)','public.zelo_of_set_credit_plan(uuid,text,uuid,jsonb)']:
        m=read("select json_build_object('owner',pg_get_userbyid(proowner),'config',proconfig,'definer',prosecdef) from pg_proc where oid="+quote(signature)+'::regprocedure;')
        assert m['owner']=='zelo_of_workspace' and m['definer'] and 'row_security=on' in m['config']
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    assert sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);")=='0'
    # Editable series categories: persisted forecasts and positively linked ledger rows.
    for migration_name in ['20261012090000_bank_ledger_batch','20261015200000_bank_installment_anchors','20261017210000_bank_schedule_purchase_evidence']:
        sql((repo/('supabase/migrations/'+migration_name+'.sql')).read_text())
    protected=['public.zelo_of_report(uuid,text,date,date,uuid)','open_finance.report_page(uuid,text,date,date,uuid,integer)','public.zelo_of_installment_anchors(uuid,text)']
    def access_meta(signature):return read("select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid="+quote(signature)+'::regprocedure;')
    before_categories={signature:access_meta(signature) for signature in protected}
    sql((repo/'supabase/migrations/20261102210000_forecast_categories.sql').read_text())
    assert before_categories=={signature:access_meta(signature) for signature in protected},'Category migration changed existing access gates'
    consent={'id':str(uuid.uuid4()),'cliente_user_id':owner,'institution_id':'20000000-0000-4000-8000-000000000002','institution_name':'Fixture Card Bank','status':'AUTHORISED','products':['CREDIT_CARD_ACCOUNT']}
    card_connection=json.loads(invoke(owner,companies[owner],'business','zelo_of_save_consent',','+quote(json.dumps(consent))+'::jsonb'))['id']
    card=sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values("+','.join(map(quote,[card_connection,owner,'production','business','card','fixture-card','Fixture card','credit-cards']))+") returning id;")
    def schedule_commit(ids,key):
        lease=str(uuid.uuid4())
        job=sql("insert into open_finance.sync_jobs(connection_id,user_id,environment,mode,kind,family,external_resource_id,status,lease_token,lease_until) values("+','.join(map(quote,[card_connection,owner,'production','business','recurrings','credit-cards','fixture-card','running',lease]))+",now()+interval '1 minute') returning id;")
        rows={'schedules':[{'source_key':key*64,'kind':'recurring','description':'Fixture subscription','amount':'12','currency':'BRL','period_months':1,'expected_day':10,'due_date':'2026-11-10','regularity_score':1,'observed_transactions':ids}]}
        invoke(owner,companies[owner],'business','zelo_of_commit_page',','+quote(job)+','+quote(lease)+','+quote(json.dumps(rows))+"::jsonb,null,'[]'::jsonb")
    schedule_commit(['tx-1','tx-2','tx-3'],'a')
    series=sql('select id from open_finance.card_schedules where resource_id='+quote(card)+';')
    def set_category(user=owner,company=None,mode='business',category='Assinaturas',role='service_role'):
        return invoke(user,company or companies[user],mode,'zelo_of_set_schedule_category',','+quote(series)+','+('null' if category is None else quote(category)),role)
    assert set_category()=='t'
    for kwargs in [dict(user=other),dict(company=alternate),dict(mode='personal')]:assert set_category(**kwargs)=='f'
    for role in ['anon','authenticated']:rejected(lambda:set_category(role=role))
    for category in ['', ' ' ,'x'*101]:rejected(lambda:set_category(category=category))
    schedule_commit(['tx-2','tx-3','tx-4'],'b')
    assert sql('select id from open_finance.card_schedules where resource_id='+quote(card)+';')==series,'Refresh changed series identity'
    assert sql('select user_category from open_finance.card_schedules where id='+quote(series)+';')=='Assinaturas','Refresh erased chosen category'
    agenda=json.loads(invoke(owner,companies[owner],'business','zelo_of_agenda',",'2026-11-01','2026-11-30',true"))
    assert next(row for row in agenda['items'] if row['id']==series)['user_category']=='Assinaturas'
    movement_id=sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,transaction_date,amount,currency,direction,classification) values("+','.join(map(quote,[card,owner,'production','business','card','tx-2','Fixture subscription','2026-10-10','12','BRL','debit','purchase']))+") returning id;")
    def category_report():return value(owner,companies[owner],'zelo_of_ledger_report')['movements'][0]['user_category']
    assert category_report()=='Assinaturas','Linked bank charge lost the series category'
    invoke(owner,companies[owner],'business','zelo_of_set_movement_category',','+quote(movement_id)+",'Educação'")
    assert category_report()=='Educação','Series overrode a movement-specific choice'
    assert set_category(category=None)=='t'
    assert category_report()=='Educação','Reset erased the movement-specific choice'
    assert sql("select relforcerowsecurity from pg_class where oid='open_finance.card_schedules'::regclass;")=='t'
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    sql((repo/'supabase/rollback/20261102163000_credit_installment_plans.sql').read_text())
    assert sql("select manual_installment_plan->>'amount' from open_finance.credit_details where resource_id="+quote(resource)+';')=='890.10'
    assert sql("select jsonb_array_length(payment_history) from open_finance.credit_details where resource_id="+quote(resource)+';')=='1'
    assert sql("select to_regprocedure('public.zelo_of_credit_data(uuid,text,date,date)') is null;")=='t'
    print('PASS PostgreSQL: persisted plan; owner/company/mode isolation; no automatic posting; history/plan survive refresh; paid dates and closed contracts; stale/invalid lease rejected; ACL/RLS unchanged; editable series categories preserve isolation and survive refresh',flush=True)
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],capture_output=True,text=True)

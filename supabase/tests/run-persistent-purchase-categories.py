#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-category-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
env=dict(os.environ,PGHOST=str(socket),PGPORT='55449',PGUSER='ledger_fixture',PGDATABASE='postgres',PGPASSWORD='')
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
    subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-l',str(root/'fixture.log'),'-o',"-k "+str(socket)+" -p 55449 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
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
    sql((repo/'supabase/migrations/20261103103000_scheduled_bank_installments.sql').read_text())
    def fixture(user,company,mode):
        consent={'id':str(uuid.uuid4()),'cliente_user_id':user,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['CREDIT_CARD_ACCOUNT']}
        invoke(user,company,mode,'zelo_of_enable_brazil',",'BR',true")
        connection=json.loads(invoke(user,company,mode,'zelo_of_save_consent',','+quote(json.dumps(consent))+'::jsonb'))['id']
        resource=sql("insert into open_finance.resources(connection_id,user_id,environment,mode,resource_type,external_id,name,subtype) values("+','.join(map(quote,[connection,user,'production',mode,'card','fixture-card','Fixture Card','credit-cards']))+") returning id;")
        job=sql("insert into open_finance.sync_jobs(connection_id,user_id,environment,mode,kind,family,external_resource_id,status) values("+','.join(map(quote,[connection,user,'production',mode,'installments','credit-cards','fixture-card','complete']))+") returning id;")
        return connection,resource,job,user,mode
    primary=fixture(owner,companies[owner],'business')
    alternate_fixture=fixture(owner,alternate,'business');other_fixture=fixture(other,companies[other],'business');personal_fixture=fixture(owner,companies[owner],'personal')
    def purchase(context,key,positions=range(1,6),name='Fixture Shop',amount='47.41',total=6,day_offset=95):
        _,resource,job,user,mode=context
        ids=[]
        for position in positions:
            args=[resource,user,'production',mode,'card',key+'-'+str(position),name+' '+str(position)+'/'+str(total),amount if position==1 else str(float(amount)-.01),'BRL','debit','purchase']
            ids.append(sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,amount,currency,direction,classification,transaction_date,bill_month,installment_number,installment_count) values("+','.join(map(quote,args))+",current_date-"+str(day_offset)+",date_trunc('month',current_date)+("+str(position)+"-4)*interval '1 month',"+str(position)+","+str(total)+") returning id;"))
        return ids
    def pattern(context,key,external_ids,amount='47.41',name='Fixture Shop',total=6,kind='installment'):
        _,resource,job,user,mode=context
        return sql("insert into open_finance.card_schedules(id,resource_id,user_id,environment,mode,source_key,kind,description,amount,currency,total_installments,period_months,observed_transactions,last_job_id) values("+','.join(map(quote,[str(uuid.uuid4()),resource,user,'production',mode,__import__('hashlib').sha256(key.encode()).hexdigest(),kind,name,amount]))+",'BRL',"+(str(total) if kind=='installment' else 'null')+","+('null' if kind=='installment' else '1')+",array["+','.join(map(quote,external_ids))+"],"+quote(job)+") returning id;")
    ids=purchase(primary,'first')
    first=pattern(primary,'a',['first-1'])
    tail=pattern(primary,'b',['first-2','first-4','first-5'],amount='47.40')
    independent=purchase(primary,'independent',name='Fixture Shop',day_offset=94)
    protected=['public.zelo_of_set_schedule_category(uuid,text,uuid,text)','public.zelo_of_set_movement_category(uuid,text,uuid,text)','public.zelo_of_installment_anchors(uuid,text)','public.zelo_of_report(uuid,text,date,date,uuid)']
    def meta(signature):return read("select json_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid="+quote(signature)+'::regprocedure;')
    before={s:meta(s) for s in protected}
    sql((repo/'supabase/migrations/20261103120000_persistent_purchase_categories.sql').read_text())
    for name in ['20261103141000_bank_category_read_indexes','20261103142000_bank_category_read_performance']:
        sql((repo/('supabase/migrations/'+name+'.sql')).read_text())
    assert before=={s:meta(s) for s in protected},'Public reader/writer access changed'
    def set_schedule(target,category='Educação',user=owner,company=None,mode='business',role='service_role'):
        return invoke(user,company or companies[user],mode,'zelo_of_set_schedule_category',','+quote(target)+','+('null' if category is None else quote(category)),role)
    def set_movement(target,category='Saúde'):
        return invoke(owner,companies[owner],'business','zelo_of_set_movement_category',','+quote(target)+','+('null' if category is None else quote(category)))
    def category_values(targets):return read("select coalesce(jsonb_agg(user_category order by id),'[]'::jsonb) from open_finance.movements where id=any(array["+','.join(map(quote,targets))+"]::uuid[]);")
    assert set_schedule(first)=='t'
    assert category_values(ids)==['Educação']*len(ids),'Historical and future siblings were not updated together'
    assert category_values(independent)==[None]*len(independent),'Different purchase at same merchant changed'
    assert sql('select user_category from open_finance.card_schedules where id='+quote(tail)+';')=='Educação','Complementary provider fragment was not saved'
    added=purchase(primary,'first',positions=[6])[0]
    def future():return json.loads(invoke(owner,companies[owner],'business','zelo_of_installment_anchors'))
    assert next(row for row in future()['scheduled'] if row['id']==added)['user_category']=='Educação','New bank installment lost the saved category'
    replacement=pattern(primary,'c',['first-4','first-5','first-6'],amount='47.40')
    agenda=json.loads(invoke(owner,companies[owner],'business','zelo_of_agenda',",current_date-180,current_date+180,true"))
    assert next(row for row in agenda['items'] if row['id']==replacement)['user_category']=='Educação','Replacement pattern reset forecast category'
    assert set_movement(added)=='t'
    assert category_values(ids+[added])==['Saúde']*(len(ids)+1),'Editing a later installment did not update the earlier ones'
    assert set_movement(ids[0],None)=='t'
    assert category_values(ids+[added])==[None]*(len(ids)+1),'Reset was not applied to the purchase'
    assert next(row for row in future()['scheduled'] if row['id']==added)['user_category'] is None
    # Some banks use each installment's posting date instead of its purchase date.
    dated=purchase(primary,'dated',positions=[1,2,3],name='Fixture monthly posting vendor',amount='63.10',total=3,day_offset=100)
    sql("update open_finance.movements set transaction_date=transaction_date+(installment_number*30) where id=any(array["+','.join(map(quote,dated))+"]::uuid[]);")
    dated_pattern=pattern(primary,'f',['dated-1','dated-2','dated-3'],amount='63.10',name='Fixture monthly posting vendor',total=3)
    assert set_schedule(dated_pattern)=='t' and category_values(dated)==['Educação']*3,'Positive bank identities were lost when posting dates differed'
    # Same-day identical purchases stay separate when ordinals conflict.
    same_a=purchase(primary,'same-a',positions=[1,2],name='Same Fixture Store',amount='72.20',total=2,day_offset=30)
    same_b=purchase(primary,'same-b',positions=[1,2],name='Same Fixture Store',amount='72.20',total=2,day_offset=30)
    same_pattern=pattern(primary,'d',['same-a-1','same-a-2'],amount='72.20',name='Same Fixture Store',total=2)
    assert set_schedule(same_pattern)=='t'
    assert category_values(same_a)==['Educação']*2 and category_values(same_b)==[None]*2,'Ambiguous independent purchase was changed'
    # Recurring subscription, including older charges outside the provider window.
    subscription_ids=[]
    for n in range(1,6):
        args=[primary[1],owner,'production','business','card','subscription-'+str(n),'Fixture Cloud','12.90','BRL','debit','purchase']
        subscription_ids.append(sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,amount,currency,direction,classification,transaction_date) values("+','.join(map(quote,args))+",current_date-"+str(n*30)+") returning id;"))
    subscription=pattern(primary,'e',['subscription-1','subscription-2','subscription-3'],amount='12.90',name='Fixture Cloud',kind='recurring')
    assert set_schedule(subscription,'Assinaturas')=='t'
    assert category_values(subscription_ids)==['Assinaturas']*5,'Older known subscription charges retained the previous category'
    # A history dominated by one-off rows missed the expensive installment path.
    # Include many unrelated installment series on a card that also has overrides.
    for n in range(20):
        purchase(primary,'unrelated-series-'+str(n),positions=range(1,13),name='Unrelated fixture series '+str(n),amount=str(80+n),total=12,day_offset=200+n)
        pattern(primary,'unrelated-pattern-'+str(n),['unrelated-series-'+str(n)+'-'+str(k) for k in range(1,13)],amount=str(80+n),name='Unrelated fixture series '+str(n),total=12)
    import time
    started_installments=time.monotonic()
    installment_result=future()
    installment_seconds=time.monotonic()-started_installments
    assert len(installment_result['scheduled'])>=150
    assert installment_seconds<5,'Installment category resolution exceeded the page read budget'
    assert all(row.get('user_category') is None for row in installment_result['scheduled'] if row['description'].startswith('Unrelated fixture series'))
    print('Installment-heavy reader benchmark: '+str(round(installment_seconds,3))+' seconds',flush=True)
    # Production-sized reader sample: ordinary purchases must remain bounded and uncategorized.
    sql("insert into open_finance.movements(resource_id,user_id,environment,mode,resource_type,external_id,description,amount,currency,direction,classification,transaction_date) select "+','.join(map(quote,[primary[1],owner,'production','business','card']))+",'bulk-category-'||i,'Fixture unrelated purchase '||i,1,'BRL','debit','purchase',current_date-1 from generate_series(1,1500)i;")
    import time
    started_read=time.monotonic()
    report=json.loads(invoke(owner,companies[owner],'business','zelo_of_ledger_report',",current_date-180,current_date"))
    assert len(report['movements'])>=1500 and all(row.get('user_category') is None for row in report['movements'] if row['description'].startswith('Fixture unrelated purchase'))
    print('Reader benchmark: '+str(round(time.monotonic()-started_read,3))+' seconds for '+str(len(report['movements']))+' bank rows',flush=True)
    for kwargs in [dict(user=other),dict(company=alternate),dict(mode='personal')]:assert set_schedule(first,**kwargs)=='f'
    for role in ['anon','authenticated']:rejected(lambda:set_schedule(first,role=role))
    assert sql('select count(*) from finances;')=='0','Category edit created payment/finance rows'
    for signature in ['open_finance.category_purchase_movements(uuid,text,uuid)','open_finance.effective_schedule_category(uuid,text,uuid)']:
        for role in ['anon','authenticated','service_role']:assert sql("select has_function_privilege("+quote(role)+','+quote(signature)+",'execute');")=='f'
    assert sql("select has_schema_privilege('zelo_of_workspace','public','CREATE') or has_schema_privilege('zelo_of_workspace','open_finance','CREATE');")=='f'
    assert sql("select count(*) from pg_auth_members where roleid='zelo_of_workspace'::regrole and member=(select oid from pg_roles where rolname=current_user);")=='0'
    optimized_future=future()
    sql((repo/'supabase/rollback/20261103142000_bank_category_read_performance.sql').read_text())
    started_previous=time.monotonic()
    try:
        previous_future=json.loads(sql(scoped(owner,companies[owner],"set statement_timeout='5s';select public.zelo_of_installment_anchors("+quote(owner)+",'business');")).splitlines()[-1])
        assert previous_future==optimized_future,'Read optimization changed reported installments or categories'
        print('Previous installment-heavy reader: '+str(round(time.monotonic()-started_previous,3))+' seconds',flush=True)
    except RuntimeError as error:
        assert 'statement timeout' in str(error)
        print('Previous installment-heavy reader exceeded 5 seconds; optimized read completed in '+str(round(installment_seconds,3))+' seconds',flush=True)
    assert category_values(subscription_ids)==['Assinaturas']*5,'Performance rollback erased stored choices'
    sql((repo/'supabase/rollback/20261103120000_persistent_purchase_categories.sql').read_text())
    started_read=time.monotonic()
    json.loads(invoke(owner,companies[owner],'business','zelo_of_ledger_report',",current_date-180,current_date"))
    print('Previous reader benchmark: '+str(round(time.monotonic()-started_read,3))+' seconds',flush=True)
    assert before=={s:meta(s) for s in protected},'Rollback changed access gates'
    assert category_values(subscription_ids)==['Assinaturas']*5,'Rollback erased stored choices'
    print('PASS: purchase-wide categories across history/future; new imports and replacement patterns retain choice; reset; separate/ambiguous purchases; recurring history; scoped access and financial facts preserved')
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','stop'],capture_output=True,timeout=30)

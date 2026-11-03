#!/usr/bin/env python3
"""Disposable real PostgreSQL checks; fictitious records, Unix socket only."""
import argparse,json,os,pathlib,subprocess,tempfile
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2];binary=pathlib.Path(a.bin_dir)
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-registered-category-pg-',dir='/private/tmp'));data=root/'data';socket=root/'socket';socket.mkdir()
env=dict(os.environ,PGHOST=str(socket),PGPORT='55450',PGUSER='ledger_fixture',PGDATABASE='postgres',PGPASSWORD='')
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
    subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-l',str(root/'fixture.log'),'-o',"-k "+str(socket)+" -p 55450 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
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
    # Supabase installs these ordinary server table grants by default; the disposable cluster does not.
    sql('grant select,insert,update,delete on public.finances,public.recurring_transactions to service_role;')
    sql((repo/'supabase/migrations/20261103121000_registered_purchase_categories.sql').read_text())
    def literal(value):return 'null' if value is None else quote(value)
    def recurring(user=owner,company=None,mode='business',name='Fixture purchase · compra em 14/05/2026',kind='installment'):
        return sql("insert into recurring_transactions(user_id,company_id,type,amount,category,description,mode,recurrence_type,total_installments,paid_installments,repeat_unit,start_date,next_due_date,status,source) values("+','.join(map(literal,[user,(company or companies[user]) if mode=='business' else None,'expense','80.10','Outros',name,mode,kind]))+",6,2,'monthly','2026-05-14','2026-07-14','active','web') returning id;")
    series=recurring();other_series=recurring(name='Fixture purchase · compra em 15/05/2026')
    alternate_series=recurring(company=alternate);foreign_series=recurring(user=other)
    def finance(name,recurring_id=None,user=owner,company=None,mode='business'):
        cols=['user_id','company_id','type','amount','category','description','date','mode','source']
        vals=[user,(company or companies[user]) if mode=='business' else None,'expense','80.10','Outros',name,'2026-06-14',mode,'web']
        if recurring_id:cols+=['recurring_id'];vals+=[recurring_id]
        return sql('insert into finances('+','.join(cols)+') values('+','.join(map(literal,vals))+') returning id;')
    first=finance('Fixture purchase · compra em 14/05/2026 (1/6)')
    second=finance('Fixture purchase · compra em 14/05/2026 · Parcela 2/6 · restantes 4')
    unrelated=finance('Fixture purchase · compra em 15/05/2026 (1/6)',other_series)
    def categories(ids):return read("select jsonb_agg(category order by id) from finances where id=any(array["+','.join(map(quote,ids))+"]::uuid[]);")
    sql("update recurring_transactions set category='Educação',category_override='Educação' where id="+quote(series)+';')
    assert categories([first,second])==['Educação','Educação'],'Earlier registered installments retained old categories'
    assert categories([unrelated])==['Outros'],'Independent purchase at same merchant was modified'
    assert sql('select count(*) from finances where recurring_id='+quote(series)+';')=='2','Unique historical purchase did not acquire positive links'
    new_payment=finance('Fixture purchase · compra em 14/05/2026 (3/6)',series)
    assert categories([new_payment])==['Educação'],'Future payment used the stale submitted category'
    imported_payment=finance('Fixture purchase · Parcela 4/6 · restantes 2 · compra em 14/05/2026')
    assert categories([imported_payment])==['Educação'],'Later invoice import lost the saved purchase category'
    sql("update finances set category='Saúde' where id="+quote(first)+';')
    assert categories([first,second,new_payment])==['Saúde']*3,'Editing a paid installment did not update siblings'
    assert sql('select category from recurring_transactions where id='+quote(series)+';')=='Saúde','Future series category did not follow paid installment'
    sql("update recurring_transactions set category='Outros',amount=80.11 where id="+quote(series)+';')
    assert sql('select category from recurring_transactions where id='+quote(series)+';')=='Saúde','Invoice refresh erased the explicit category'
    assert categories([first,second,new_payment])==['Saúde']*3
    for target in [foreign_series,alternate_series]:rejected(lambda:finance('Invalid fixture purchase',target))
    # Editing a legacy paid installment also locates its unique registered series.
    legacy=recurring(name='Fixture separate product · compra em 18/05/2026')
    legacy_first=finance('Fixture separate product · compra em 18/05/2026 (1/6)')
    legacy_second=finance('Fixture separate product · compra em 18/05/2026 (2/6)')
    sql("update finances set category='Tecnologia' where id="+quote(legacy_first)+';')
    assert categories([legacy_first,legacy_second])==['Tecnologia']*2
    assert sql('select category_override from recurring_transactions where id='+quote(legacy)+';')=='Tecnologia'
    renamed=recurring(name='Fixture original chair · compra em 19/05/2026')
    renamed_payment=finance('Fixture original chair · Parcela 1/6 · restantes 5 · compra em 19/05/2026')
    sql("update recurring_transactions set description='Fixture renamed chair · compra em 19/05/2026',amount=90,category='Educação',category_override='Educação' where id="+quote(renamed)+';')
    assert categories([renamed_payment])==['Educação'],'Editing description/amount lost the historical identity'
    assert float(sql('select amount from finances where id='+quote(renamed_payment)+';'))==80.10,'Category propagation rewrote the paid amount'
    # Ambiguous old records remain unlinked rather than changing another purchase.
    ambiguous_a=recurring(name='Fixture ambiguous product');ambiguous_b=recurring(name='Fixture ambiguous product')
    ambiguous_payment=finance('Fixture ambiguous product (1/6)')
    sql("update recurring_transactions set category='Educação',category_override='Educação' where id="+quote(ambiguous_a)+';')
    assert categories([ambiguous_payment])==['Outros']
    assert sql('select recurring_id is null from finances where id='+quote(ambiguous_payment)+';')=='t'
    personal=recurring(mode='personal',name='Fixture personal service')
    personal_payment=finance('Fixture personal service (1/6)',personal,mode='personal')
    sql(scoped(owner,companies[owner],"update finances set category='Educação' where id="+quote(personal_payment)+';'))
    assert categories([personal_payment])==['Educação']
    assert categories([first,second,new_payment])==['Saúde']*3,'Personal edit crossed into the company'
    sql(scoped(owner,companies[owner],"update finances set category='Educação' where id="+quote(first)+';'))
    assert categories([first,second,new_payment])==['Educação']*3,'Server role could not propagate categories'
    # Trigger functions cannot be called directly by public clients.
    for name in ['zelo_registered_purchase_guard','zelo_registered_category_override','zelo_registered_category_history','zelo_registered_finance_category']:
        for role in ['anon','authenticated','service_role']:assert sql("select has_function_privilege("+quote(role)+",'public."+name+"()','execute');")=='f'
    before=sql('select count(*) from finances;')
    sql((repo/'supabase/rollback/20261103121000_registered_purchase_categories.sql').read_text())
    assert sql('select count(*) from finances;')==before and categories([first,second,new_payment])==['Educação']*3
    print('PASS: registered purchase history and future; edit from paid installment; explicit category survives invoice refresh; stale payment category rejected; owner/company guard; ambiguous legacy purchase isolated; rollback preserves choices')
finally:
    if started:subprocess.run([str(binary/'pg_ctl'),'-D',str(data),'-m','immediate','stop'],capture_output=True,timeout=30)

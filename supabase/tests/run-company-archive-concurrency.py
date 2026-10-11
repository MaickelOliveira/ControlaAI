#!/usr/bin/env python3
"""Disposable real-PostgreSQL archive concurrency checks. No external services.
Usage: python3 supabase/tests/run-company-archive-concurrency.py --bin-dir /path/to/postgres/bin
Reads current migrations; creates and stops its own Unix-socket-only cluster.
"""
import argparse, json, os, pathlib, queue, shutil, subprocess, tempfile, threading, time, uuid
p=argparse.ArgumentParser();p.add_argument('--bin-dir',required=True);p.add_argument('--repo',default=str(pathlib.Path(__file__).resolve().parents[2]));args=p.parse_args()
bin=pathlib.Path(args.bin_dir);repo=pathlib.Path(args.repo)
for name in ['postgres','initdb','pg_ctl','psql']:
    if not (bin/name).exists():p.error('Missing executable: '+str(bin/name))
root=pathlib.Path(tempfile.mkdtemp(prefix='zelo-archive-pg-',dir='/private/tmp'));data=root/'data';sock=root/'socket';sock.mkdir()
env=dict(os.environ,PGHOST=str(sock),PGPORT='55439',PGUSER='archive_fixture',PGDATABASE='postgres',PGPASSWORD='')
base=[str(bin/'psql'),'-X','-qAt'];sessions=[];started=False

def once(sql):
    r=subprocess.run(base+['-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,env=env,timeout=40)
    if r.returncode:raise RuntimeError(r.stderr)
    return r.stdout.strip()

class Session:
    def __init__(self,name):
        self.name=name;self.q=queue.Queue();self.proc=subprocess.Popen(base+['-v','ON_ERROR_STOP=0'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env)
        threading.Thread(target=self.reader,daemon=True).start();sessions.append(self)
        self.query("set application_name='"+name+"'; set statement_timeout='12s'; set deadlock_timeout='200ms';")
    def reader(self):
        for line in self.proc.stdout:self.q.put(line.rstrip())
    def start(self,sql):
        self.marker='DONE_'+uuid.uuid4().hex;self.proc.stdin.write(sql+'\n\\echo '+self.marker+'\n');self.proc.stdin.flush()
    def finish(self,timeout=15):
        result=[];end=time.monotonic()+timeout
        while True:
            line=self.q.get(timeout=max(.01,end-time.monotonic()))
            if line==self.marker:return '\n'.join(result)
            result.append(line)
    def query(self,sql):self.start(sql);return self.finish()
    def close(self):
        if self.proc.poll() is None:
            self.proc.stdin.write('rollback;\n\\q\n');self.proc.stdin.flush()
            try:self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:self.proc.kill();self.proc.wait()

def success(output):
    assert 'ERROR:' not in output,output

def rejected(output):
    assert 'ERROR:' in output and 'deadlock detected' not in output and 'statement timeout' not in output,output

def blocked(name):
    until=time.monotonic()+5
    while time.monotonic()<until:
        if once("select count(*) from pg_stat_activity where application_name='"+name+"' and wait_event_type='Lock'")=='1':return
        time.sleep(.04)
    raise AssertionError('Session never waited for lock: '+name)

def fixture(n):
    owner='00000000-0000-4000-8000-'+str(n).zfill(12)
    once("insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at,active_mode) values('"+owner+"','5511000000000','Fixture','fixture"+str(n)+"@example.test','x','business','active',now()+interval '7 days','business');")
    company=once("select id from companies where user_id='"+owner+"' and is_default;")
    once("set role service_role; select zelo_of_enable_brazil('"+owner+"','business','BR',true);")
    return owner,company

def scope(session,owner,company):
    headers=json.dumps({'x-zelo-owner':owner,'x-zelo-company':company})
    success(session.query("set role service_role; select set_config('request.headers','"+headers+"',false);"))

def save(owner,n):
    consent={'id':'10000000-0000-4000-8000-'+str(n).zfill(12),'cliente_user_id':owner,'institution_id':'20000000-0000-4000-8000-000000000001','institution_name':'Fixture Bank','status':'AUTHORISED','products':['ACCOUNT']}
    return "select zelo_of_save_consent('"+owner+"','business','"+json.dumps(consent)+"'::jsonb);"

def archive(owner,company):return "select zelo_archive_company('"+owner+"','"+company+"','Empresa principal');"

try:
    subprocess.run([str(bin/'initdb'),'-D',str(data),'-U','archive_fixture','--auth=trust','--no-locale'],check=True,capture_output=True,text=True)
    subprocess.run([str(bin/'pg_ctl'),'-D',str(data),'-l',str(root/'postgres.log'),'-o',"-k "+str(sock)+" -p 55439 -c listen_addresses=''",'-w','start'],check=True,capture_output=True,text=True);started=True
    bootstrap="create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);\n"
    bootstrap+=(repo/'supabase/schema.sql').read_text().replace('create extension if not exists "pgcrypto";','')
    files=['20261009193000_open_finance_storage','20261009213000_open_finance_server_access','20261009220000_open_finance_consents','20261009230000_open_finance_sync_queue','20261009234000_open_finance_report','20261010185000_open_finance_categories','20261010230000_open_finance_public','20261011030000_open_finance_notifications','20261011090000_open_finance_connection_management','20261011093000_open_finance_subscription_retirement','20261011110000_open_finance_archive_history','20261011160000_companies','20261011170000_open_finance_companies','20261012000000_bank_identity','20261011210000_nfse_preparation','20261012010000_company_archive']
    for f in files:bootstrap+='\n'+(repo/('supabase/migrations/'+f+'.sql')).read_text()
    once(bootstrap)

    # Archive is uncommitted when consent INSERT starts. NOWAIT should reject;
    # a blocking lock is also safe if it rechecks after the archive commits.
    o,c=fixture(101);a=Session('archive_first');b=Session('consent_second');scope(a,o,c);scope(b,o,c)
    success(a.query('begin;'+archive(o,c)));b.start(save(o,101));time.sleep(.15)
    success(a.query('commit;'));rejected(b.finish())
    assert once("select count(*) from open_finance.connections where user_id='"+o+"' and status not in ('revoking','revoked')")=='0'
    print('PASS archive-first consent is rejected; no live orphan',flush=True)

    # Consent commits first; archive must wait and see it in retirement sweep.
    o,c=fixture(102);a=Session('consent_first');b=Session('archive_second');scope(a,o,c);scope(b,o,c)
    success(a.query('begin;'+save(o,102)));b.start(archive(o,c));blocked(b.name);success(a.query('commit;'));success(b.finish())
    assert once("select status from open_finance.connections where user_id='"+o+"'")=='revoking'
    print('PASS consent-first archive waits and retires connection',flush=True)

    # Actual RPC already takes connection FOR UPDATE before UPDATE trigger.
    # Hold it explicitly to force connection -> owner vs owner -> connection.
    o,c=fixture(103);a=Session('connection_first');b=Session('archive_waiting');scope(a,o,c);scope(b,o,c)
    success(a.query(save(o,103)));conn=once("select id from open_finance.connections where user_id='"+o+"'")
    success(a.query("begin;reset role;select id from open_finance.connections where id='"+conn+"' for update;set role service_role;"))
    b.start(archive(o,c));blocked(b.name)
    t=time.monotonic();out=a.query("select zelo_of_set_status('"+o+"','business','"+conn+"','active','AUTHORISED');")
    rejected(out);assert time.monotonic()-t<3,out;success(a.query('rollback;'));success(b.finish())
    assert once("select status from open_finance.connections where id='"+conn+"'")=='revoking'
    print('PASS connection-first update fails promptly; archive completes without deadlock',flush=True)

    # The existing default-company derivation runs before the archive guard.
    d=Session('derived_scope');out=d.query("insert into finances(user_id,mode,type,amount,category,description,date) values('"+o+"','business','expense',1,'Outros','Fixture',current_date);")
    rejected(out);assert 'COMPANY_ARCHIVED' in out,out
    print('PASS inherited archived company rejects write',flush=True)
    print('PASS all local PostgreSQL concurrency checks',flush=True)
finally:
    for s in sessions:s.close()
    if started:subprocess.run([str(bin/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],capture_output=True,text=True)
    print('Fixture directory: '+str(root))

import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();
try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 await db.exec((await readFile(new URL('../schema.sql',import.meta.url),'utf8')).replace('create extension if not exists "pgcrypto";',''));
 await db.exec('grant all on all tables in schema public to anon,authenticated,service_role;grant all on all sequences in schema public to anon,authenticated,service_role;grant execute on function public.check_rate_limit(text,integer,bigint) to public;');
 const migration=await readFile(new URL('../migrations/20261012073000_legacy_server_only_access.sql',import.meta.url),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});if(migration&&!process.argv.includes('--baseline'))await db.exec(migration);
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query('select * from public.users'),/permission denied/);
  await assert.rejects(db.query('select * from public.admin_config'),/permission denied/);
  await assert.rejects(db.query('select * from public.whatsapp_config'),/permission denied/);
  await assert.rejects(db.query('select * from public.google_tokens'),/permission denied/);
  await assert.rejects(db.query("select public.check_rate_limit('fake',10,1000)"),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 assert.equal((await db.query("select public.check_rate_limit('fake',1,60000) v")).rows[0].v,true);
 assert.equal((await db.query("select public.check_rate_limit('fake',1,60000) v")).rows[0].v,false);
 assert.equal((await db.query('select count(*)::int n from public.users')).rows[0].n,0);
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows[0].n,0);
 // Future internal tables created by the migration owner no longer inherit API grants.
 await db.exec('create table public.future_fixture(id int)');
 assert.equal((await db.query("select has_table_privilege('anon','public.future_fixture','SELECT,INSERT,UPDATE,DELETE') v")).rows[0].v,false);
 console.log('PASS: anonymous/authenticated denied; existing server reads and limiter preserved; tables protected; future grants denied');
}finally{await db.close();}

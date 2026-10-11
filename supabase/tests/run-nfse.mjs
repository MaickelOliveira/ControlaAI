import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw Error('Supply installed PGlite module path. Local in-memory test only.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href), db = new PGlite();
const sql = path => readFile(new URL(path, import.meta.url), 'utf8');
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002';
try {
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
 await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";', ''));
 await db.query("insert into users(id,phone,name,email,password_hash,plan,status,company,trial_ends_at)values($1,'5511988881111','Owner A','a@test.com','x','business','active','Mesmo nome',now()+interval '7 days'),($2,'5511988882222','Owner B','b@test.com','x','business','active','Mesmo nome',now()+interval '7 days')", [a,b]);
 await db.exec(await sql('../migrations/20261011160000_companies.sql'));
 await db.exec(await sql('../migrations/20261011210000_nfse_preparation.sql'));
 const ca = (await db.query('select id from companies where user_id=$1', [a])).rows[0].id;
 const cb = (await db.query('select id from companies where user_id=$1', [b])).rows[0].id;
 const c2 = (await db.query("insert into companies(user_id,name)values($1,'Mesmo nome')returning id", [a])).rows[0].id;
 await db.query("insert into nfse_profiles(company_id,user_id,profile,certificate_encrypted)values($1,$2,'{}','enc:fixture-a'),($3,$4,'{}','enc:fixture-b')", [ca,a,cb,b]);
 await assert.rejects(db.query("insert into nfse_profiles(company_id,user_id,profile)values($1,$2,'{}')", [c2,b]), /foreign key/);
 await assert.rejects(db.query('update nfse_profiles set user_id=$1,company_id=$2 where company_id=$3', [b,cb,ca]), /NFSE_REASSIGNMENT_DENIED/);
 await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({'x-zelo-owner':a,'x-zelo-company':ca})]);
 await assert.rejects(db.query("insert into nfse_services(user_id,company_id,service)values($1,$2,'{}')", [a,c2]), /NFSE_COMPANY_MISMATCH/);
 await assert.rejects(db.query("insert into nfse_services(user_id,company_id,service)values($1,$2,'{}')", [b,cb]), /NFSE_OWNER_MISMATCH/);
 await db.query("insert into nfse_services(user_id,company_id,service)values($1,$2,'{}')", [a,ca]);
 await db.query("insert into nfse_drafts(user_id,company_id,draft,review_hash,source,requested_by)values($1,$2,'{}',$3,'web',$4)", [a,ca,'a'.repeat(64),a]);
 await db.query("select set_config('request.headers',$1,false)", [JSON.stringify({'x-zelo-owner':a,'x-zelo-company':ca,'x-zelo-business-access':'false'})]);
 await assert.rejects(db.query("insert into nfse_services(user_id,company_id,service)values($1,$2,'{}')", [a,ca]), /NFSE_ACCESS_DENIED/);
 await db.query("select set_config('request.headers','{}',false)");
 assert.equal((await db.query('select count(*)::int count from nfse_drafts where user_id=$1 and company_id=$2',[a,c2])).rows[0].count,0);
 for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  for (const table of ['nfse_profiles','nfse_services','nfse_drafts']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/);
  await db.exec('reset role');
 }
 console.log('NFS-e: composite ownership, immutable workspace, cross-company write protection, denied personal access, empty new company and denied browser access passed.');
} catch (error) { console.error(error.message, error.where ?? ""); process.exitCode = 1; } finally { await db.close(); }

import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

if(!process.argv[2])throw Error('Supply installed PGlite module path. Local in-memory test only.');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
const sql=path=>readFile(new URL(path,import.meta.url),'utf8');
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
const missing='90000000-0000-4000-8000-000000000099';
const row=async(query,args=[])=>(await db.query(query,args)).rows[0];
const day=value=>value instanceof Date?value.toISOString().slice(0,10):value;
const finance={mode:'personal',source:'web',registeredBy:'Titular de teste'};
const item={productName:'Arroz',category:'Alimentos',price:10,quantity:2,unit:'kg',priceEstimated:false};
const save=async(user,purchase,store,date,items,total,metadata=finance)=>(await row(
  'select public.save_grocery_purchase($1::uuid,$2::uuid,$3::uuid,$4::date,$5::jsonb,$6::numeric,$7::jsonb) id',
  [user,purchase,store,date,JSON.stringify(items),total,JSON.stringify(metadata)])).id;
const remove=async(user,purchase)=>(await row('select public.delete_grocery_purchase($1::uuid,$2::uuid) removed',[user,purchase])).removed;
// A rejected operation must not leave either half of the grocery/finance write behind.
const snapshot=async(preexistingColumnsOnly=false)=>JSON.stringify((await db.query(`select
  (select coalesce(jsonb_agg(${preexistingColumnsOnly?"to_jsonb(p)-'mode'-'company_id'-'operation_key'":"to_jsonb(p)"} order by p.id),'[]') from grocery_purchases p) purchases,
  (select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from grocery_purchase_items i) items,
  (select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]') from finances f) finances,
  (select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from grocery_products p) products,
  (select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from grocery_shopping_list_items s) shopping_list`)).rows);
async function rejectsWithoutChanges(operation,label){
  const before=await snapshot();
  await assert.rejects(operation,undefined,label);
  assert.equal(await snapshot(),before,label+' must roll back every write');
}
async function assertGone(purchase,financeId){
  assert.equal((await row('select count(*)::int n from grocery_purchases where id=$1',[purchase])).n,0);
  assert.equal((await row('select count(*)::int n from grocery_purchase_items where purchase_id=$1',[purchase])).n,0);
  assert.equal((await row('select count(*)::int n from finances where id=$1',[financeId])).n,0);
}

try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  await db.exec((await sql('../schema.sql')).replace('create extension if not exists "pgcrypto";',''));
  await db.exec(await sql('../migrations/20261011160000_companies.sql'));
  await db.query(`insert into users(id,phone,name,email,password_hash,plan,status,trial_ends_at) values
    ($1,'5511999900001','Owner A','a@grocery.test','test','business','active',now()+interval '7 days'),
    ($2,'5511999900002','Owner B','b@grocery.test','test','business','active',now()+interval '7 days')`,[a,b]);
  const storeA=(await row("insert into grocery_stores(user_id,name) values($1,'Mercado A') returning id",[a])).id;
  const storeB=(await row("insert into grocery_stores(user_id,name) values($1,'Mercado B') returning id",[b])).id;
  const productA=(await row("insert into grocery_products(user_id,name,normalized_name) values($1,'Arroz','arroz') returning id",[a])).id;
  const productB=(await row("insert into grocery_products(user_id,name,normalized_name) values($1,'Produto privado','produto privado') returning id",[b])).id;
  const accountA=(await row("insert into accounts(user_id,mode,name,type) values($1,'personal','Cartão A','credit_card') returning id",[a])).id;
  const accountB=(await row("insert into accounts(user_id,mode,name,type) values($1,'personal','Cartão B','credit_card') returning id",[b])).id;
  const businessAccount=(await row("insert into accounts(user_id,mode,name,type) values($1,'business','Empresa A','bank') returning id",[a])).id;
  const defaultCompany=(await row('select company_id from accounts where id=$1',[businessAccount])).company_id;
  const secondCompany=(await row("insert into companies(user_id,name) values($1,'Segunda empresa A') returning id",[a])).id;
  const secondCompanyAccount=(await row("insert into accounts(user_id,company_id,mode,name,type) values($1,$2,'business','Conta da segunda empresa','bank') returning id",[a,secondCompany])).id;
  const foreignCompany=(await row('select id from companies where user_id=$1 and is_default',[b])).id;
  const invoiceA=(await row("insert into card_invoices(account_id,period_start,period_end,due_date) values($1,'2026-10-01','2026-10-31','2026-11-10') returning id",[accountA])).id;
  const invoiceB=(await row("insert into card_invoices(account_id,period_start,period_end,due_date) values($1,'2026-10-01','2026-10-31','2026-11-10') returning id",[accountB])).id;
  const legacy=(await row("insert into grocery_purchases(user_id,store_id,date,total,source) values($1,$2,'2026-10-01',11,'whatsapp_receipt') returning id",[a,storeA])).id;
  await db.query("insert into grocery_purchase_items(purchase_id,product_name,price,quantity) values($1,'Compra antiga',11,1)",[legacy]);
  const beforeMigration=await snapshot(true);
  try{await db.exec(await sql('../migrations/20261011230000_grocery_management.sql'));}
  catch(error){
    if(error.code!=='ENOENT')throw error;
    console.error('RED: proposed grocery migration is absent; exercising the missing RPC contract against the existing schema.');
  }
  assert.equal(await snapshot(true),beforeMigration,'migration must preserve every preexisting purchase/item/finance field');
  const legacyWorkspace=await row('select mode,company_id from grocery_purchases where id=$1',[legacy]);
  assert.equal(legacyWorkspace.mode,'personal');assert.equal(legacyWorkspace.company_id,null,'unlinked legacy purchase stays personal');
  // Simulate the existing trusted server role without granting browser table access.
  await db.exec('grant usage on schema public to service_role;grant select,insert,update,delete on all tables in schema public to service_role;set role service_role;');

  // A receipt discount is authoritative: 2 x 10 in items, 18 actually paid.
  const purchase=await save(a,null,storeA,'2026-10-11',[{...item,productId:productA}],18,{...finance,accountId:accountA,cardInvoiceId:invoiceA});
  assert.match(purchase,/^[0-9a-f-]{36}$/i);
  let p=await row('select * from grocery_purchases where id=$1',[purchase]);
  const linked=p.finance_id;
  assert.ok(linked,'every new purchase gets a linked finance');
  assert.equal(p.user_id,a);assert.equal(p.store_id,storeA);assert.equal(Number(p.total),18);
  let f=await row('select * from finances where id=$1',[linked]);
  assert.equal(f.user_id,a);assert.equal(f.type,'expense');assert.equal(Number(f.amount),18);
  assert.equal(day(f.date),'2026-10-11');assert.equal(f.mode,'personal');assert.equal(f.source,'web');
  assert.equal(f.registered_by,finance.registeredBy);assert.equal(f.account_id,accountA);assert.equal(f.card_invoice_id,invoiceA);

  for(const role of ['anon','authenticated']){
    await db.exec('reset role;set role '+role);
    await assert.rejects(()=>save(a,null,storeA,'2026-10-11',[item],10),/permission denied/);
    await assert.rejects(()=>remove(a,purchase),/permission denied/);
  }
  await db.exec('reset role;set role service_role;');

  const edited=await save(a,purchase,storeA,'2026-10-12',[
    {...item,productId:productA,price:6,quantity:1,priceEstimated:true},
    {...item,productName:'Feijão',price:7,quantity:2,unit:'un'}
  ],19,{...finance,accountId:accountA,cardInvoiceId:invoiceA});
  assert.equal(edited,purchase,'editing retains the purchase ID');
  p=await row('select * from grocery_purchases where id=$1',[purchase]);
  assert.equal(p.finance_id,linked,'editing reuses the one linked finance');
  assert.equal(day(p.date),'2026-10-12');assert.equal(Number(p.total),19);
  f=await row('select * from finances where id=$1',[linked]);
  assert.equal(Number(f.amount),19);assert.equal(day(f.date),'2026-10-12');
  assert.equal((await row('select count(*)::int n from finances where user_id=$1',[a])).n,1);
  const items=(await db.query('select * from grocery_purchase_items where purchase_id=$1 order by product_name',[purchase])).rows;
  assert.equal(items.length,2,'editing replaces the old item list');
  assert.equal(items[0].product_name,'Arroz');assert.equal(items[0].product_id,productA);
  assert.equal(Number(items[0].price),6);assert.equal(Number(items[0].quantity),1);assert.equal(items[0].price_estimated,true);

  for(const [label,operation] of [
    ['foreign store',()=>save(a,null,storeB,'2026-10-11',[item],10)],
    ['foreign product',()=>save(a,null,storeA,'2026-10-11',[{...item,productId:productB}],10)],
    ['foreign purchase',()=>save(b,purchase,storeB,'2026-10-11',[item],10)],
    ['missing purchase',()=>save(a,missing,storeA,'2026-10-11',[item],10)],
    ['foreign account',()=>save(a,null,storeA,'2026-10-11',[item],10,{...finance,accountId:accountB})],
    ['foreign invoice',()=>save(a,null,storeA,'2026-10-11',[item],10,{...finance,accountId:accountA,cardInvoiceId:invoiceB})],
    ['other platform account',()=>save(a,null,storeA,'2026-10-11',[item],10,{...finance,accountId:businessAccount})],
    ['invalid item after valid item on create',()=>save(a,null,storeA,'2026-10-11',[item,{...item,quantity:0}],10)],
    ['invalid item after valid item on edit',()=>save(a,purchase,storeA,'2026-10-13',[item,{...item,quantity:0}],35)],
    ['zero total',()=>save(a,null,storeA,'2026-10-11',[item],0)],
    ['negative total',()=>save(a,null,storeA,'2026-10-11',[item],-1)],
    ['change purchase owner directly',()=>db.query('update grocery_purchases set user_id=$1 where id=$2',[b,purchase])],
    ['unlink finance directly',()=>db.query('update grocery_purchases set finance_id=null where id=$1',[purchase])],
    ['zero linked finance amount',()=>db.query('update finances set amount=0 where id=$1',[linked])],
    ['negative linked finance amount',()=>db.query('update finances set amount=-1 where id=$1',[linked])],
    ['change linked finance owner',()=>db.query('update finances set user_id=$1 where id=$2',[b,linked])],
    ['change linked finance platform',()=>db.query("update finances set mode='business' where id=$1",[linked])],
    ['change linked finance type',()=>db.query("update finances set type='income' where id=$1",[linked])]
  ])await rejectsWithoutChanges(operation,label);
  const unchanged=await snapshot();
  try{assert.equal(await remove(b,purchase),false,'foreign deletion may return false or reject');}catch(error){if(error instanceof assert.AssertionError)throw error;}
  assert.equal(await snapshot(),unchanged,'foreign deletion preserves all data');

  await db.query("update finances set description='Descrição corrigida',category='Alimentação' where id=$1",[linked]);
  f=await row('select * from finances where id=$1',[linked]);
  assert.equal(f.description,'Descrição corrigida');assert.equal(f.category,'Alimentação');
  assert.equal(Number(f.amount),19);assert.equal(day(f.date),'2026-10-12');

  // Finance edits change the amount actually paid, never the receipt item prices.
  const receiptBefore=JSON.stringify((await db.query('select * from grocery_purchase_items where purchase_id=$1 order by id',[purchase])).rows);
  await db.query('update finances set amount=23.75 where id=$1',[linked]);
  p=await row('select * from grocery_purchases where id=$1',[purchase]);
  assert.equal(p.id,purchase);assert.equal(p.finance_id,linked);
  assert.equal(Number(p.total),23.75,'Finance amount edit updates purchase total');
  assert.equal(day(p.date),'2026-10-12','amount edit preserves purchase date');
  await db.query("update finances set date='2026-10-15' where id=$1",[linked]);
  p=await row('select * from grocery_purchases where id=$1',[purchase]);
  assert.equal(p.id,purchase);assert.equal(p.finance_id,linked);
  assert.equal(Number(p.total),23.75);assert.equal(day(p.date),'2026-10-15','Finance date edit updates purchase date');
  f=await row('select * from finances where id=$1',[linked]);
  assert.equal(Number(f.amount),23.75);assert.equal(day(f.date),'2026-10-15');
  assert.equal((await row('select count(*)::int n from finances where user_id=$1',[a])).n,1,'Finance edits do not duplicate the expense');
  assert.equal(JSON.stringify((await db.query('select * from grocery_purchase_items where purchase_id=$1 order by id',[purchase])).rows),receiptBefore,'Finance edits preserve item IDs, prices, quantities and all receipt fields');

  // Old purchases remain untouched until explicitly edited; no migration backfill.
  assert.equal((await row('select finance_id from grocery_purchases where id=$1',[legacy])).finance_id,null);
  assert.equal(await save(a,legacy,storeA,'2026-10-14',[item],17,{...finance,source:'whatsapp'}),legacy);
  const legacyFinance=(await row('select finance_id from grocery_purchases where id=$1',[legacy])).finance_id;
  assert.ok(legacyFinance);assert.notEqual(legacyFinance,linked);
  assert.equal((await row('select source from finances where id=$1',[legacyFinance])).source,'whatsapp');
  await rejectsWithoutChanges(()=>db.query('update grocery_purchases set finance_id=$1 where id=$2',[legacyFinance,purchase]),'replace finance link directly');

  const companyPurchase=await save(a,null,storeA,'2026-10-14',[item],20,{...finance,mode:'business',source:'whatsapp',accountId:businessAccount});
  const companyFinance=(await row('select finance_id from grocery_purchases where id=$1',[companyPurchase])).finance_id;
  f=await row('select * from finances where id=$1',[companyFinance]);
  assert.equal(f.mode,'business');assert.equal(f.source,'whatsapp');
  assert.equal(f.company_id,defaultCompany,'business without explicit company retains the legacy default');
  p=await row('select mode,company_id from grocery_purchases where id=$1',[companyPurchase]);
  assert.equal(p.mode,'business');assert.equal(p.company_id,defaultCompany);

  const secondMetadata={...finance,mode:'business',companyId:secondCompany,accountId:secondCompanyAccount};
  const secondPurchase=await save(a,null,storeA,'2026-10-15',[item],21,secondMetadata);
  p=await row('select * from grocery_purchases where id=$1',[secondPurchase]);
  const secondFinance=p.finance_id;
  assert.equal(p.mode,'business');assert.equal(p.company_id,secondCompany);
  f=await row('select * from finances where id=$1',[secondFinance]);
  assert.equal(f.company_id,secondCompany);assert.equal(f.account_id,secondCompanyAccount);
  assert.equal(await save(a,secondPurchase,storeA,'2026-10-16',[{...item,quantity:3}],27,secondMetadata),secondPurchase);
  p=await row('select * from grocery_purchases where id=$1',[secondPurchase]);
  assert.equal(p.finance_id,secondFinance);assert.equal(p.company_id,secondCompany);assert.equal(Number(p.total),27);
  assert.equal(Number((await row('select amount from finances where id=$1',[secondFinance])).amount),27);
  for(const [label,operation] of [
    ['move purchase into another own company',()=>save(a,secondPurchase,storeA,'2026-10-17',[item],30,{...finance,mode:'business',companyId:defaultCompany})],
    ['omit company when editing a second-company purchase',()=>save(a,secondPurchase,storeA,'2026-10-17',[item],30,{...finance,mode:'business'})],
    ['move purchase into personal mode',()=>save(a,secondPurchase,storeA,'2026-10-17',[item],30,finance)],
    ['create in a foreign company',()=>save(a,null,storeA,'2026-10-17',[item],30,{...finance,mode:'business',companyId:foreignCompany})],
    ['account belongs to another own company',()=>save(a,null,storeA,'2026-10-17',[item],30,{...secondMetadata,accountId:businessAccount})],
    ['change purchase company directly',()=>db.query('update grocery_purchases set company_id=$1 where id=$2',[defaultCompany,secondPurchase])],
    ['change linked finance company directly',()=>db.query('update finances set company_id=$1 where id=$2',[defaultCompany,secondFinance])]
  ])await rejectsWithoutChanges(operation,label);

  assert.equal(await remove(a,purchase),true);
  await assertGone(purchase,linked);
  assert.equal(await remove(a,purchase),false,'repeated removal is harmless');
  assert.ok(await row('select id from grocery_purchases where id=$1',[legacy]),'unrelated purchases remain');
  await db.query('delete from finances where id=$1',[legacyFinance]);
  await assertGone(legacy,legacyFinance);
  assert.equal(await remove(a,companyPurchase),true);await assertGone(companyPurchase,companyFinance);
  assert.ok(await row('select id from grocery_purchases where id=$1',[secondPurchase]),'deleting one company purchase preserves the other workspace');
  assert.equal(await remove(a,secondPurchase),true);await assertGone(secondPurchase,secondFinance);
  assert.equal((await row('select count(*)::int n from grocery_products')).n>=2,true,'purchase removal preserves the product catalog');

  // Keep these independent so RED reports each missing behavior, not just the first.
  const failures=[];
  async function scenario(label,run){try{await run();}catch(error){failures.push(label+': '+error.message);}}
  await scenario('retrying one operation does not duplicate its expense or receipt',async()=>{
    const metadata={...finance,operationKey:'70000000-0000-4000-8000-000000000001'};
    const first=await save(a,null,storeA,'2026-10-18',[item],18,metadata);
    const committed=await snapshot();
    const retried=await save(a,null,storeA,'2026-10-18',[item],18,metadata);
    assert.equal(retried,first,'same owner and operation key must return the original purchase UUID');
    assert.equal(await snapshot(),committed,'retry must not recreate items, finances or purchases');
    const otherOwner=await save(b,null,storeB,'2026-10-18',[item],18,metadata);
    assert.notEqual(otherOwner,first,'operation keys never return another owner’s purchase');
    assert.equal((await row('select user_id from grocery_purchases where id=$1',[otherOwner])).user_id,b);
  });
  await scenario('checkout consumes only selected checked shopping-list items atomically',async()=>{
    const selected=(await row("insert into grocery_shopping_list_items(user_id,name,checked) values($1,'Selecionado',true) returning id",[a])).id;
    const otherChecked=(await row("insert into grocery_shopping_list_items(user_id,name,checked) values($1,'Marcado mas não enviado',true) returning id",[a])).id;
    const unchecked=(await row("insert into grocery_shopping_list_items(user_id,name,checked) values($1,'Não marcado',false) returning id",[a])).id;
    const foreign=(await row("insert into grocery_shopping_list_items(user_id,name,checked) values($1,'Lista alheia',true) returning id",[b])).id;
    const metadata={...finance,checkedIds:[selected],operationKey:'70000000-0000-4000-8000-000000000002'};
    await rejectsWithoutChanges(()=>save(a,null,storeA,'2026-10-18',[item,{...item,quantity:0}],18,metadata),'failed checkout retains checked items');
    const first=await save(a,null,storeA,'2026-10-18',[item],18,metadata);
    assert.equal((await row('select count(*)::int n from grocery_shopping_list_items where id=$1',[selected])).n,0,'selected checked row is consumed in the save transaction');
    for(const retained of [otherChecked,unchecked,foreign])assert.ok(await row('select id from grocery_shopping_list_items where id=$1',[retained]),'unselected and foreign rows remain');
    const committed=await snapshot();
    assert.equal(await save(a,null,storeA,'2026-10-18',[item],18,metadata),first,'retry succeeds even though its checked IDs were already consumed');
    assert.equal(await snapshot(),committed);
  });
  await scenario('a positive total that rounds to zero is rejected',async()=>{
    await rejectsWithoutChanges(()=>save(a,null,storeA,'2026-10-18',[item],0.001),'rounded zero total');
  });
  assert.deepEqual(failures,[],'new grocery idempotency/consumption/rounding contract');
  console.log('Grocery management: atomic create/edit/delete, discount totals, one linked finance, legacy editing, owner/platform isolation, direct finance consistency, history and service-only RPCs passed.');
}catch(error){console.error(error.message,error.where??'');process.exitCode=1;}finally{await db.close();}

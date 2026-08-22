import test from 'node:test';
import assert from 'node:assert/strict';

const requests=[];
globalThis.sessionStorage={data:new Map(),getItem(k){return this.data.get(k)||null},setItem(k,v){this.data.set(k,v)}};
globalThis.location={pathname:'/balikan-store'};
globalThis.window={currentUser:{name:'Lily',role:'PIC Inventory',isDeveloper:false}};
globalThis.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));return {ok:true,status:201}};
const logger=await import('../assets/js/activity-log.js');

test('struktur konsisten dan informasi sensitif dibuang',()=>{
  const row=logger.normalizeActivity({action:'CREATE',module:'Barang Masuk',description:'Tambah data',details:{sku:'GN-1',password:'rahasia',nested:{token:'x',qty:10}}});
  for(const key of ['id','timestamp','user','role','isDeveloper','sessionId','action','category','module','page','description','entityType','entityId','details','result','source']) assert.ok(key in row,key);
  assert.equal(row.details.password,undefined);assert.equal(row.details.nested.token,undefined);assert.equal(row.details.nested.qty,10);
});
test('update membentuk deskripsi manusiawi dan changes',async()=>{
  await logger.logUpdate({module:'Balikan Store',entityType:'SKU',entityId:'GN-210047',changes:[{field:'LOKASI',oldValue:'AREA HOLD',newValue:'RUANG TR 2'}],source:'INLINE_EDIT'});
  await logger.flushActivityQueue();const row=requests.at(-1);assert.match(row.description,/GN-210047.*AREA HOLD.*RUANG TR 2/);assert.equal(row.details.changes.length,1);assert.equal(row.source,'INLINE_EDIT');
});
test('page view tidak mengandung credential dan memakai detail route',async()=>{await logger.logPageView({from:'/dashboard',to:'/balikan-store',module:'Navigasi'});await logger.flushActivityQueue();assert.deepEqual(requests.at(-1).details,{from:'/dashboard',to:'/balikan-store'});});
test('activity id sama tidak diantrikan dua kali',async()=>{const id='same-id';await Promise.all([logger.logActivity({id,action:'REFRESH',module:'Test'}),logger.logActivity({id,action:'REFRESH',module:'Test'})]);await logger.flushActivityQueue();assert.equal(requests.filter(x=>x.id===id).length,1);});

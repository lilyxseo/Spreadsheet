import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWarningReport,normalizeLocation,validateLocation} from '../assets/js/warning-engine.js';

test('normalizes URI, unicode dashes, spaces, case, and zero-width characters',()=>{
  assert.equal(normalizeLocation(' cc%20%E2%80%93%204%20%E2%80%93%201%20%E2%80%93%20b\u200b '),'CC-4-1-B');
  assert.equal(normalizeLocation('A01 - 2'),'A01-2');
});

test('retail, bulky, and special locations follow strict warehouse rules',()=>{
  for(const value of ['AA-1-3-H','BB-1-2-G','HH-7-3-A','A01-2','H20-5','AREA OUTBOUND','REJECT'])assert.equal(validateLocation(value).valid,true,value);
  assert.equal(validateLocation('BB-1-2-H').code,'INVALID_RETAIL_POSITION');
  assert.equal(validateLocation('BB-1-2-H').suggestion,'BB-1-2-G');
  assert.equal(validateLocation('AB-1-2-A').code,'INVALID_RETAIL_ZONE');
  assert.equal(validateLocation('AA-8-2-A').code,'INVALID_RETAIL_ROW');
  assert.equal(validateLocation('AA-1-4-A').code,'INVALID_RETAIL_LEVEL');
  assert.equal(validateLocation('A21-2').code,'INVALID_BULKY_RACK');
  assert.equal(validateLocation('A21-2').suggestion,'A20-2');
  assert.equal(validateLocation('A1-2').code,'INVALID_BULKY_RACK');
  assert.equal(validateLocation('A01-6').code,'INVALID_BULKY_LEVEL');
  assert.equal(validateLocation('').code,'EMPTY_LOCATION');
});

test('dependency chain emits only primary row warning and indexes valid SKU locations',async()=>{
  const data={
    'Kartu Stock':[{sku:'SKU1','Nama Barang':'Produk Benar',lokasi:'BB-1-2-G',pengeluaran:5}],
    RPL:[],BULKY:[],
    'Barang Masuk':[{sku:'SKU1','Nama Barang':'Nama Salah Total',to:'BB-1-2-H',qty:'#VALUE!'}],
    'Barang Keluar':[{sku:'SKU1','Nama Barang':'Produk Benar',from:'BB-1-2-G',qty:5,tanggal:'2026-08-25'}]
  };
  const warnings=await buildWarningReport(data,{yieldFn:async()=>{}});
  assert.equal(warnings.filter(x=>x.source==='Barang Masuk').length,1);
  assert.equal(warnings.find(x=>x.source==='Barang Masuk').rule,'INVALID_RETAIL_POSITION');
  assert.equal(warnings.some(x=>x.rule==='OUTBOUND_NOT_BALANCED'),false);
});

test('detects unreadable qty, duplicates, and aggregate imbalance',async()=>{
  const base={sku:'S1','Nama Barang':'Barang Satu',from:'AA-1-1-A',tanggal:'2026-08-25',to:'AREA OUTBOUND','No iSeller':'I1',Netsuite:'N1'};
  const data={'Kartu Stock':[{sku:'S1','Nama Barang':'Barang Satu',lokasi:'AA-1-1-A',pengeluaran:1}],RPL:[],BULKY:[],'Barang Masuk':[{sku:'S1','Nama Barang':'Barang Satu',to:'AA-1-1-A',qty:'10 pcs'}],'Barang Keluar':[{...base,qty:3},{...base,qty:3}]};
  const rules=(await buildWarningReport(data,{yieldFn:async()=>{}})).map(x=>x.rule);
  assert.ok(rules.includes('UNREADABLE_INPUT'));
  assert.ok(rules.includes('DUPLICATE_TRANSACTION'));
  assert.ok(rules.includes('OUTBOUND_NOT_BALANCED'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWarnings, strictNumber } from '../assets/js/warning-engine.js';
const kartu=[
 {SKU:'A1','Nama Barang':'GOTO STRIKE FOOTBALL BLUE',Lokasi:'RUANG TR 2',PENGELUARAN:10,'Stok Akhir':5},
 {SKU:'B1','Nama Barang':'BALL',Lokasi:'CC-4-1-G',PENGELUARAN:0,'Stok Akhir':50},
];
test('deteksi inti, balance, format, lokasi, duplikat dan stok minus',async()=>{
 const keluar=[
  {SKU:'A1','Nama Barang':'goto strike football blue',FROM:'RUANG TR 2',QTY:15,STATUS:'Final','No iSeller':'X',Tanggal:'2026-01-01'},
  {SKU:'A1','Nama Barang':'GOTO KICKER FOOTBALL RED',FROM:'RUANG%20TR%202',QTY:'10 pcs',STATUS:'Final'},
  {SKU:'B1','Nama Barang':'BALL',FROM:'CC-4-1-6',QTY:1,STATUS:'Final'},
  {SKU:'B1','Nama Barang':'BALL',FROM:'CC-4-1-G',TO:'STORE',QTY:2,STATUS:'Final','No iSeller':'DUP',Tanggal:'2026-01-02'},
  {SKU:'B1','Nama Barang':'BALL',FROM:'CC-4-1-G',TO:'STORE',QTY:2,STATUS:'Final','No iSeller':'DUP',Tanggal:'2026-01-02'},
 ];
 const {rows}=await analyzeWarnings({kartu,keluar,fresh:true});
 assert(rows.some(r=>r.type==='name'&&r.sku==='A1'));
 assert(!rows.some(r=>r.type==='name'&&/goto strike/i.test(r.nama)));
 assert(rows.some(r=>r.type==='location'&&r.location==='RUANG%20TR%202'));
 assert(rows.some(r=>r.type==='location'&&r.suggestion.includes('CC-4-1-G')));
 assert(rows.some(r=>r.type==='balance'&&r.sku==='A1'&&r.difference===-5));
 assert(rows.some(r=>r.type==='input'&&r.issue.includes('angka')));
 assert(rows.some(r=>r.type==='duplicate'));
 assert(rows.some(r=>r.type==='stock-minus'&&r.sku==='A1'&&r.severity==='Critical'));
});
test('parser angka ketat dan sync global mencegah warning operasional',async()=>{
 assert.equal(strictNumber('10 pcs'),null); assert.equal(strictNumber('1,000'),1000); assert.equal(strictNumber("'10"),null);
 const {rows}=await analyzeWarnings({kartu,keluar:[{SKU:'A1',FROM:'RUANG TR 2',QTY:12,STATUS:'Final'}],fresh:false});
 assert.equal(rows.filter(r=>r.type==='sync').length,1);
 assert(!rows.some(r=>['balance','stock-minus','duplicate'].includes(r.type)));
});

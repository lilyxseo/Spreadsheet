export function createCycleCountModule({ getData, toast }) {
  const KEY = 'cycle_count_sessions_v1';
  const AUTO_KEY = 'cycle_count_autosave_v1';
  const state = { step:1, sessions:[], current:null, q:'', filters:{ lokasi:'all', kategori:'all', status:'all' }, selected:new Set(), view:'all' };
  const el = {};
  const steps = ['Setup','Pilih SKU','Input Aktual','Review','Hasil'];

  const today = () => new Date().toISOString().slice(0,10);
  const num = (v)=> Number(v)||0;
  const esc = (s)=>String(s??'').replace(/[&<>'"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const save = ()=> localStorage.setItem(KEY, JSON.stringify(state.sessions));
  const load = ()=> { try{ state.sessions = JSON.parse(localStorage.getItem(KEY)||'[]'); }catch{ state.sessions=[]; } };

  const getSkuRows = ()=> {
    const data = getData() || {};
    const rows = [...(data['RPL']||[]), ...(data['BULKY']||[])];
    return rows.map(r=>({
      sku: String(r.SKU||r.sku||'').trim(),
      nama: String(r['Nama Barang']||r['nama barang']||r.nama||'-'),
      lokasi: String(r.Lokasi||r.lokasi||'-'),
      kategori: String(r.Kategori||r.kategori||'-'),
      stokSistem: num(r['Stok Global']||r['stok global']||r['Kartu Stock']||r['kartu stock']||0),
      anomaly: /anomaly/i.test(String(r.Status||r.status||''))
    })).filter(r=>r.sku);
  };

  function createCycleSession(payload){
    const s = { id: crypto.randomUUID(), status:'draft', finalizedAt:'', ...payload, skus:[] };
    state.sessions.unshift(s); state.current=s; save(); return s;
  }
  function addSkuToSession(items){
    if(!state.current) return;
    const seen = new Set(state.current.skus.map(s=>s.sku));
    items.forEach(it=>{ if(!it.sku||seen.has(it.sku)) return; state.current.skus.push({ ...it, qtyAktual:0, selisih:0, statusHitung:'Cocok', catatan:'' }); seen.add(it.sku); });
    persistAutosave(); save();
  }
  function removeSkuFromSession(sku){ if(!state.current) return; state.current.skus = state.current.skus.filter(x=>x.sku!==sku); persistAutosave(); save(); }
  function calculateDifference(row){ const d = num(row.qtyAktual)-num(row.stokSistem); row.selisih=d; row.statusHitung=d===0?'Cocok':(d>0?'Plus':'Minus'); return row; }
  function updateActualQty(sku,val){ const row=state.current?.skus.find(r=>r.sku===sku); if(!row) return; row.qtyAktual=num(val); calculateDifference(row); persistAutosave(); }
  function getCycleSummary(){ const rows=state.current?.skus||[]; const total=rows.length; const cocok=rows.filter(r=>r.statusHitung==='Cocok').length; const plus=rows.filter(r=>r.statusHitung==='Plus').length; const minus=rows.filter(r=>r.statusHitung==='Minus').length; const totalSel=rows.reduce((a,b)=>a+num(b.selisih),0); const ak=total?((cocok/total)*100):0; return {total,cocok,plus,minus,totalSel,akurasi:ak}; }
  function finalizeSession(){ if(!state.current) return; state.current.status='selesai'; state.current.finalizedAt=new Date().toISOString(); save(); toast('Session difinalisasi'); render(); }
  function exportCycleCsv(){ if(!state.current) return; const h=['SKU','Nama','Lokasi','Stok Sistem','Qty Aktual','Selisih','Status','Catatan']; const rows=(state.current.skus||[]).map(r=>[r.sku,r.nama,r.lokasi,r.stokSistem,r.qtyAktual,r.selisih,r.statusHitung,r.catatan]); const csv=[h,...rows].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'); const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`cycle-count-${state.current.namaSesi||'session'}.csv`; a.click(); URL.revokeObjectURL(a.href); }

  function persistAutosave(){ localStorage.setItem(AUTO_KEY, JSON.stringify({id:state.current?.id, skus:state.current?.skus||[]})); }
  function restoreAutosave(){ try{ const a=JSON.parse(localStorage.getItem(AUTO_KEY)||'{}'); if(a.id===state.current?.id&&Array.isArray(a.skus)){ state.current.skus=a.skus.map(calculateDifference);} }catch{} }

  function mount(){
    el.root = document.getElementById('cycleCountApp');
    if(!el.root) return;
    load();
    if(!state.current && state.sessions[0]) state.current = state.sessions[0];
    render();
  }

  function render(){ if(!el.root) return; const s=state.current; el.root.innerHTML = `
    <div class='cc-wrap'>
      <div class='cc-stepper'>${steps.map((x,i)=>`<button class='cc-step ${state.step===i+1?'active':''}' data-step='${i+1}'>${i+1}. ${x}</button>`).join('')}</div>
      <div class='card cc-card'>${renderSessionList()}${!s?renderSetup():renderStep()}</div>
    </div>`;
    bind();
  }
  function renderSessionList(){ return `<div class='cc-session-head'><h4>List Session</h4><div class='row'>${state.sessions.slice(0,8).map(s=>`<button class='btn-ghost' data-open='${s.id}'>${esc(s.namaSesi)} • ${s.status}</button>`).join('')}<button class='btn-ghost' data-new='1'>+ Baru</button></div></div>`; }
  function renderSetup(){ const d=today(); return `<div class='cc-grid'><input id='ccNama' placeholder='Nama Sesi'/><input id='ccTanggal' type='date' value='${d}'/><input id='ccPic' placeholder='PIC'/><input id='ccLokasi' list='ccLokasiList' placeholder='Lokasi (opsional)'/><datalist id='ccLokasiList'>${[...new Set(getSkuRows().map(r=>r.lokasi))].slice(0,120).map(v=>`<option value='${esc(v)}'>`).join('')}</datalist><textarea id='ccCatatan' placeholder='Catatan'></textarea><button class='btn-primary' data-create='1'>Simpan Draft</button></div>`; }
  function renderStep(){ if(state.step===1) return `<div class='state'>Session aktif: <b>${esc(state.current.namaSesi)}</b></div>`; if(state.step===2) return renderPick(); if(state.step===3) return renderInput(); if(state.step===4) return renderReview(); return renderResult(); }
  function renderPick(){ const q=state.q.toLowerCase(); const rows=getSkuRows().filter(r=>(`${r.sku} ${r.nama}`.toLowerCase().includes(q))).slice(0,120); return `<div class='cc-grid'><input id='ccSearch' placeholder='Search SKU / Nama (debounce 250ms)' value='${esc(state.q)}'/><div class='row'><button class='btn-ghost' data-quick='minus'>Ambil stok minus</button><button class='btn-ghost' data-quick='anomaly'>Ambil anomaly</button><button class='btn-ghost' data-quick='manual'>Tambah manual</button></div><div class='table-wrap table-wrap-full'><table><thead><tr><th></th><th>SKU</th><th>Nama</th><th>Lokasi</th><th>Stok Sistem</th></tr></thead><tbody>${rows.map(r=>`<tr><td><input type='checkbox' data-pick='${esc(r.sku)}' ${state.selected.has(r.sku)?'checked':''}></td><td>${highlight(r.sku,state.q)}</td><td>${highlight(r.nama,state.q)}</td><td>${esc(r.lokasi)}</td><td>${r.stokSistem}</td></tr>`).join('')}</tbody></table></div><div class='row'><button class='btn-primary' data-add-selected='1'>Tambah SKU terpilih</button></div></div>`; }
  function renderInput(){ const rows=(state.current.skus||[]).slice(0,200); return `<div class='table-wrap table-wrap-full'><table><thead><tr><th>SKU</th><th>Nama</th><th>Lokasi</th><th>Sistem</th><th>Qty Aktual</th><th>Selisih</th><th>Status</th><th>Catatan</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr class='cc-row-${r.statusHitung.toLowerCase()}'><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${esc(r.lokasi)}</td><td>${r.stokSistem}</td><td><input data-qty='${esc(r.sku)}' data-i='${i}' value='${num(r.qtyAktual)}' class='cc-qty'></td><td>${r.selisih}</td><td>${r.statusHitung}</td><td><input data-note='${esc(r.sku)}' value='${esc(r.catatan||'')}'></td><td><button data-del='${esc(r.sku)}'>x</button></td></tr>`).join('')}</tbody></table></div>`; }
  function renderReview(){ const s=getCycleSummary(); return `<div class='summary-grid'><div class='summary-card'><div class='k'>Total SKU</div><div class='v'>${s.total}</div></div><div class='summary-card'><div class='k'>Cocok</div><div class='v'>${s.cocok}</div></div><div class='summary-card'><div class='k'>Tidak Cocok</div><div class='v'>${s.plus+s.minus}</div></div><div class='summary-card'><div class='k'>Akurasi</div><div class='v'>${s.akurasi.toFixed(1)}%</div></div></div>`; }
  function renderResult(){ const s=getCycleSummary(); const rows=(state.current.skus||[]).filter(r=> state.view==='all' || (state.view==='cocok'?r.statusHitung==='Cocok':r.statusHitung!=='Cocok')); return `<div class='row'><button class='btn-ghost' data-view='all'>Semua</button><button class='btn-ghost' data-view='cocok'>Cocok</button><button class='btn-ghost' data-view='selisih'>Selisih</button><button class='btn-primary' data-final='1'>Finalisasi</button><button class='btn-ghost' data-export='1'>Export CSV</button></div><p>${s.akurasi.toFixed(0)}% SKU sudah sesuai • ${s.plus+s.minus} SKU memiliki selisih.</p><div class='table-wrap'><table><thead><tr><th>SKU</th><th>Nama</th><th>Selisih</th><th>Status</th></tr></thead><tbody>${rows.slice(0,300).map(r=>`<tr><td>${esc(r.sku)}</td><td>${esc(r.nama)}</td><td>${r.selisih}</td><td>${r.statusHitung}</td></tr>`).join('')}</tbody></table></div>`; }
  const highlight=(txt,q)=> !q?esc(txt):esc(txt).replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'ig'),'<mark>$1</mark>');
  function bind(){
    el.root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{state.step=Number(b.dataset.step); if(state.step===3) restoreAutosave(); render();});
    el.root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{state.current=state.sessions.find(s=>s.id===b.dataset.open); render();});
    el.root.querySelector('[data-new]')?.addEventListener('click',()=>{state.current=null; state.step=1; render();});
    el.root.querySelector('[data-create]')?.addEventListener('click',()=>{const payload={namaSesi:el.root.querySelector('#ccNama')?.value||'Session',tanggal:el.root.querySelector('#ccTanggal')?.value||today(),pic:el.root.querySelector('#ccPic')?.value||'-',lokasi:el.root.querySelector('#ccLokasi')?.value||'',catatan:el.root.querySelector('#ccCatatan')?.value||''}; createCycleSession(payload); toast('Draft tersimpan'); render();});
    const sIn=el.root.querySelector('#ccSearch'); if(sIn){ let t; sIn.oninput=(e)=>{clearTimeout(t); t=setTimeout(()=>{state.q=e.target.value; render();},250);} }
    el.root.querySelectorAll('[data-pick]').forEach(c=>c.onchange=()=> c.checked?state.selected.add(c.dataset.pick):state.selected.delete(c.dataset.pick));
    el.root.querySelector('[data-add-selected]')?.addEventListener('click',()=>{const pool=getSkuRows(); addSkuToSession(pool.filter(p=>state.selected.has(p.sku))); toast('SKU ditambahkan');});
    el.root.querySelectorAll('[data-quick]').forEach(b=>b.onclick=()=>{const pool=getSkuRows(); if(b.dataset.quick==='minus') addSkuToSession(pool.filter(p=>p.stokSistem<0)); else if(b.dataset.quick==='anomaly') addSkuToSession(pool.filter(p=>p.anomaly)); else { const sku=prompt('SKU manual'); if(!sku) return; const hit=pool.find(p=>p.sku===sku); if(hit) addSkuToSession([hit]); } render();});
    el.root.querySelectorAll('[data-qty]').forEach(inp=>inp.onkeydown=(e)=>{if(e.key==='Enter'){const i=Number(inp.dataset.i||0); const nxt=el.root.querySelector(`[data-i='${i+1}']`); nxt?.focus();}});
    el.root.querySelectorAll('[data-qty]').forEach(inp=>inp.oninput=()=>updateActualQty(inp.dataset.qty,inp.value));
    el.root.querySelectorAll('[data-note]').forEach(inp=>inp.oninput=()=>{const r=state.current?.skus.find(x=>x.sku===inp.dataset.note); if(r) r.catatan=inp.value; persistAutosave();});
    el.root.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{removeSkuFromSession(b.dataset.del); render();});
    el.root.querySelector('[data-final]')?.addEventListener('click',finalizeSession);
    el.root.querySelector('[data-export]')?.addEventListener('click',exportCycleCsv);
    el.root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view; render();});
  }

  return { mount, createCycleSession, addSkuToSession, removeSkuFromSession, updateActualQty, calculateDifference, getCycleSummary, finalizeSession, exportCycleCsv };
}

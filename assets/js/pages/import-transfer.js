export function setupImportTransferPage({toast}){
  const state={header:{},rows:[],errors:[],fileName:'',target:'Barang Masuk'};
  const headerKeys=['Nomor Transfer','Dari','Kepada','Tanggal Dibuat','Nomor Referensi','Status Transfer'];
  async function parsePdf(file){
    if(!window.pdfjsLib){
      await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.js';
    }
    const data=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data}).promise;
    let text='';
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();text+='\n'+c.items.map(x=>x.str).join(' ');} // all pages
    return text;
  }
  function extract(text){
    const out={};
    headerKeys.forEach(k=>{const m=text.match(new RegExp(`${k}\\s*[:：]?\\s*([^\\n]+)`,'i'));out[k]=m?m[1].trim():'';});
    const rows=[];
    const lineRegex=/(\d+)\s+(.+?)\s+([A-Za-z0-9._-]{4,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*(.*)/g;
    let m;
    while((m=lineRegex.exec(text))){rows.push({no:m[1],nama:m[2].trim(),sku:m[3],jumlah:m[4],diterima:m[5],batal:m[6],tolak:m[7],catatan:m[8]?.trim()||''});}
    return {header:out,rows};
  }
  function validate(rows){return rows.flatMap((r,i)=>[!String(r.sku||'').trim()?`Baris ${i+1}: SKU kosong`:null,!String(r.jumlah||'').trim()?`Baris ${i+1}: Qty kosong`:null].filter(Boolean));}
  function render(){
    const root=document.getElementById('importTransferApp'); if(!root)return;
    const totalSku=new Set(state.rows.map(r=>String(r.sku||'').trim()).filter(Boolean)).size;
    const totalQty=state.rows.reduce((n,r)=>n+(Number(r.jumlah)||0),0);
    root.innerHTML=`<div class='card'><div class='section-header'><h3 class='page-title'>Import PDF Transfer</h3></div>
    <div class='mv-filters open'><input id='itFile' type='file' accept='application/pdf'><select id='itTarget'><option ${state.target==='Barang Masuk'?'selected':''}>Barang Masuk</option><option ${state.target==='Barang Keluar'?'selected':''}>Barang Keluar</option></select>
    <button class='btn-primary' id='itPreview'>Preview Data</button><button class='btn-primary' id='itImport'>Import ke Sheet</button><button class='btn-ghost' id='itReset'>Reset</button><button class='btn-ghost' id='itDownload'>Download CSV</button></div>
    <div class='subtitle'>File: ${state.fileName||'-'} | Total SKU: ${totalSku} | Total Qty: ${totalQty}</div>
    <div class='subtitle'>${state.errors.length?`Validasi: ${state.errors.join(' | ')}`:'Validasi: OK'}</div>
    <div class='table-wrap table-wrap-full'><table><thead><tr><th>No</th><th>Nama Produk</th><th>SKU</th><th>Jumlah</th><th>Diterima</th><th>Batal</th><th>Tolak</th><th>Catatan</th></tr></thead><tbody>${state.rows.map((r,i)=>`<tr>${['no','nama','sku','jumlah','diterima','batal','tolak','catatan'].map(k=>`<td><input data-row='${i}' data-key='${k}' value="${String(r[k]??'').replaceAll('"','&quot;')}"/></td>`).join('')}</tr>`).join('')||"<tr><td colspan='8'><div class='state'>Belum ada data</div></td></tr>"}</tbody></table></div></div>`;
  }
  document.addEventListener('click',async e=>{
    if(!e.target.closest('#page-import-transfer'))return;
    if(e.target.id==='itPreview'){
      const f=document.getElementById('itFile')?.files?.[0]; if(!f)return toast?.('Pilih PDF dulu','error');
      state.fileName=f.name; const text=await parsePdf(f); const ex=extract(text); state.header=ex.header; state.rows=ex.rows; state.errors=validate(state.rows); render();
    }
    if(e.target.id==='itReset'){state.header={};state.rows=[];state.errors=[];state.fileName='';render();}
    if(e.target.id==='itDownload'){const cols=['No','Nama Produk','SKU','Jumlah','Diterima','Batal','Tolak','Catatan'];const lines=[cols.join(','),...state.rows.map(r=>[r.no,r.nama,r.sku,r.jumlah,r.diterima,r.batal,r.tolak,r.catatan].map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))];const blob=new Blob([lines.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='import-transfer.csv';a.click();URL.revokeObjectURL(a.href);}    
    if(e.target.id==='itImport'){
      state.target=document.getElementById('itTarget')?.value||'Barang Masuk';
      state.errors=validate(state.rows); if(state.errors.length)return toast?.('Perbaiki validasi dulu','error');
      const res=await fetch('/api/import-transfer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({targetSheet:state.target,header:state.header,rows:state.rows})});
      const out=await res.json(); if(!res.ok||!out?.success)return toast?.(out?.message||'Import gagal','error');
      toast?.(`Import berhasil ${out.imported} baris`,'success');
    }
  });
  document.addEventListener('input',e=>{const inp=e.target.closest('#page-import-transfer input[data-row]');if(!inp)return;const i=Number(inp.dataset.row),k=inp.dataset.key;if(!state.rows[i])return;state.rows[i][k]=inp.value;state.errors=validate(state.rows);});
  render();
}

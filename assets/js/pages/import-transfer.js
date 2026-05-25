let importTransferState = null;
let importTransferBound = false;
let pdfLibPromise = null;

function createDefaultState() {
  return { header: {}, rows: [], errors: [], fileName: '', target: 'Barang Masuk' };
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-import-transfer='${src}']`);
    if (existing) {
      if (existing.dataset.loaded === '1') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Gagal memuat ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.importTransfer = src;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`Gagal memuat ${src}`));
    document.head.appendChild(s);
  });
}

async function ensurePdfJsLoaded() {
  if (window.pdfjsLib) return;
  if (!pdfLibPromise) {
    pdfLibPromise = (async () => {
      const errors = [];
      const cdnCandidates = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.min.js',
        'https://unpkg.com/pdfjs-dist@4.5.136/build/pdf.min.mjs'
      ];
      for (const src of cdnCandidates) {
        try {
          if (src.endsWith('.mjs')) {
            await import(src);
            if (window.pdfjsLib) break;
          } else {
            await loadScript(src);
            if (window.pdfjsLib) break;
          }
        } catch (err) {
          errors.push(err?.message || String(err));
        }
      }
      if (!window.pdfjsLib) throw new Error(`PDF parser tidak tersedia. ${errors.join(' | ')}`);
    })().catch((err) => {
      pdfLibPromise = null;
      throw err;
    });
  }
  await pdfLibPromise;
}

async function parsePdf(file) {
  await ensurePdfJsLoaded();
  const data = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += `\n${content.items.map((x) => x.str).join(' ')}`;
  }
  return text;
}

function extract(text, headerKeys) {
  const header = {};
  headerKeys.forEach((k) => {
    const m = text.match(new RegExp(`${k}\\s*[:：]?\\s*([^\\n]+)`, 'i'));
    header[k] = m ? m[1].trim() : '';
  });
  const rows = [];
  const lineRegex = /(\d+)\s+(.+?)\s+([A-Za-z0-9._-]{4,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*(.*)/g;
  let m;
  while ((m = lineRegex.exec(text))) {
    rows.push({ no: m[1], nama: m[2].trim(), sku: m[3], jumlah: m[4], diterima: m[5], batal: m[6], tolak: m[7], catatan: m[8]?.trim() || '' });
  }
  return { header, rows };
}

function validate(rows) {
  return rows.flatMap((r, i) => [
    !String(r.sku || '').trim() ? `Baris ${i + 1}: SKU kosong` : null,
    !String(r.jumlah || '').trim() ? `Baris ${i + 1}: Qty kosong` : null
  ].filter(Boolean));
}

function render() {
  const state = importTransferState;
  const root = document.getElementById('importTransferApp');
  if (!root || !state) return;
  const totalSku = new Set(state.rows.map((r) => String(r.sku || '').trim()).filter(Boolean)).size;
  const totalQty = state.rows.reduce((n, r) => n + (Number(r.jumlah) || 0), 0);
  root.innerHTML = `<div class='card'><div class='section-header'><h3 class='page-title'>Import PDF Transfer</h3></div>
  <div class='mv-filters open'><input id='itFile' type='file' accept='application/pdf'><select id='itTarget'><option ${state.target === 'Barang Masuk' ? 'selected' : ''}>Barang Masuk</option><option ${state.target === 'Barang Keluar' ? 'selected' : ''}>Barang Keluar</option></select>
  <button class='btn-primary' id='itPreview'>Preview Data</button><button class='btn-primary' id='itImport'>Import ke Sheet</button><button class='btn-ghost' id='itReset'>Reset</button><button class='btn-ghost' id='itDownload'>Download CSV</button></div>
  <div class='subtitle'>File: ${state.fileName || '-'} | Total SKU: ${totalSku} | Total Qty: ${totalQty}</div>
  <div class='subtitle'>${state.errors.length ? `Validasi: ${state.errors.join(' | ')}` : 'Validasi: OK'}</div>
  <div class='table-wrap table-wrap-full'><table><thead><tr><th>No</th><th>Nama Produk</th><th>SKU</th><th>Jumlah</th><th>Diterima</th><th>Batal</th><th>Tolak</th><th>Catatan</th></tr></thead><tbody>${state.rows.map((r, i) => `<tr>${['no', 'nama', 'sku', 'jumlah', 'diterima', 'batal', 'tolak', 'catatan'].map((k) => `<td><input data-row='${i}' data-key='${k}' value="${String(r[k] ?? '').replaceAll('"', '&quot;')}"/></td>`).join('')}</tr>`).join('') || "<tr><td colspan='8'><div class='state'>Belum ada data</div></td></tr>"}</tbody></table></div></div>`;
}

export function setupImportTransferPage({ toast }) {
  if (!importTransferState) importTransferState = createDefaultState();
  const state = importTransferState;
  const headerKeys = ['Nomor Transfer', 'Dari', 'Kepada', 'Tanggal Dibuat', 'Nomor Referensi', 'Status Transfer'];

  if (!importTransferBound) {
    importTransferBound = true;
    document.addEventListener('click', async (e) => {
      if (!e.target.closest('#page-import-transfer')) return;
      if (e.target.id === 'itPreview') {
        try {
          const f = document.getElementById('itFile')?.files?.[0];
          if (!f) return toast?.('Pilih PDF dulu', 'error');
          state.fileName = f.name;
          const text = await parsePdf(f);
          const ex = extract(text, headerKeys);
          state.header = ex.header;
          state.rows = ex.rows;
          state.errors = validate(state.rows);
          render();
        } catch (err) {
          toast?.(err?.message || 'Gagal membaca PDF', 'error');
        }
      }
      if (e.target.id === 'itReset') {
        importTransferState = createDefaultState();
        render();
      }
      if (e.target.id === 'itDownload') {
        const cols = ['No', 'Nama Produk', 'SKU', 'Jumlah', 'Diterima', 'Batal', 'Tolak', 'Catatan'];
        const lines = [cols.join(','), ...state.rows.map((r) => [r.no, r.nama, r.sku, r.jumlah, r.diterima, r.batal, r.tolak, r.catatan].map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(','))];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'import-transfer.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      }
      if (e.target.id === 'itImport') {
        state.target = document.getElementById('itTarget')?.value || 'Barang Masuk';
        state.errors = validate(state.rows);
        if (state.errors.length) return toast?.('Perbaiki validasi dulu', 'error');
        const res = await fetch('/api/import-transfer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetSheet: state.target, header: state.header, rows: state.rows }) });
        const out = await res.json();
        if (!res.ok || !out?.success) return toast?.(out?.message || 'Import gagal', 'error');
        toast?.(`Import berhasil ${out.imported} baris`, 'success');
      }
    });

    document.addEventListener('input', (e) => {
      const inp = e.target.closest('#page-import-transfer input[data-row]');
      if (!inp || !importTransferState) return;
      const i = Number(inp.dataset.row);
      const k = inp.dataset.key;
      if (!importTransferState.rows[i]) return;
      importTransferState.rows[i][k] = inp.value;
      importTransferState.errors = validate(importTransferState.rows);
    });
  }
  render();
}

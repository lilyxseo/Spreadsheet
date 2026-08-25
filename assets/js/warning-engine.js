// Whitelist lokasi operasional. Nilai gabungan sengaja dipertahankan sebagai
// diagnostic master dan tidak pernah dianggap sebagai sebuah lokasi valid.
export const RETAIL_LOCATIONS = Object.freeze([
  "AA-1-1-A", "AA-1-1-B", "AA-1-2-C", "BB-4-2-G", "CC-6-3-F",
  "DD-2-1-A", "EE-7-2-A", "EE-7-2-C", "EE-7-2-D", "EE-7-3-F",
  "FF-4-2-G", "GG-6-3-D", "HH-4-3-E"
]);

export const BULKY_LOCATIONS = Object.freeze([
  "A01-1", "A20-1", "A20-2", "A20-3", "A20-5", "B03-1", "B03-2",
  "C18-5", "D20-4", "E02-1", "F20-5", "G20-5", "H12-3",
  "AREA OUTBOUND", "EXPIRED", "RUANG TR 2",
  "B03-2, EE-7-2-A", "E02-1, EE-4-2-D"
]);

export function decodeURIComponentSafe(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

export function normalizeLocation(value) {
  return decodeURIComponentSafe(String(value ?? ""))
    .toUpperCase().trim().replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").replace(/\s*-\s*/g, "-");
}

export function normalizeText(value) {
  return decodeURIComponentSafe(String(value ?? "")).replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ").replace(/[–—]/g, "-").trim().replace(/\s+/g, " ").toUpperCase();
}

const prepareMaster = values => {
  const anomalies = values.filter(value => String(value).includes(","));
  const locations = values.filter(value => !String(value).includes(",")).map(normalizeLocation);
  return { set: new Set(locations), anomalies, rawCount: values.length, uniqueCount: new Set(locations).size };
};
export const retailMaster = prepareMaster(RETAIL_LOCATIONS);
export const bulkyMaster = prepareMaster(BULKY_LOCATIONS);
export const retailLocationSet = retailMaster.set;
export const bulkyLocationSet = bulkyMaster.set;

export function classifyLocation(value) {
  const location = normalizeLocation(value);
  if (retailLocationSet.has(location)) return "RETAIL";
  if (bulkyLocationSet.has(location)) return "BULKY";
  return "UNKNOWN";
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length];
}

export function nearestLocations(value, limit = 3) {
  const input = normalizeLocation(value);
  const parts = input.split("-");
  const prefix = parts.length >= 4 ? parts.slice(0, -1).join("-") : parts.slice(0, Math.max(1, parts.length - 1)).join("-");
  const all = [...retailLocationSet, ...bulkyLocationSet];
  let candidates = all.filter(location => location.startsWith(`${prefix}-`));
  if (!candidates.length) candidates = all.filter(location => location.split("-")[0] === parts[0]).slice(0, 80);
  return candidates.map(location => ({ location, score: distance(input, location) }))
    .sort((a, b) => a.score - b.score || a.location.localeCompare(b.location)).slice(0, limit).map(x => x.location);
}

export function parseStrictNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? { valid: true, value } : { valid: false, reason: "bukan angka" };
  if (value === null || value === undefined || String(value).trim() === "") return { valid: false, reason: "kosong" };
  const text = String(value).trim();
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(text)) return { valid: false, reason: "format angka tidak valid" };
  return { valid: true, value: Number(text), textStored: typeof value === "string" };
}

const aliases = {
  sku: ["sku"], name: ["nama barang", "nama", "item", "description"],
  location: ["lokasi", "location", "from", "dari", "rak", "bin", "area"],
  to: ["to", "tujuan", "kepada"], qty: ["qty", "jumlah"], output: ["pengeluaran", "qty keluar", "keluar", "out"],
  status: ["status"], targetType: ["rak tujuan", "jenis", "invent", "tipe"],
  iseller: ["no iseller", "iseller"], netsuite: ["netsuite", "no netsuite"], date: ["tanggal", "date"]
};
const read = (row, keys) => { const map = new Map(Object.entries(row || {}).map(([k, v]) => [normalizeText(k).toLowerCase(), v])); for (const key of keys) if (map.has(key)) return map.get(key); return undefined; };
const val = (row, key) => read(row, aliases[key]);
const finalStatus = row => !["CANCEL", "CANCELLED", "BATAL", "DITOLAK", "DRAFT", "PENDING", "OPEN"].includes(normalizeText(val(row, "status")));
const keyOf = (sku, location) => `${normalizeText(sku)}|${normalizeLocation(location)}`;

export function buildWarningReport({ kartu = [], outbound = [], sync = {} } = {}) {
  const warnings = [], skuMap = new Map(), nameMap = new Map(), skuLocationMap = new Map(), kartuOutput = new Map(), outboundMap = new Map();
  const add = warning => warnings.push({ id: `${warning.type}-${warnings.length + 1}`, severity: "WARNING", sku: "-", namaBarang: "-", location: "-", locationType: "UNKNOWN", source: "-", currentValue: "-", expectedValue: "-", suggestion: "Periksa data sumber.", confidence: 100, relatedRow: null, ...warning });
  kartu.forEach((row, index) => {
    const sku = normalizeText(val(row, "sku")), name = normalizeText(val(row, "name")), location = normalizeLocation(val(row, "location"));
    if (sku && !skuMap.has(sku)) skuMap.set(sku, name);
    if (name && !nameMap.has(name)) nameMap.set(name, sku);
    if (sku && location) { if (!skuLocationMap.has(sku)) skuLocationMap.set(sku, new Set()); skuLocationMap.get(sku).add(location); }
    const parsed = parseStrictNumber(val(row, "output")); if (sku && location && parsed.valid) kartuOutput.set(keyOf(sku, location), (kartuOutput.get(keyOf(sku, location)) || 0) + parsed.value);
  });
  const referenceSeen = new Map();
  outbound.forEach((row, index) => {
    const rowNo = index + 2, rawSku = val(row, "sku"), sku = normalizeText(rawSku), name = normalizeText(val(row, "name"));
    const rawLocation = val(row, "location"), location = normalizeLocation(rawLocation), type = classifyLocation(location), qty = parseStrictNumber(val(row, "qty"));
    const base = { sku: rawSku || "-", namaBarang: val(row, "name") || "-", location: location || "-", locationType: type, source: "Barang Keluar", relatedRow: rowNo };
    if (!sku) add({ ...base, type: "EMPTY_SKU", problem: "SKU belum diisi.", currentValue: "kosong", expectedValue: "SKU dari master", severity: "CRITICAL" });
    if (!name) add({ ...base, type: "EMPTY_NAME", problem: "Nama barang belum diisi.", currentValue: "kosong", expectedValue: skuMap.get(sku) || "Nama barang dari master" });
    if (!location) add({ ...base, type: "EMPTY_LOCATION", problem: "Lokasi belum diisi.", currentValue: "kosong", expectedValue: "Alamat master Retail/Bulky" });
    else if (String(rawLocation).includes(",") && String(rawLocation).split(",").filter(x => normalizeLocation(x)).length > 1) add({ ...base, type: "MULTI_LOCATION", problem: "Kolom lokasi berisi lebih dari satu alamat.", currentValue: rawLocation, expectedValue: "Satu alamat per kolom", suggestion: String(rawLocation).split(",").map(normalizeLocation) });
    else if (type === "UNKNOWN") add({ ...base, type: "INVALID_LOCATION", problem: "Alamat tidak ditemukan dalam master lokasi.", currentValue: rawLocation, expectedValue: "Alamat whitelist Retail/Bulky", suggestion: nearestLocations(location), confidence: 95 });
    const target = normalizeText(val(row, "targetType")); if (["RETAIL", "BULKY"].includes(target) && type !== "UNKNOWN" && target !== type) add({ ...base, type: "LOCATION_TYPE_MISMATCH", problem: `Rak tujuan ${target} tetapi lokasi merupakan alamat ${type}.`, currentValue: type, expectedValue: target });
    if (!qty.valid) add({ ...base, type: "INVALID_QTY", problem: `Qty tidak terbaca (${qty.reason}).`, currentValue: val(row, "qty") ?? "kosong", expectedValue: "Angka murni, contoh 10", severity: "CRITICAL" });
    else if (qty.value < 0) add({ ...base, type: "NEGATIVE_QTY", problem: "Qty bernilai negatif.", currentValue: qty.value, expectedValue: "Qty nol atau positif", severity: "CRITICAL" });
    if (sku && skuMap.has(sku) && name && skuMap.get(sku) !== name) add({ ...base, type: "SKU_NAME_MISMATCH", problem: "Nama barang tidak sesuai dengan SKU.", currentValue: val(row, "name"), expectedValue: skuMap.get(sku), suggestion: `Gunakan nama referensi: ${skuMap.get(sku)}` });
    else if (sku && !skuMap.has(sku) && nameMap.has(name)) add({ ...base, type: "NAME_MATCHES_OTHER_SKU", problem: "Nama barang cocok dengan SKU lain.", currentValue: rawSku, expectedValue: nameMap.get(name), suggestion: `Periksa apakah SKU seharusnya ${nameMap.get(name)}` });
    else if (sku && !skuMap.has(sku)) add({ ...base, type: "UNKNOWN_SKU", problem: "SKU tidak ditemukan di master Kartu Stok.", currentValue: rawSku, expectedValue: "SKU yang terdaftar" });
    if (sku && location && skuMap.has(sku) && !skuLocationMap.get(sku)?.has(location)) add({ ...base, type: "SKU_NOT_AT_LOCATION", problem: `SKU tidak ditemukan pada lokasi asal ${location}.`, currentValue: location, expectedValue: [...(skuLocationMap.get(sku) || [])].join(" / ") || "Lokasi SKU di Kartu Stok" });
    const to = normalizeLocation(val(row, "to")); if (location && to && location === to) add({ ...base, type: "SAME_FROM_TO", problem: "Lokasi asal dan tujuan sama.", currentValue: location, expectedValue: "FROM dan TO berbeda" });
    const refs = [val(row, "iseller"), val(row, "netsuite")].map(normalizeText).filter(Boolean);
    refs.forEach(ref => { if (referenceSeen.has(ref)) add({ ...base, type: "DUPLICATE_REFERENCE", problem: "Reference ID transaksi terduplikasi.", currentValue: ref, expectedValue: "Reference ID unik", suggestion: `Periksa juga row ${referenceSeen.get(ref)}`, severity: "CRITICAL" }); else referenceSeen.set(ref, rowNo); });
    if (finalStatus(row) && qty.valid && sku && location) outboundMap.set(keyOf(sku, location), (outboundMap.get(keyOf(sku, location)) || 0) + qty.value);
  });
  const syncGap = Math.abs(Number(sync.kartu || 0) - Number(sync.outbound || 0));
  const comparable = !sync.kartu || !sync.outbound || syncGap <= 15 * 60 * 1000;
  if (!comparable) add({ type: "DATA_NOT_SYNCED", severity: "INFO", source: "Kartu Stok / Barang Keluar", problem: "Perbandingan stok ditunda karena sumber belum sinkron.", currentValue: `${syncGap} ms`, expectedValue: "Selisih sinkronisasi maksimal 15 menit" });
  else for (const [key, outQty] of outboundMap) { const stockQty = kartuOutput.get(key) || 0; if (stockQty !== outQty) { const [sku, location] = key.split("|"); const diff = stockQty - outQty; add({ type: stockQty === 0 ? "STOCK_NOT_UPDATED" : "STOCK_IMBALANCE", severity: stockQty === 0 || Math.abs(diff) >= 10 ? "CRITICAL" : "WARNING", sku, namaBarang: skuMap.get(sku) || "-", location, locationType: classifyLocation(location), source: "Kartu Stok / Barang Keluar", problem: stockQty === 0 ? "Transaksi Barang Keluar ditemukan tetapi belum tercermin di Kartu Stok." : `${diff > 0 ? "Kartu Stok" : "Barang Keluar"} lebih besar ${Math.abs(diff)} pcs.`, currentValue: `Kartu ${stockQty} / Keluar ${outQty}`, expectedValue: "Selisih 0 (balance)", suggestion: "Periksa transaksi final dan Pengeluaran Kartu Stok." }); } }
  [...retailMaster.anomalies.map(value => ["Retail", value]), ...bulkyMaster.anomalies.map(value => ["Bulky", value])].forEach(([master, value]) => add({ type: "MASTER_LOCATION_ANOMALY", severity: "INFO", source: `Master ${master}`, location: value, problem: "Ditemukan entry master lokasi yang berisi lebih dari satu alamat.", currentValue: value, expectedValue: "Satu alamat per entry" }));
  return { warnings, diagnostics: { retail: { raw: retailMaster.rawCount, unique: retailMaster.uniqueCount }, bulky: { raw: bulkyMaster.rawCount, unique: bulkyMaster.uniqueCount } } };
}

import { locationMasterService, normalizeLocation, decodeURIComponentSafe } from "./location-master-service.js";
export { locationMasterService, normalizeLocation, decodeURIComponentSafe } from "./location-master-service.js";

export function normalizeText(value) {
  return decodeURIComponentSafe(String(value ?? "")).replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ").replace(/[–—]/g, "-").trim().replace(/\s+/g, " ").toUpperCase();
}

export function classifyLocation(value) {
  return locationMasterService.getLocationType(value);
}

export function nearestLocations(value, limit = 3) {
  return locationMasterService.suggestLocations(value, limit);
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

export function buildWarningReport({ kartu = [], outbound = [], sync = {}, locationService = locationMasterService } = {}) {
  const warnings = [], skuMap = new Map(), nameMap = new Map(), skuLocationMap = new Map(), kartuOutput = new Map(), outboundMap = new Map();
  const fingerprints = new Set();
  const add = warning => {
    const complete = { severity: "WARNING", sku: "-", namaBarang: "-", location: "-", locationType: "UNKNOWN", source: "-", currentValue: "-", expectedValue: "-", suggestion: "Periksa data sumber.", confidence: 100, relatedRow: null, ...warning };
    const fingerprint = [complete.type, complete.sku, complete.location, complete.source, complete.relatedRow].join("|");
    if (fingerprints.has(fingerprint)) return;
    fingerprints.add(fingerprint); warnings.push({ ...complete, id: `${complete.type}-${warnings.length + 1}` });
  };
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
    const rawLocation = val(row, "location"), location = normalizeLocation(rawLocation), locationResult = locationService.validate(location), type = locationResult.type, qty = parseStrictNumber(val(row, "qty"));
    const base = { sku: rawSku || "-", namaBarang: val(row, "name") || "-", location: location || "-", locationType: type, source: "Barang Keluar", relatedRow: rowNo };
    if (!sku) add({ ...base, type: "EMPTY_SKU", problem: "SKU belum diisi.", currentValue: "kosong", expectedValue: "SKU dari master", severity: "CRITICAL" });
    if (!name) add({ ...base, type: "EMPTY_NAME", problem: "Nama barang belum diisi.", currentValue: "kosong", expectedValue: skuMap.get(sku) || "Nama barang dari master" });
    if (!location) add({ ...base, type: "EMPTY_LOCATION", problem: "Lokasi belum diisi.", currentValue: "kosong", expectedValue: "Alamat master Retail/Bulky" });
    else if (String(rawLocation).includes(",") && String(rawLocation).split(",").filter(x => normalizeLocation(x)).length > 1) add({ ...base, type: "MULTI_LOCATION", problem: "Kolom lokasi berisi lebih dari satu alamat.", currentValue: rawLocation, expectedValue: "Satu alamat per kolom", suggestion: String(rawLocation).split(",").map(normalizeLocation) });
    else if (locationService.ready && type === "UNKNOWN") add({ ...base, type: "INVALID_LOCATION", problem: "Alamat tidak ditemukan dalam master lokasi.", currentValue: rawLocation, expectedValue: "Alamat whitelist Retail/Bulky", suggestion: locationService.suggestLocations(location), confidence: 95 });
    const target = normalizeText(val(row, "targetType")); if (["RETAIL", "BULKY"].includes(target) && type !== "UNKNOWN" && target !== type) add({ ...base, type: "LOCATION_TYPE_MISMATCH", problem: `Rak tujuan ${target} tetapi lokasi merupakan alamat ${type}.`, currentValue: type, expectedValue: target });
    if (!qty.valid) add({ ...base, type: "INVALID_QTY", problem: `Qty tidak terbaca (${qty.reason}).`, currentValue: val(row, "qty") ?? "kosong", expectedValue: "Angka murni, contoh 10", severity: "CRITICAL" });
    else if (qty.value < 0) add({ ...base, type: "NEGATIVE_QTY", problem: "Qty bernilai negatif.", currentValue: qty.value, expectedValue: "Qty nol atau positif", severity: "CRITICAL" });
    if (sku && skuMap.has(sku) && name && skuMap.get(sku) !== name) add({ ...base, type: "SKU_NAME_MISMATCH", problem: "Nama barang tidak sesuai dengan SKU.", currentValue: val(row, "name"), expectedValue: skuMap.get(sku), suggestion: `Gunakan nama referensi: ${skuMap.get(sku)}` });
    else if (sku && !skuMap.has(sku) && nameMap.has(name)) add({ ...base, type: "NAME_MATCHES_OTHER_SKU", problem: "Nama barang cocok dengan SKU lain.", currentValue: rawSku, expectedValue: nameMap.get(name), suggestion: `Periksa apakah SKU seharusnya ${nameMap.get(name)}` });
    else if (sku && !skuMap.has(sku)) add({ ...base, type: "UNKNOWN_SKU", problem: "SKU tidak ditemukan di master Kartu Stok.", currentValue: rawSku, expectedValue: "SKU yang terdaftar" });
    if (locationService.ready && locationResult.valid && sku && skuMap.has(sku) && !skuLocationMap.get(sku)?.has(location)) add({ ...base, type: "SKU_NOT_AT_LOCATION", problem: `SKU tidak ditemukan pada lokasi asal ${location}.`, currentValue: location, expectedValue: [...(skuLocationMap.get(sku) || [])].join(" / ") || "Lokasi SKU di Kartu Stok" });
    const to = normalizeLocation(val(row, "to")); if (location && to && location === to) add({ ...base, type: "SAME_FROM_TO", problem: "Lokasi asal dan tujuan sama.", currentValue: location, expectedValue: "FROM dan TO berbeda" });
    const refs = [val(row, "iseller"), val(row, "netsuite")].map(normalizeText).filter(Boolean);
    refs.forEach(ref => { if (referenceSeen.has(ref)) add({ ...base, type: "DUPLICATE_REFERENCE", problem: "Reference ID transaksi terduplikasi.", currentValue: ref, expectedValue: "Reference ID unik", suggestion: `Periksa juga row ${referenceSeen.get(ref)}`, severity: "CRITICAL" }); else referenceSeen.set(ref, rowNo); });
    if (finalStatus(row) && qty.valid && sku && location) outboundMap.set(keyOf(sku, location), (outboundMap.get(keyOf(sku, location)) || 0) + qty.value);
  });
  const syncGap = Math.abs(Number(sync.kartu || 0) - Number(sync.outbound || 0));
  const comparable = !sync.kartu || !sync.outbound || syncGap <= 15 * 60 * 1000;
  if (!comparable) add({ type: "DATA_NOT_SYNCED", severity: "INFO", source: "Kartu Stok / Barang Keluar", problem: "Perbandingan stok ditunda karena sumber belum sinkron.", currentValue: `${syncGap} ms`, expectedValue: "Selisih sinkronisasi maksimal 15 menit" });
  else for (const [key, outQty] of outboundMap) { const stockQty = kartuOutput.get(key) || 0; if (stockQty !== outQty) { const [sku, location] = key.split("|"); const diff = stockQty - outQty; add({ type: stockQty === 0 ? "STOCK_NOT_UPDATED" : "STOCK_IMBALANCE", severity: stockQty === 0 || Math.abs(diff) >= 10 ? "CRITICAL" : "WARNING", sku, namaBarang: skuMap.get(sku) || "-", location, locationType: locationService.getLocationType(location), source: "Kartu Stok / Barang Keluar", problem: stockQty === 0 ? "Transaksi Barang Keluar ditemukan tetapi belum tercermin di Kartu Stok." : `${diff > 0 ? "Kartu Stok" : "Barang Keluar"} lebih besar ${Math.abs(diff)} pcs.`, currentValue: `Kartu ${stockQty} / Keluar ${outQty}`, expectedValue: "Selisih 0 (balance)", suggestion: "Periksa transaksi final dan Pengeluaran Kartu Stok." }); } }
  if (!locationService.ready) add({ type: "LOCATION_MASTER_UNAVAILABLE", severity: "INFO", source: "Master Lokasi", problem: "Validasi lokasi tidak dijalankan karena master lokasi belum berhasil dimuat.", currentValue: locationService.diagnostics.error, expectedValue: "Master Retail lengkap", suggestion: "Periksa konfigurasi raw master lokasi." });
  return { warnings, locationMasterReady: locationService.ready, diagnostics: locationService.diagnostics };
}

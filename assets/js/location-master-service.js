export const LOCATION_MASTER_VERSION = "retail-regex-v3";

// Source Retail memang berbentuk teks berurutan tanpa separator. Regex hanya
// mengekstrak kode yang ada di source; regex tidak menentukan validitas.
export const RAW_RETAIL_LOCATION_MASTER =
  "AA-1-1-AAA-1-1-BAA-1-1-CAA-1-1-DAA-2-2-DAA-6-3-F" +
  "BB-4-2-GCC-1-3-FCC-4-1-BCC-4-2-ACC-6-3-FDD-2-1-ADD-6-2-B" +
  "EE-7-2-AEE-7-2-CEE-7-2-DEE-7-3-FFF-4-2-GFF-5-3-C" +
  "GG-6-3-DGG-6-3-FHH-4-1-DHH-4-3-E";

export const RAW_BULKY_LOCATION_MASTER = `A01-1
A20-1
A20-2
A20-3
A20-5
B03-1
B03-2
C18-5
D20-4
E02-1
F20-5
G20-5
H12-3
AREA OUTBOUND
EXPIRED
RUANG TR 2`;

export function decodeURIComponentSafe(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

export function normalizeLocation(value) {
  return decodeURIComponentSafe(String(value ?? "").trim()).toUpperCase()
    .replace(/[–—]/g, "-").replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-").trim();
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = old;
    }
  }
  return row[b.length];
}

export function createLocationMasterService({
  rawRetail = RAW_RETAIL_LOCATION_MASTER,
  rawBulky = RAW_BULKY_LOCATION_MASTER,
  minimumRetailLocations = 100
} = {}) {
  const retailMatches = String(rawRetail).toUpperCase().match(/[A-H]{2}-[1-7]-[1-3]-[A-H]/g) || [];
  const bulkyEntries = String(rawBulky).split(/\r?\n/).map(normalizeLocation).filter(Boolean);
  const retailLocations = [...new Set(retailMatches.map(normalizeLocation))];
  const bulkyLocations = [...new Set(bulkyEntries)];
  const retailSet = new Set(retailLocations), bulkySet = new Set(bulkyLocations);
  const knownSamples = ["AA-2-2-D", "CC-1-3-F", "CC-4-1-B"];
  const bulkySamples = ["A20-5", "B03-2", "E02-1", "AREA OUTBOUND", "EXPIRED"];
  const selfTestFailures = [...knownSamples.filter(x => !retailSet.has(x)), ...bulkySamples.filter(x => !bulkySet.has(x))];
  const ready = retailLocations.length >= minimumRetailLocations && selfTestFailures.length === 0;
  const prefixIndex = new Map();
  [...retailLocations, ...bulkyLocations].forEach(location => {
    const parts = location.split("-");
    for (let size = 1; size < parts.length; size++) {
      const prefix = parts.slice(0, size).join("-");
      if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, []);
      prefixIndex.get(prefix).push(location);
    }
  });
  const getLocationType = value => { const normalized = normalizeLocation(value); return retailSet.has(normalized) ? "RETAIL" : bulkySet.has(normalized) ? "BULKY" : "UNKNOWN"; };
  const validate = value => { const normalized = normalizeLocation(value), type = getLocationType(normalized); return { valid: type !== "UNKNOWN", type, normalized, masterReady: ready }; };
  const suggestLocations = (value, limit = 3) => {
    const normalized = normalizeLocation(value);
    if (validate(normalized).valid || !ready) return [];
    const parts = normalized.split("-"); let candidates = [];
    for (let size = parts.length - 1; size >= 1 && !candidates.length; size--) candidates = prefixIndex.get(parts.slice(0, size).join("-")) || [];
    return candidates.map(location => ({ location, score: editDistance(normalized, location) }))
      .sort((a, b) => a.score - b.score || a.location.localeCompare(b.location)).slice(0, limit).map(x => x.location);
  };
  return Object.freeze({
    ready, validate, getLocationType, suggestLocations,
    isValidLocation: value => validate(value).valid,
    hasRetailLocation: value => retailSet.has(normalizeLocation(value)),
    hasBulkyLocation: value => bulkySet.has(normalizeLocation(value)),
    diagnostics: Object.freeze({
      version: LOCATION_MASTER_VERSION, ready,
      retail: { rawMatches: retailMatches.length, uniqueLocations: retailSet.size, duplicateRemoved: retailMatches.length - retailSet.size },
      bulky: { rawEntries: bulkyEntries.length, uniqueLocations: bulkySet.size, duplicateRemoved: bulkyEntries.length - bulkySet.size },
      selfTestFailures,
      error: ready ? "" : "Master lokasi Retail tidak berhasil dimuat dengan lengkap."
    })
  });
}

// Dibangun sekali saat module pertama di-load, bukan per row atau per render.
export const locationMasterService = createLocationMasterService();

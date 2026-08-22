/** Pusat audit aplikasi. Semua payload lama dan baru dinormalisasi di sini. */
export const SEARCH_ACTIVITY_LOGGING = false;
const SENSITIVE_KEY = /(password|passwd|token|cookie|secret|api.?key|private.?key|credential|authorization)/i;
const queued = [];
const pendingIds = new Set();
let flushTimer;

const uuid = () => globalThis.crypto?.randomUUID?.() || `act-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const cleanValue = (value, depth = 0) => {
  if (depth > 4) return '[dipotong]';
  if (Array.isArray(value)) return value.slice(0, 250).map(item => cleanValue(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, item]) => [key, cleanValue(item, depth + 1)]));
  return typeof value === 'string' ? value.slice(0, 1000) : value;
};
const empty = value => value === '' || value === null || value === undefined ? 'kosong' : String(value);
const title = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const userContext = () => {
  const user = globalThis.window?.currentUser || globalThis.window?.APP_STATE?.currentUser || {};
  return { user: user.name || user.full_name || user.username || user.email || 'User', role: user.role || 'User', isDeveloper: user.isDeveloper === true };
};
export function getActivitySessionId() {
  if (!globalThis.sessionStorage) return 'server-session';
  let id = sessionStorage.getItem('activity_session_id');
  if (!id) { id = uuid(); sessionStorage.setItem('activity_session_id', id); }
  return id;
}
export function createActivityId() { return uuid(); }

export function normalizeActivity(input = {}) {
  const ctx = userContext();
  const action = String(input.action || 'UNKNOWN').toUpperCase();
  const result = String(input.result || input.status || 'SUCCESS').toUpperCase();
  const details = cleanValue(input.details || input.metadata || {});
  return {
    id: input.id || input.activityId || uuid(), timestamp: input.timestamp || new Date().toISOString(),
    user: input.user || input.user_name || ctx.user, role: input.role || ctx.role,
    isDeveloper: input.isDeveloper ?? ctx.isDeveloper, sessionId: input.sessionId || getActivitySessionId(),
    action, category: input.category || (/^(CREATE|UPDATE|DELETE|BATCH_UPDATE)$/.test(action) ? 'CRUD' : action === 'PAGE_VIEW' ? 'NAVIGATION' : action),
    module: input.module || 'Aplikasi', page: input.page || globalThis.location?.pathname || '/',
    description: input.description || input.detail || `${title(action)} di ${input.module || 'aplikasi'}.`,
    entityType: input.entityType || null, entityId: input.entityId || input.reference || null,
    details, result: ['SUCCESS', 'FAILED', 'DENIED'].includes(result) ? result : 'FAILED', source: input.source || 'WEB',
    correlationId: input.correlationId || input.activityId || input.id || null,
  };
}

async function send(activity) {
  const response = await fetch('/api/activity-log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Activity-ID': activity.id }, body: JSON.stringify(activity) });
  if (!response.ok) throw new Error(`Activity log HTTP ${response.status}`);
  return activity;
}
export async function flushActivityQueue() {
  clearTimeout(flushTimer); flushTimer = undefined;
  const batch = queued.splice(0, 10);
  await Promise.allSettled(batch.map(async item => { try { await send(item.activity); item.resolve(item.activity); } catch (error) { if (item.retries++ < 2) queued.push(item); else item.resolve(item.activity); } finally { pendingIds.delete(item.activity.id); } }));
  if (queued.length) flushTimer = setTimeout(flushActivityQueue, 1500);
}
export function logActivity(payload, { immediate = false } = {}) {
  const activity = normalizeActivity(payload);
  if (pendingIds.has(activity.id)) return Promise.resolve(activity);
  pendingIds.add(activity.id);
  if (immediate) return send(activity).catch(() => activity).finally(() => pendingIds.delete(activity.id));
  return new Promise(resolve => { queued.push({ activity, resolve, retries: 0 }); flushTimer ||= setTimeout(flushActivityQueue, 250); });
}

export const logCreate = p => logActivity({ ...p, action: 'CREATE', category: 'CRUD', description: p.description || `Menambahkan ${p.entityType || 'data'} ${p.entityId || ''} di ${p.module}.`.replace(/\s+/g, ' ') });
export const logUpdate = p => { const changes = p.changes || []; const one = changes[0]; const description = p.description || (changes.length === 1 ? `${p.source === 'INLINE_EDIT' ? 'Inline edit' : 'Mengubah'} ${title(one.field)} ${p.entityType || ''} ${p.entityId || ''} dari ${empty(one.oldValue)} menjadi ${empty(one.newValue)}${p.source === 'LOCATION_CARD' ? ' melalui card Lokasi' : ''}.` : `Mengubah ${changes.length} field pada ${p.entityType || 'data'} ${p.entityId || ''}: ${changes.map(c => title(c.field)).join(', ')}.`); return logActivity({ ...p, action: 'UPDATE', category: 'CRUD', description, details: { ...(p.details || {}), changes } }); };
export const logDelete = p => logActivity({ ...p, action: 'DELETE', category: 'CRUD', description: p.description || `Menghapus ${p.entityType || 'data'} ${p.entityId || ''} dari ${p.module}.`, details: { ...(p.details || {}), snapshot: cleanValue(p.snapshot || {}) } });
export const logPageView = p => logActivity({ ...p, action: 'PAGE_VIEW', category: 'NAVIGATION', description: p.description || (p.from ? `Berpindah dari ${p.fromName || p.from} ke ${p.toName || p.to}.` : `Membuka halaman ${p.toName || p.to}.`), details: { from: p.from || null, to: p.to } });
export const logLogin = p => logActivity({ ...p, action: p.auto ? 'AUTO_LOGIN' : p.failed ? 'LOGIN_FAILED' : 'LOGIN', category: 'AUTH', module: 'Auth', description: p.description || (p.failed ? `Percobaan login gagal untuk username ${p.username || 'tidak dikenal'}.` : p.auto ? `${p.isDeveloper ? 'Akun Developer' : p.user || 'User'} masuk melalui Auto Login.` : `${p.user || 'User'} login ke aplikasi.`), details: { method: p.method || (p.auto ? 'SESSION' : 'PASSWORD'), reason: p.reason, role: p.role } }, { immediate: true });
export const logLogout = p => logActivity({ ...p, action: p.expired ? 'SESSION_EXPIRED' : 'LOGOUT', category: 'AUTH', module: 'Auth', description: p.description || (p.expired ? 'Session berakhir dan user keluar otomatis.' : `${p.user || userContext().user} logout dari aplikasi.`), details: { type: p.expired ? 'SESSION_EXPIRED' : 'MANUAL', sessionDuration: p.sessionDuration } }, { immediate: true });
export const logImport = p => logActivity({ ...p, action: 'IMPORT', category: 'DATA_TRANSFER', description: p.description || `Import ${p.importType || 'data'} ${p.result === 'FAILED' ? 'gagal' : `berhasil menambahkan ${p.validRows || 0} row ke ${p.sheet ? `sheet ${p.sheet}` : p.module}`}.`, details: { ...(p.details || {}), importType: p.importType, fileName: p.fileName, sheet: p.sheet, validRows: p.validRows, failedRows: p.failedRows, durationMs: p.durationMs } });
export const logExport = p => logActivity({ ...p, action: 'EXPORT', category: 'DATA_TRANSFER', description: p.description || `Export ${p.rowCount || 0} data ${p.module} ke ${p.format || 'file'}.`, details: { ...(p.details || {}), format: p.format, rowCount: p.rowCount, filters: p.filters } });
export const logUndo = p => logActivity({ ...p, action: 'UNDO', category: 'HISTORY', details: { ...(p.details || {}), relatedActivityId: p.relatedActivityId } });
export const logRedo = p => logActivity({ ...p, action: 'REDO', category: 'HISTORY', details: { ...(p.details || {}), relatedActivityId: p.relatedActivityId } });

export async function logActivityResult(basePayload, actionFn) {
  try { const value = await actionFn(); await logActivity({ ...basePayload, result: 'SUCCESS' }); return value; }
  catch (error) { await logActivity({ ...basePayload, result: 'FAILED', description: `${basePayload.description || basePayload.action || 'Aksi'} gagal: ${error?.message || error}`, details: { ...(basePayload.details || {}), error: String(error?.message || error) } }); throw error; }
}

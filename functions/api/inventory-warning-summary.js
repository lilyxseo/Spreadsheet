import { getRequestRole } from './_authz.js';
import { computeInventorySummary, loadInventoryAnalyticsRows } from './_inventory-analytics.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=30' } });
}

export async function onRequestGet({ request, env }) {
  if (!(await getRequestRole(request, env))) return json({ success: false, message: 'Sesi tidak valid' }, 401);
  try {
    const value = computeInventorySummary(await loadInventoryAnalyticsRows(env));
    return json({ success: true, source: 'supabase', summary: {
      warningCount: value.warningCount, minusStock: value.minusStock, minusQuantity: value.minusQuantity,
      accuracy: value.accuracy, accurateSku: value.accurateSku, inaccurateSku: value.inaccurateSku,
      duplicateSku: value.duplicateSku, missingSku: value.missingSku, locationMismatch: value.locationMismatch,
      overstock: value.overstock, deadStock: value.deadStock, reconciliationDifference: value.reconciliationDifference,
    } });
  } catch (error) {
    console.error('[InventoryWarningSummary]', error?.message || error);
    return json({ success: false, source: 'supabase', message: 'Gagal menghitung warning inventory.' }, 502);
  }
}

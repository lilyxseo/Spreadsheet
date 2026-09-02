import { getRequestRole } from './_authz.js';
import { computeInventorySummary, loadInventoryAnalyticsRows } from './_inventory-analytics.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=30' },
  });
}

export async function handleDashboardSummaryRequest({ request, env }) {
  if (!(await getRequestRole(request, env))) return json({ success: false, message: 'Sesi tidak valid' }, 401);
  try {
    const startedAt = Date.now();
    const { rows, failures } = await loadInventoryAnalyticsRows(env);
    return json({ success: true, source: 'supabase', partial: failures.length > 0, unavailableSources: failures.map(item => item.source), summary: computeInventorySummary(rows), durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error('[DashboardSummary]', error?.message || error, error?.failures || '');
    return json({ success: false, source: 'supabase', message: 'Gagal menghitung ringkasan inventory.' }, 502);
  }
}

export function onRequestGet(context) {
  return handleDashboardSummaryRequest(context);
}

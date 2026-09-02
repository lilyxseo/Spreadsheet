import { runInventorySync } from './_inventory-runner.js';
import { inventorySyncJson, isInventorySyncAuthorized } from './_manual-endpoint.js';

export async function handleInventorySyncRun({ request, env }, dependencies = {}) {
  if (!isInventorySyncAuthorized(request, env)) {
    return inventorySyncJson({ success: false, reason: 'UNAUTHORIZED' }, 401);
  }

  const result = await (dependencies.run || runInventorySync)(env, dependencies);
  return inventorySyncJson(result, result.success ? 200 : 500);
}

// Manual diagnostics only: production Cron must call each per-source endpoint
// separately so every source receives a fresh Cloudflare subrequest budget.
export function onRequestPost(context) {
  return handleInventorySyncRun(context);
}

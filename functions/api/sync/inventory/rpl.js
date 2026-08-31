import { syncRpl } from './_rpl-service.js';
import { handleManualInventorySync } from './_manual-endpoint.js';

export function handleManualRplSync(context, dependencies = {}) {
  return handleManualInventorySync(context, { source: 'rpl', sync: dependencies.sync || syncRpl });
}
export function onRequestPost(context) { return handleManualRplSync(context); }

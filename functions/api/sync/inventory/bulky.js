import { syncBulky } from './_bulky-service.js';
import { handleManualInventorySync } from './_manual-endpoint.js';

export function handleManualBulkySync(context, dependencies = {}) {
  return handleManualInventorySync(context, { source: 'bulky', sync: dependencies.sync || syncBulky });
}
export function onRequestPost(context) { return handleManualBulkySync(context); }

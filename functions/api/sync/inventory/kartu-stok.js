import { syncKartuStok } from './_kartu-stok-service.js';
import { handleManualInventorySync } from './_manual-endpoint.js';

export async function handleManualKartuStokSync({ request, env }, dependencies = {}) {
  return handleManualInventorySync({ request, env }, { source: 'kartu_stok', sync: dependencies.sync || syncKartuStok });
}

export async function onRequestPost(context) {
  return handleManualKartuStokSync(context);
}

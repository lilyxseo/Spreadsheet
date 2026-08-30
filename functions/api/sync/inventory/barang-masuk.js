import { syncBarangMasuk } from './_barang-masuk-service.js';
import { handleManualInventorySync } from './_manual-endpoint.js';

export function handleManualBarangMasukSync(context, dependencies = {}) {
  return handleManualInventorySync(context, { source: 'barang_masuk', sync: dependencies.sync || syncBarangMasuk });
}
export function onRequestPost(context) { return handleManualBarangMasukSync(context); }

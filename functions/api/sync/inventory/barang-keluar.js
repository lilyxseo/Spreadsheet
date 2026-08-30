import { syncBarangKeluar } from './_barang-keluar-service.js';
import { handleManualInventorySync } from './_manual-endpoint.js';

export function handleManualBarangKeluarSync(context, dependencies = {}) {
  return handleManualInventorySync(context, { source: 'barang_keluar', sync: dependencies.sync || syncBarangKeluar });
}
export function onRequestPost(context) { return handleManualBarangKeluarSync(context); }

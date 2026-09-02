import { syncKartuStok } from './_kartu-stok-service.js';
import { syncBarangMasuk } from './_barang-masuk-service.js';
import { syncBarangKeluar } from './_barang-keluar-service.js';
import { syncRpl } from './_rpl-service.js';
import { syncBulky } from './_bulky-service.js';

export const INVENTORY_CRON_SOURCES = Object.freeze([
  ['kartu_stok', syncKartuStok],
  ['barang_masuk', syncBarangMasuk],
  ['barang_keluar', syncBarangKeluar],
  ['rpl', syncRpl],
  ['bulky', syncBulky],
]);

export async function runInventoryCron(env, dependencies = {}) {
  const logger = dependencies.logger || console;
  const sources = dependencies.sources || INVENTORY_CRON_SOURCES;
  const started = Date.now();
  const results = [];
  logger.log('[InventoryCron] start');

  for (const [source, sync] of sources) {
    logger.log(`[InventoryCron] source-start ${source}`);
    try {
      const result = await sync(env, dependencies.syncDependencies?.[source]);
      if (result?.success) {
        const summary = {
          durationMs: result.durationMs,
          rowCount: result.sourceRows,
          inserted: result.inserted,
          updated: result.updated,
          deleted: result.deleted,
        };
        logger.log(`[InventoryCron] source-success ${source}`, summary);
        results.push({ source, status: 'success', ...summary });
      } else {
        const message = result?.reason || 'SYNC_FAILED';
        logger.error(`[InventoryCron] source-failed ${source}`, { message });
        results.push({ source, status: result?.skipped ? 'skipped' : 'failed', message, durationMs: result?.durationMs });
      }
    } catch (error) {
      const message = error?.message || String(error);
      logger.error(`[InventoryCron] source-failed ${source}`, { message });
      results.push({ source, status: 'failed', message });
    }
  }

  const successCount = results.filter(result => result.status === 'success').length;
  const failureCount = results.length - successCount;
  const durationMs = Date.now() - started;
  logger.log('[InventoryCron] complete', { durationMs, successCount, failureCount });
  return { success: failureCount === 0, results, durationMs, successCount, failureCount };
}

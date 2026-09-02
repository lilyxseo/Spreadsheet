import { runInventoryCron } from '../functions/api/sync/inventory/_inventory-cron-orchestrator.js';

const LOCK_NAME = 'full-inventory-sync';

export class InventoryCronLock {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.running = false;
    this.run = runInventoryCron;
  }

  async fetch() {
    if (this.running) {
      console.log('[InventoryCron] SCHEDULE_ALREADY_RUNNING');
      return Response.json({ success: false, skipped: true, reason: 'SCHEDULE_ALREADY_RUNNING' }, { status: 409 });
    }

    this.running = true;
    try {
      return Response.json(await this.run(this.env));
    } finally {
      this.running = false;
    }
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    const lock = env.INVENTORY_CRON_LOCK.get(env.INVENTORY_CRON_LOCK.idFromName(LOCK_NAME));
    ctx.waitUntil(lock.fetch('https://inventory-cron.internal/run').then(async response => {
      const result = await response.json();
      if (!response.ok && result.reason !== 'SCHEDULE_ALREADY_RUNNING') {
        console.error('[InventoryCron] invocation-failed', { status: response.status });
      }
      return result;
    }));
  },
};

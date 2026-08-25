import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOnce, getRequestManagerStats, setRequestConcurrency } from '../assets/js/performance/request-manager.js';

test('deduplicates concurrent requests with the same key', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; await new Promise(r => setTimeout(r, 10)); return 'ok'; };
  const [a, b, c] = await Promise.all([fetchOnce('stock', fetcher), fetchOnce('stock', fetcher), fetchOnce('stock', fetcher)]);
  assert.deepEqual([a, b, c], ['ok', 'ok', 'ok']);
  assert.equal(calls, 1);
});

test('limits concurrent requests', async () => {
  setRequestConcurrency(2);
  let running = 0;
  let peak = 0;
  const work = key => fetchOnce(key, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise(r => setTimeout(r, 8));
    running -= 1;
  });
  await Promise.all(Array.from({ length: 8 }, (_, i) => work(`module-${i}`)));
  assert.equal(peak, 2);
  assert.deepEqual(getRequestManagerStats(), { active: 0, queued: 0, running: 0, concurrency: 2 });
});

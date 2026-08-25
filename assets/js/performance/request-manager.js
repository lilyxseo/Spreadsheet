const activeRequests = new Map();
const queue = [];
let running = 0;
let concurrency = 3;

function drain() {
  while (running < concurrency && queue.length) {
    const job = queue.shift();
    if (job.signal?.aborted) {
      job.reject(new DOMException("Request dibatalkan", "AbortError"));
      continue;
    }
    running += 1;
    job.run().then(job.resolve, job.reject).finally(() => {
      running -= 1;
      drain();
    });
  }
}

function enqueue(run, signal) {
  return new Promise((resolve, reject) => {
    queue.push({ run, signal, resolve, reject });
    drain();
  });
}

/** Deduplicates identical reads and limits pressure on Sheets/API endpoints. */
export function fetchOnce(key, fetcher, { signal } = {}) {
  if (activeRequests.has(key)) return activeRequests.get(key);
  const request = enqueue(() => fetcher(signal), signal).finally(() => {
    if (activeRequests.get(key) === request) activeRequests.delete(key);
  });
  activeRequests.set(key, request);
  return request;
}

export function setRequestConcurrency(value) {
  concurrency = Math.max(1, Math.min(6, Number(value) || 3));
  drain();
}

export function getRequestManagerStats() {
  return { active: activeRequests.size, queued: queue.length, running, concurrency };
}

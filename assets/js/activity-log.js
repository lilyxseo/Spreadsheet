export async function logActivity(payload) {
  try {
    await fetch('/api/activity-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('Activity log gagal:', err);
  }
}

export async function logActivityResult(basePayload, actionFn) {
  const payload = basePayload && typeof basePayload === 'object' ? { ...basePayload } : {};
  try {
    const result = await actionFn();
    await logActivity({ ...payload, status: payload.status || 'SUCCESS' });
    return result;
  } catch (err) {
    await logActivity({
      ...payload,
      status: 'FAILED',
      detail: `${payload.detail || payload.action || 'Aksi'} gagal: ${err?.message || err}`,
      metadata: { ...(payload.metadata || {}), error: String(err?.message || err || '') },
    });
    throw err;
  }
}

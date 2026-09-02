# Spreadsheet

## Supabase environment migration

New deployments must configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY`. The publishable key is used by browser/auth flows; the
secret key is restricted to privileged server operations.

Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` environment names are
no longer accepted. A missing or malformed current key fails configuration
explicitly.

The `/api/runtime-config` response retains the `supabaseAnonKey` JSON property
for frontend compatibility. Its value comes from `SUPABASE_PUBLISHABLE_KEY` in
the new configuration, and the secret credential is never returned.

Affected endpoints and helpers:

- `/api/runtime-config` and `/api/login` use the publishable credential.
- Authorization token verification uses the publishable credential; profile
  role lookup and denied-request audit writes use the secret credential.
- `/api/activity-log` and `/api/kartu-stok` use the secret credential.
- Inventory synchronization for Kartu Stok, RPL, BULKY, Barang Masuk, and
  Barang Keluar uses the secret credential through the shared sync engine.

## Production inventory schedule

`wrangler.toml` deploys a dedicated scheduled Worker. Its Cron Trigger is
`*/30 * * * *` (every 30 minutes, in UTC). Each trigger enters one Durable
Object and runs `kartu_stok`, `barang_masuk`, `barang_keluar`, `rpl`, then
`bulky` sequentially. The Durable Object rejects a second live full run with
`SCHEDULE_ALREADY_RUNNING`; the existing database lock still protects each
individual source. A source error is collected and does not stop later sources.

The Worker calls the same service functions as the bearer-protected manual
endpoints. It does not call the public site, and it does not change the UI's
Supabase-only refresh behavior. The shared engine continues to maintain
`inventory_sync_status` and sync history.

### Runtime audit

At a 30-minute Cron frequency Cloudflare applies the shorter Scheduled Worker
CPU allowance (30 seconds of CPU time). Network wait time is not CPU time, but
the five Google reads, Supabase paging/batches, and row hashing make elapsed
time data-dependent. There is no production duration telemetry in this
repository from which to claim a measured worst case. Operationally, treat 30
minutes as the maximum acceptable elapsed run: a run still live at the next
trigger is skipped rather than overlapped. Inspect `[InventoryCron] complete`
and the five per-source `durationMs` values after the first deployment. If CPU
usage approaches the platform limit, do not parallelize; change to a single
trigger that chains queued source messages, or use staggered non-overlapping
source triggers.

### Required Worker environment and deployment

The scheduled Worker requires `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and one spreadsheet identifier:
`SHEET_ID_2026` (preferred existing name) or `GOOGLE_SHEET_ID`. The independent
Pages deployment must retain `INVENTORY_SYNC_SECRET` for manual endpoints (and
its other existing frontend/auth variables). No credential belongs in
`wrangler.toml` or source control.

From the repository root:

1. Authenticate the intended Cloudflare production account with Wrangler.
2. Add secrets with `npx wrangler secret put SUPABASE_URL`,
   `npx wrangler secret put SUPABASE_SECRET_KEY`,
   `npx wrangler secret put GOOGLE_CLIENT_EMAIL`,
   `npx wrangler secret put GOOGLE_PRIVATE_KEY`, and
   `npx wrangler secret put SHEET_ID_2026`.
3. Run `npx wrangler deploy`. This creates the `InventoryCronLock` Durable
   Object migration and the `*/30 * * * *` Cron Trigger from `wrangler.toml`.
4. Confirm the trigger in **Workers & Pages → wms-inventory-cron → Triggers**,
   invoke it once from the dashboard, and inspect `npx wrangler tail` for the
   ordered start/success/complete messages.
5. Verify all five rows in `public.inventory_sync_status` show the expected
   status, timestamps, duration, row count, and insert/update/delete counts.

Production values cannot be inspected from this repository. Any missing value
listed above will be reported by the shared sync engine in the affected
source's failure result; audit the Worker secrets before enabling the trigger.

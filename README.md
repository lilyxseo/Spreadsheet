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

## Production inventory schedule (Supabase Cron)

Supabase Cron is the scheduler only. It sends one authenticated HTTP request to
the Cloudflare Pages Function, where the existing shared services run
`kartu_stok`, `barang_masuk`, `barang_keluar`, `rpl`, and `bulky` sequentially.
Google Sheets access, hashing, per-source database locking,
`inventory_sync_status`, and sync history all remain in the Cloudflare sync
engine. The individual manual sync endpoints and the UI refresh path are
unchanged.

Create a Supabase Cron job with the following exact settings:

| Setting | Value |
| --- | --- |
| Type | HTTP request |
| Method | `POST` |
| URL | `https://<domain>/api/sync/inventory/run` |
| Header | `Authorization: Bearer <INVENTORY_SYNC_SECRET>` |
| Schedule | `*/30 * * * *` |

Replace `<domain>` with the production Cloudflare Pages custom domain. Set the
same strong `INVENTORY_SYNC_SECRET` value in the Pages production environment
and in the Supabase Cron request header. Do not put the real secret in this
repository. The endpoint returns HTTP 200 only when all five sources succeed;
it attempts the remaining sources and returns HTTP 500 if any source fails or
is skipped, so the Cron invocation exposes incomplete runs.

### Deployment and scheduler cutover

1. Deploy this repository as the existing Cloudflare Pages project. Do not
   deploy a separate Worker: this repository intentionally has no
   `wrangler.toml`, Scheduled Worker entry, Cron Trigger, or scheduler-only
   Durable Object.
2. Confirm the Pages production environment has `INVENTORY_SYNC_SECRET` plus
   the existing sync-engine variables (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `SHEET_ID_2026` or
   `GOOGLE_SHEET_ID`).
3. Before enabling Supabase Cron, delete/disable the former
   `wms-inventory-cron` Cloudflare Cron Trigger. Delete its scheduled Worker and
   scheduler-only `InventoryCronLock` Durable Object after confirming nothing
   else binds to it. These deployed resources are external state and are not
   removed by a Pages deployment.
4. Send a production smoke-test request with the bearer header to
   `POST https://<domain>/api/sync/inventory/run`, then verify all five sources
   in `inventory_sync_status` and sync history.
5. Create and enable the Supabase Cron HTTP job using the table above. Inspect
   its first invocation and the Cloudflare Pages Function logs. Confirm there
   is exactly one enabled schedule and no Cloudflare Cron Trigger before
   completing the cutover.

There are no Supabase Edge Functions and no sync implementation in Supabase.
Cloudflare Pages, Cloudflare API Functions, the shared inventory services, and
all individual manual sync endpoints remain deployed.

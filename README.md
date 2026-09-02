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

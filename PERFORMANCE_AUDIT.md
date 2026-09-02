# Inventory performance audit

## Cause and remediation

Before this change, `hydrateAllDataOnInit()` started five parallel loaders after login. Those loaders requested full Barang Masuk (21,808 rows), full Barang Keluar (15,669 rows), full Kartu Stok/RPL/BULKY, full movement history, and the 5,704-row BARCODE sheet. `preloadData()` also fetched Kartu Stok, RPL, and BULKY sequentially. Navigation then refreshed both transaction histories and table/dashboard rendering repeatedly scanned, filtered, indexed, and summarized those arrays on the browser main thread.

Startup now makes one `/api/dashboard-summary` request. Its response contains aggregate values and at most 50 recent Barang Masuk plus 50 recent Barang Keluar rows. BARCODE is loaded only by barcode functionality. Inventory module reads are lazy and paginated; browser startup therefore changes from at least 43,181 known rows (the two transaction tables plus BARCODE, before counting the other inventory tables/movement) to at most 100 inventory rows.

Barang Masuk and Barang Keluar navigation uses `page=1&limit=50`; paging and debounced search (`q`) request the backend. Kartu Stok, RPL, and BULKY frontend routes likewise default to 50 rows. Dashboard aggregates and unique-SKU/quantity calculations run in the server endpoint and the browser renders the compact result without rescanning full arrays. Manual inventory refresh continues to use the Supabase routes.

## Full-mode audit

The old frontend full-mode calls were:

- `/api/barang-masuk?mode=full` in startup hydration, background refresh, manual refresh, and source routing.
- `/api/barang-keluar?mode=full` in the same flows.
- `/api/kartu-stok?mode=full`, `/api/rpl?mode=full`, and `/api/bulky?mode=full` in source routing/preload.
- `/api/movement?mode=full` in startup hydration.

No frontend `mode=full` inventory call remains. The API handlers retain full-mode compatibility for non-startup administrative consumers and tests, but the application no longer invokes it.

## Source routing

- Kartu Stok: `/api/kartu-stok` (Supabase)
- Barang Masuk: `/api/barang-masuk` (Supabase)
- Barang Keluar: `/api/barang-keluar` (Supabase)
- RPL: `/api/rpl` (Supabase)
- BULKY: `/api/bulky` (Supabase)
- BARCODE: Google Sheets, lazy-loaded
- Balikan Store, Asset Store, Cycle Count, and other explicitly non-migrated operational modules retain their existing Google Sheets-backed endpoints.

The supplied production baseline was approximately 4,300 ms for preload and 900–2,200 ms browser long tasks. Automated tests verify routing and payload bounds; an authenticated production trace is still required to quote comparable wall-clock and click-task measurements after deployment.

## Pagination, authentication, and legacy-page follow-up

The first pagination pass retained a client-side page-size fallback of 25, rendered no current/total-page label, and only created page state for Barang Masuk/Keluar. Kartu Stok, RPL, and BULKY therefore had no navigable paginated pages. All five now have lazy page state, `Previous`/`Next`, current and total pages, API-total-based ranges, debounced server search, and current-page refresh. A page replaces its 50-row array rather than accumulating earlier pages.

The incorrect `50` totals came from treating the current response array length as the dataset size. Inventory page ranges now use `response.total`, while dashboard cards use `/api/dashboard-summary` totals. Page-only quantity and SKU values are explicitly labelled as page values.

Developer login was an intentional environment-credential path, but it required an additional enable flag, generated a non-standard token with a fallback signing secret, and discarded the persisted developer session outside preview environments. It now requires the explicit `DEV_USERNAME`, `DEV_PASSWORD`, and `DEV_SESSION_SECRET` server variables, returns a signed HMAC-SHA256 session, verifies the signature and expiry on protected APIs, and restores only a session created by an explicit successful login. Production and `unknown` environments still do not enable preview bypass or automatic login.

The legacy-page regression came from conflating the migrated inventory router with all Sheets data. The fixed routing keeps migrated object rows on Supabase while the following non-migrated modules retain their existing loaders independently: BARCODE (public Sheets values API), Balikan Store (authenticated backend Sheets proxy), Arsip, Asset Store, Cycle Count, Movement, Barang Reject, and Import PDF Transfer. A failed legacy source remains isolated to its own lazy page.

Manual refresh is now page-scoped. Migrated pages re-fetch only their current Supabase page and search; dashboard re-fetches only its summary. Legacy pages invoke their existing module loader. The refresh button does not call inventory sync endpoints or workers.

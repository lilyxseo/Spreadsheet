import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const supabaseSource = await readFile(new URL("../assets/js/supabase.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../assets/js/main.js", import.meta.url), "utf8");

test("startup session restoration has a finite timeout and logs failures", () => {
  assert.match(supabaseSource, /AUTH_STARTUP_TIMEOUT_MS\s*=\s*8000/);
  assert.match(supabaseSource, /withAuthTimeout\(supabase\.auth\.getSession\(\),\s*"supabase\.auth\.getSession\(\)"\)/);
  assert.match(supabaseSource, /console\.error\("supabase\.auth\.getSession\(\) failed", error\)/);
});

test("startup always exits auth checking and renders login after a restore failure", () => {
  assert.match(mainSource, /session=await restoreSession\(\)/);
  assert.match(mainSource, /catch\(err\)\{\s*console\.error\("Auth session check failed",err\);\s*user=null;\s*\}finally\{\s*authChecking=false;\s*renderAuthState\(\);/s);
});

test("authenticated user lookup cannot hold the startup splash indefinitely", () => {
  assert.match(mainSource, /await getAuthenticatedUser\(\)/);
  assert.doesNotMatch(mainSource.slice(mainSource.indexOf('window.addEventListener("DOMContentLoaded"'), mainSource.indexOf('window.addEventListener("auth:logout"')), /supabase\.auth\.getUser\(\)/);
});

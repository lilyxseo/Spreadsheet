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
  assert.match(mainSource, /catch\(err\)\{\s*console\.error\("Auth session check failed",err\);\s*user=null;\s*\}finally\{[\s\S]*?authChecking=false;\s*renderAuthState\(\);/s);
});

test("authenticated user lookup cannot hold the startup splash indefinitely", () => {
  assert.match(mainSource, /await getAuthenticatedUser\(\)/);
  const boot = mainSource.slice(mainSource.indexOf("async function bootApplication"), mainSource.indexOf('window.addEventListener("auth:logout"'));
  assert.doesNotMatch(boot, /await supabase\.auth\.getUser\(\)/);
});

test("startup still runs when module evaluation finishes after DOMContentLoaded", () => {
  assert.match(mainSource, /if\(document\.readyState==="loading"\)/);
  assert.match(mainSource, /window\.addEventListener\("DOMContentLoaded",bootApplication,\{once:true\}\)/);
  assert.match(mainSource, /else\{\s*void bootApplication\(\);/s);
});

test("preview bypass is decided before session restoration", () => {
  const boot = mainSource.slice(mainSource.indexOf("async function bootApplication"), mainSource.indexOf('window.addEventListener("auth:logout"'));
  assert.match(boot, /if\(isPreviewBypassLoginEnabled\(\)\)[\s\S]*?else\{\s*session=await restoreSession\(\)/);
});

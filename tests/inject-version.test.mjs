import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("build replaces an existing main.js version on every deployment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wms-version-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(new URL("../scripts/inject-version.js", import.meta.url), path.join(root, "scripts/inject-version.js"));
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(root, "index.html"), '<script type="module" src="/assets/js/main.js?v=old-build"></script>');

  execFileSync(process.execPath, ["scripts/inject-version.js"], { cwd: root, env: { ...process.env, CF_PAGES_COMMIT_SHA: "new-build" } });
  assert.match(fs.readFileSync(path.join(root, "index.html"), "utf8"), /main\.js\?v=new-build/);
});

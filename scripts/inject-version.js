import fs from "fs";

const version =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  Date.now().toString();

const filePath = "./index.html";

let html = fs.readFileSync(filePath, "utf8");

// The built HTML is committed/deployed more than once, so replacing only the
// initial placeholder leaves an old query string in every subsequent build.
// Always replace the current main-module URL, regardless of whether it still
// contains the placeholder or a version from an earlier deployment.
const mainModulePattern = /\/assets\/js\/main\.js(?:\?v=[^"']*)?/g;
if (!mainModulePattern.test(html)) throw new Error("main.js module tag not found");
html = html.replace(mainModulePattern, `/assets/js/main.js?v=${encodeURIComponent(version)}`);

fs.writeFileSync(filePath, html);

console.log("Version injected:", version);

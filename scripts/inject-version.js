import fs from "fs";

const version =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  Date.now().toString();

const filePath = "./index.html";

let html = fs.readFileSync(filePath, "utf8");

html = html.replaceAll("__APP_VERSION__", version);

if (html.includes("__APP_VERSION__")) {
  throw new Error("APP_VERSION injection failed");
}

fs.writeFileSync(filePath, html);

console.log("Version injected:", version);

const fs = require("node:fs");
const path = require("node:path");

const rootPackagePath = path.resolve(__dirname, "../../package.json");
const appPackagePath = path.resolve(
  __dirname,
  "../../release/app/package.json",
);
const rootVersion = JSON.parse(fs.readFileSync(rootPackagePath, "utf8")).version;
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, "utf8"));

if (!rootVersion) {
  throw new Error(`Missing version in ${rootPackagePath}`);
}

if (appPackage.version !== rootVersion) {
  appPackage.version = rootVersion;
  fs.writeFileSync(appPackagePath, `${JSON.stringify(appPackage, null, 2)}\n`);
  console.log(`Updated release/app version to ${rootVersion}`);
}

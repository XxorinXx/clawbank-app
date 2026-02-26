/**
 * Patches @sqds/smart-account package.json to add "types" to exports.
 * The published SDK omits the types condition in its exports map,
 * which breaks TypeScript moduleResolution: "Bundler".
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "node_modules", "@sqds", "smart-account", "package.json");

if (!existsSync(pkgPath)) process.exit(0);

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

if (pkg.exports?.["."] && !pkg.exports["."].types) {
  pkg.exports["."] = {
    types: "./lib/index.d.ts",
    ...pkg.exports["."],
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

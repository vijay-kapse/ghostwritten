// Copies scanner/signatures.json (or the fixture copy when scanner/ is absent) to
// lib/signatures.generated.json so the web build never imports outside web/ directly.
// Runs before dev, build and test.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const scannerDir = process.env.GHOSTWRITTEN_SCANNER_DIR ?? path.join(web, "..", "scanner");
const real = path.join(scannerDir, "signatures.json");
const fixture = path.join(web, "fixtures", "signatures.json");
const useReal = existsSync(real);
const signatures = JSON.parse(readFileSync(useReal ? real : fixture, "utf8"));
writeFileSync(
  path.join(web, "lib", "signatures.generated.json"),
  JSON.stringify({ source: useReal ? "scanner" : "fixture", signatures }, null, 1) + "\n",
);
console.log(`signatures: ${useReal ? "scanner/signatures.json" : "fixtures/signatures.json (sample copy)"}`);

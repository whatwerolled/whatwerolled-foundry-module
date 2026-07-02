// Extract the current version's section from CHANGELOG.md into RELEASE_BODY.md,
// used as the GitHub release body (and thus the Foundry "Notes URL"). Keeps
// release notes GM-readable instead of auto-generated commit/PR titles.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.VERSION;
const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");

const out = [];
let capture = false;
for (const line of lines) {
  if (/^## /.test(line)) {
    if (capture) break; // reached the next version — stop
    capture = line.trim() === `## ${version}`;
    continue;
  }
  if (capture) out.push(line);
}

const body = out.join("\n").trim() || `Release ${version}.`;
writeFileSync("RELEASE_BODY.md", body + "\n");
console.log(body);

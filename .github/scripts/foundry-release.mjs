// Lists the just-published version on foundryvtt.com via the Package Release API
// (https://foundryvtt.com/article/package-release-api/) so we never add the
// version row by hand. Runs after the GitHub release exists, so the manifest URL
// resolves. No-op when FOUNDRY_RELEASE_TOKEN isn't set (forks / secret missing).
import { readFileSync } from "node:fs";

const token = process.env.FOUNDRY_RELEASE_TOKEN;
if (!token) {
  console.log("FOUNDRY_RELEASE_TOKEN not set — skipping foundryvtt.com listing.");
  process.exit(0);
}

const version = process.env.VERSION;
const repo = process.env.REPO; // "owner/name"
const { id, compatibility } = JSON.parse(readFileSync("src/module.json", "utf8"));

const body = {
  id,
  release: {
    version,
    manifest: `https://github.com/${repo}/releases/download/${version}/module.json`,
    notes: `https://github.com/${repo}/releases/tag/${version}`,
    compatibility: {
      minimum: compatibility.minimum,
      verified: compatibility.verified,
      ...(compatibility.maximum ? { maximum: compatibility.maximum } : {}),
    },
  },
};

const res = await fetch("https://foundryvtt.com/_api/packages/release_version/", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify(body),
});
console.log(`foundryvtt.com release_version → ${res.status}: ${await res.text()}`);
if (!res.ok) process.exit(1);

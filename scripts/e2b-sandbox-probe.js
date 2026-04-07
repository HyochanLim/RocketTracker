/**
 * Minimal E2B connectivity probe.
 * node scripts/e2b-sandbox-probe.js
 */
const fs = require("fs");
const path = require("path");

function readE2bKey() {
  const env = process.env.E2B_API_KEY && String(process.env.E2B_API_KEY).trim();
  if (env) return env;
  const p = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(p)) return "";
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (t.slice(0, i).trim() !== "E2B_API_KEY") continue;
    return t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return "";
}

(async () => {
  const key = readE2bKey();
  if (!key) {
    console.log("No E2B_API_KEY — probe skipped.");
    process.exit(0);
  }
  try {
    const { Sandbox } = await import("@e2b/code-interpreter");
    const box = await Sandbox.create({ apiKey: key, timeoutMs: 120000 });
    const ex = await box.runCode("print(123)");
    console.log("E2B probe OK", { hasError: !!ex.error, logs: ex.logs });
  } catch (e) {
    console.error("E2B probe FAIL", e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();

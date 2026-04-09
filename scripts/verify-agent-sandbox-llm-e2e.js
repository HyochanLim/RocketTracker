const fs = require("fs");
const path = require("path");

const { runSandboxChatSession } = require("../logic/aiAgent/e2b-chat.cjs");

function loadAiAgentConfig() {
  try {
    return require("../config/ai-agent")();
  } catch {
    return null;
  }
}

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

const SAMPLES = [
  [0.0, 1.0, 2.0, 5.2],
  [0.5, 2.0, 3.0, 8.1],
  [1.0, 3.0, 1.0, 7.3],
  [1.5, 4.0, 4.0, 12.0],
  [2.0, 5.0, 2.0, 10.5],
];

const USER_PROMPT = [
  "비행 보조 테스트야. 아래는 (t, x, y, z) 샘플 5개야.",
  "",
  JSON.stringify({ format: "(t,x,y,z)", samples: SAMPLES }),
  "",
  "파이썬으로 z를 t,x,y에 대한 다중 선형회귀로 적합해 줘.",
  "최종 답에는: 절편·계수, R², 표본별 실제값/예측값/잔차를 짧게 정리해 줘.",
  "내부 저장 경로는 언급하지 마.",
].join("\n");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const cfg = loadAiAgentConfig();
  const e2b = readE2bKey();

  if (!cfg || !cfg.apiKey || !cfg.endpoint || !cfg.model) {
    console.error(
      "FAIL: set AI_API_KEY, AI_ENDPOINT, and AI_MODEL in `.env` (override `env` defaults).",
    );
    process.exit(1);
  }
  if (!e2b) {
    console.error("FAIL: set E2B_API_KEY in .env or environment.");
    process.exit(1);
  }

  console.log("Config: endpoint + model OK (key present). E2B key present.");
  if (dry) {
    console.log("Dry-run only. Prompt preview:\n---\n" + USER_PROMPT.slice(0, 500) + "\n---");
    process.exit(0);
  }

  console.log("Calling runSandboxChatSession (2 LLM rounds if code runs)…");
  const flightJson = JSON.stringify({
    note: "verify-agent-sandbox-llm-e2e tiny payload",
    samples: SAMPLES,
  });

  const out = await runSandboxChatSession(
    "verify-agent-e2e-user",
    {
      apiKey: String(cfg.apiKey).trim(),
      endpoint: String(cfg.endpoint).trim(),
      model: String(cfg.model).trim(),
    },
    [{ role: "user", content: USER_PROMPT }],
    flightJson,
    "verify-agent-e2e-filekey",
  );

  console.log("\n========== FINAL TEXT (first 2500 chars) ==========\n");
  console.log(String(out.text || "").slice(0, 2500));
  if (String(out.text || "").length > 2500) console.log("\n… (truncated)");

  console.log("\n========== result.json (summary) ==========");
  if (out.result == null) {
    console.log("(null — model may not have written result.json)");
  } else {
    try {
      console.log(JSON.stringify(out.result, null, 2).slice(0, 4000));
      if (JSON.stringify(out.result).length > 4000) console.log("\n… (truncated)");
    } catch {
      console.log(String(out.result));
    }
  }

  console.log("\n========== artifacts ==========");
  console.log("count:", Array.isArray(out.artifacts) ? out.artifacts.length : 0);

  const text = String(out.text || "");
  const badPath = /\/home\/user|result\.json|artifacts\.json/i.test(text);
  if (badPath) {
    console.warn("\nWARN: final text mentions internal paths — tighten follow-up prompt if this persists.");
  }

  if (text.length < 40) {
    console.error("\nFAIL: final answer too short.");
    process.exit(1);
  }

  const hasRegressionCue =
    /R²|R\^2|r2|회귀|계수|절편|coefficient|intercept|residual|예측|잔차/i.test(text) ||
    (out.result && /r2|R2|coef|predict/i.test(JSON.stringify(out.result)));
  if (!hasRegressionCue) {
    console.warn("\nWARN: output might not look like regression — review manually.");
  }

  console.log("\nPASS: pipeline returned a substantive reply. Spot-check numbers above.");
}

main().catch((e) => {
  console.error("FAIL:", e && e.stack ? e.stack : e);
  process.exit(1);
});

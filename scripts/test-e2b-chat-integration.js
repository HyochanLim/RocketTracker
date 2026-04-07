/**
 * Manual integration checks for logic/aiAgent/e2b-chat.cjs
 * Run: node scripts/test-e2b-chat-integration.js
 */
const fs = require("fs");
const path = require("path");

const { runSandboxChatSession } = require("../logic/aiAgent/e2b-chat.cjs");

const MOCK_LLM_URL = "http://mock";

function readE2bKeyFromEnvFile() {
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

/**
 * @param {() => object} bodyFactory - called per LLM request; use a counter inside for multi-turn mocks
 */
function installMockLlmFetch(origFetch, bodyFactory) {
  global.fetch = async (url, init) => {
    const u = String(url || "");
    if (u === MOCK_LLM_URL || u.startsWith(`${MOCK_LLM_URL}/`)) {
      const body = typeof bodyFactory === "function" ? bodyFactory() : bodyFactory;
      return {
        ok: true,
        text: async () => JSON.stringify(body),
      };
    }
    return origFetch(url, init);
  };
}

async function testNoPythonPath() {
  const origFetch = global.fetch;
  installMockLlmFetch(origFetch, () => ({ choices: [{ message: { content: "Hello without code." } }] }));
  try {
    const r = await runSandboxChatSession(
      "test-user-mock",
      { endpoint: MOCK_LLM_URL, apiKey: "k", model: "m" },
      [{ role: "user", content: "hi" }],
      "{}",
      "file-1",
    );
    if (r.text !== "Hello without code.") throw new Error("text mismatch");
    if (r.result !== null) throw new Error("result should be null");
    if (!Array.isArray(r.artifacts) || r.artifacts.length !== 0) throw new Error("artifacts should be []");
    console.log("OK: no-python path", Object.keys(r));
  } finally {
    global.fetch = origFetch;
  }
}

async function testPythonPathIfE2b() {
  const key = (process.env.E2B_API_KEY && String(process.env.E2B_API_KEY).trim()) || readE2bKeyFromEnvFile();
  if (!key) {
    console.log("SKIP: E2B_API_KEY not set — real sandbox not exercised");
    return;
  }

  const py = [
    "import json, os",
    'os.makedirs("/home/user/artifacts", exist_ok=True)',
    'open("/home/user/result.json","w").write(json.dumps({"from_sandbox": True, "n": 42}))',
    'print("stdout-ok")',
  ].join("\n");

  const llmContent = `Exec test.\n\n\`\`\`python\n${py}\n\`\`\``;

  const origFetch = global.fetch;
  let llmCall = 0;
  installMockLlmFetch(origFetch, () => {
    llmCall += 1;
    if (llmCall === 1) return { choices: [{ message: { content: llmContent } }] };
    return { choices: [{ message: { content: "Final: sandbox n=42, stdout had stdout-ok." } }] };
  });
  try {
    const r = await runSandboxChatSession(
      "test-user-e2b",
      { endpoint: MOCK_LLM_URL, apiKey: "k", model: "m" },
      [{ role: "user", content: "run" }],
      JSON.stringify({ records: [] }),
      "file-e2b-1",
    );
    if (!String(r.text || "").includes("n=42")) {
      throw new Error("follow-up LLM text should reflect final interpretation");
    }
    if (!r.result || r.result.from_sandbox !== true || r.result.n !== 42) {
      throw new Error(`bad result.json: ${JSON.stringify(r.result)}`);
    }
    console.log("OK: e2b python + result.json", { result: r.result, artifacts: (r.artifacts || []).length });
  } finally {
    global.fetch = origFetch;
  }
}

(async () => {
  await testNoPythonPath();
  await testPythonPathIfE2b();
})().catch((e) => {
  console.error("FAIL:", e && e.stack ? e.stack : e);
  process.exit(1);
});

/**
 * E2B 샌드박스: 데이터 파일 올린 뒤 runCode 로 OpenAI 호출
 * @see https://e2b.dev/docs/code-interpreting/analyze-data-with-ai
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const sandboxesByUserId = new Map();
const TIMEOUT_MS = 60 * 60 * 1000;

function e2bApiKey() {
  const env = process.env.E2B_API_KEY && String(process.env.E2B_API_KEY).trim();
  if (env) return env;
  const p = path.join(repoRoot, ".env");
  if (!fs.existsSync(p)) return "";
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    if (t.slice(0, i).trim() !== "E2B_API_KEY") continue;
    let v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    return v;
  }
  return "";
}

const OPENAI_CALL_PY = `
import json, os, urllib.request
with open("/home/user/openai_messages.json", encoding="utf-8") as f:
    messages = json.load(f)
body = {"model": os.environ["OPENAI_MODEL"], "messages": messages, "max_completion_tokens": 1200}
req = urllib.request.Request(
    os.environ["OPENAI_CHAT_URL"],
    data=json.dumps(body).encode("utf-8"),
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["OPENAI_API_KEY"]},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as resp:
    out = json.loads(resp.read().decode("utf-8"))
print(out["choices"][0]["message"].get("content") or "")
`.trim();

async function runSandboxChatSession(userId, openaiCfg, openAiMessages, aiParsedDataJson) {
  const uid = String(userId || "").trim();
  const key = e2bApiKey();
  if (!key) throw new Error("E2B_API_KEY missing");

  let box = sandboxesByUserId.get(uid);
  if (!box) {
    const { Sandbox } = await import("@e2b/code-interpreter");
    box = await Sandbox.create({
      apiKey: key,
      envs: {
        OPENAI_API_KEY: String(openaiCfg.apiKey).trim(),
        OPENAI_CHAT_URL: String(openaiCfg.endpoint).trim(),
        OPENAI_MODEL: String(openaiCfg.model).trim(),
      },
      timeoutMs: TIMEOUT_MS,
    });
    sandboxesByUserId.set(uid, box);
  }

  await box.files.write("/home/user/ai_parsed_data.json", aiParsedDataJson || "{}");
  await box.files.write("/home/user/openai_messages.json", JSON.stringify(openAiMessages));

  const exec = await box.runCode(OPENAI_CALL_PY);
  if (exec.error) {
    throw new Error(exec.error.message || String(exec.error));
  }
  const out = (exec.logs && exec.logs.stdout && exec.logs.stdout.join("\n")) || "";
  return out.trim();
}

module.exports = { runSandboxChatSession };

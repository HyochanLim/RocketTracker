const fs = require("fs");
const path = require("path");

const USER_AGENT_SYSTEM_PROMPT = "";

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

function messagesWithSystem(openAiMessages) {
  const list = Array.isArray(openAiMessages) ? openAiMessages.filter(Boolean) : [];
  const sys = String(USER_AGENT_SYSTEM_PROMPT || "").trim();
  if (!sys) return list;
  const rest = list.filter((m) => m.role !== "system");
  return [{ role: "system", content: sys }].concat(rest);
}

function extractPythonBlocks(text) {
  const re = /```(?:python|py)\s*([\s\S]*?)```/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const code = m[1].trim();
    if (code) out.push(code);
  }
  return out;
}

function stripPythonBlocks(text) {
  return String(text || "")
    .replace(/```(?:python|py)\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function openAiComplete(cfg, messages) {
  const res = await fetch(String(cfg.endpoint).trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${String(cfg.apiKey).trim()}`,
    },
    body: JSON.stringify({
      model: String(cfg.model).trim(),
      messages,
      max_completion_tokens: 1200,
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status}): ${raw.slice(0, 400)}`);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI response was not JSON.");
  }
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return String(content == null ? "" : content).trim();
}

async function getOrCreateSandbox(userId) {
  const uid = String(userId || "").trim();
  const key = e2bApiKey();
  if (!key) throw new Error("E2B_API_KEY missing (needed to run Python).");
  let box = sandboxesByUserId.get(uid);
  if (!box) {
    const { Sandbox } = await import("@e2b/code-interpreter");
    box = await Sandbox.create({ apiKey: key, timeoutMs: TIMEOUT_MS });
    sandboxesByUserId.set(uid, box);
  }
  return box;
}

async function runPythonInSandbox(userId, code, aiParsedDataJson) {
  const box = await getOrCreateSandbox(userId);
  await box.files.write("/home/user/ai_parsed_data.json", aiParsedDataJson || "{}");
  const exec = await box.runCode(code);
  if (exec.error) throw new Error(exec.error.message || String(exec.error));
  const stdout = (exec.logs && exec.logs.stdout && exec.logs.stdout.join("\n")) || "";
  const stderr = (exec.logs && exec.logs.stderr && exec.logs.stderr.join("\n")) || "";
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function runSandboxChatSession(userId, openaiCfg, openAiMessages, aiParsedDataJson) {
  const messages = messagesWithSystem(openAiMessages);
  if (messages.length === 0) throw new Error("No messages.");

  const reply = await openAiComplete(openaiCfg, messages);
  const blocks = extractPythonBlocks(reply);
  if (blocks.length === 0) return reply;

  let out = stripPythonBlocks(reply);
  for (let i = 0; i < blocks.length; i += 1) {
    const { stdout, stderr } = await runPythonInSandbox(userId, blocks[i], aiParsedDataJson);
    const tail = [stdout && `Output:\n${stdout}`, stderr && `Stderr:\n${stderr}`].filter(Boolean).join("\n\n") || "(no output)";
    out = (out ? `${out}\n\n` : "") + tail;
  }
  return out.trim();
}

module.exports = { runSandboxChatSession, USER_AGENT_SYSTEM_PROMPT };

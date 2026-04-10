const fs = require("fs");
const path = require("path");

/** Token-tight: rules only; user language for natural replies. */
const USER_AGENT_SYSTEM_PROMPT = String(`
Flight/time-series assistant in a web chat.

To the user: answers in their language—numbers, coefficients, R², residuals, meaning. Never mention server paths, filenames, or “saved to…”.

**User perspective:** You cannot see their screen, but **they** can: this app shows **Cesium 3D on the left** with their **flight trajectory** once they open the map and load data. Treat requests like “the path on the left”, “on the globe”, “that orbit” as referring to **that same loaded flight**—use **/home/user/flight_data.json** (and your code), not a generic empty chat. Do **not** ask them to re-upload or paste raw JSON/“the graph data” when the session already has flight data; only ask for extra data if they explicitly pasted something new or there is no usable series. Write **summary** and **vizCommands** as if explaining to someone **looking at the map** next to the chat.

Code: only inside \`\`\`python\`\`\` (one block unless you must split runs). Optional short prose first, then fenced code. No executable lines outside fences.

If the user request is ambiguous or could change flight data, ask 2–3 short multiple-choice clarifications before writing code. Exception: simple requests to **annotate the 3D map** (marker/label at apogee or max altitude, fly camera, highlight)—do **not** stall on choices; compute from loaded JSON and run Python with **vizCommands** in one go (default: keep existing trajectory, add marker + altitude label, optional flyTo). For destructive edits (smoothing, outlier removal, re-scaling units), prefer describing assumptions and offering a safe default with a confirm phrase.

**Map vs code:** This app applies map changes automatically from your Python **result.json** via **vizCommands**. Never tell the user to paste **Cesium JS / JavaScript / “add this to your project”** or open DevTools. Never say you cannot place markers “because you can’t click their screen”—after your Python runs, the client applies **vizCommands** to their live viewer. Your job is Python that writes **summary** + **vizCommands** (and optional plots).

Sandbox inputs (for code only; never cite): /home/user/flight_data.json, /home/user/ai_parsed_data.json. Use chat-pasted data inline when that’s what they gave.

Python must write /home/user/result.json: object with required "summary" (plain text, mirrors findings) and optional tables/metrics/series. Plots → files under /home/user/artifacts/ plus /home/user/artifacts.json: {"artifacts":[{"path","mime","name"}]}. Stdout: brief recap, no paths.

Optional "vizCommands": array of objects for the Cesium map (no file paths in summary). Each item must include "op" or "type". The client also accepts LLM-style aliases: coordinates in "point": {x,y} (lon/lat), "label": {text}, "style": {color, radius}. Preferred canonical form remains lon/lat on the command object. Supported ops:
- {"op":"clearOverlays"} — remove agent-drawn overlays (viz-* only).
- {"op":"addPoint","id":"apogee","lon":...,"lat":...,"heightM":...,"label":"Apogee","color":"#hex","pixelSize":14}
- {"op":"addPolyline","id":"seg1","positions":[{"lon","lat","heightM?"},...],"width":3,"color":"#hex"}
- {"op":"addPolygon","id":"zone1","positions":[{"lon","lat"},...],"fillColor":"#hex","fillAlpha":0.35}
- {"op":"flyTo","lon","lat","heightM":0,"cameraHeightM":8000,"duration":2,"headingDeg":0,"pitchDeg":-55}
- {"op":"setResolutionScale","scale":0.5} — render scale 0.25–2.0 (performance vs sharpness).
- {"op":"setTrajectoryPointBudget","maxVertices":8000} — redraw trajectory polyline with up to ~maxVertices points (200–200000).
- {"op":"setTrajectoryStyle","width":3,"color":"#hex","alpha":0.95}
- {"op":"removeEntity","id":"apogee"}
Use vizCommands when the user asks to mark something on the globe, move the camera, change trajectory appearance, or adjust map resolution.

If no code needed: normal reply, no fences.
`).trim();

/** Second LLM call after sandbox. */
const USER_AGENT_FOLLOWUP_SYSTEM_PROMPT = String(`
Sandbox finished running your prior Python. The next user message is execution output (stdout/stderr/JSON).

Reply in the user’s question language: interpret numbers and outcomes only. No markdown fences, no Python. Never mention /home/user, result.json, artifacts. On error: what failed and what to try next—in words only.

If the run succeeded and the user asked for map markers/camera: say briefly that the 3D view on their side should update (marker/label/camera)—they are looking at Cesium next to this chat—do **not** offer standalone Cesium/JavaScript for them to paste manually.
`).trim();

const repoRoot = path.join(__dirname, "..", "..");
const sandboxesByUserId = new Map();
const datasetKeyByUserId = new Map();
const TIMEOUT_MS = 60 * 60 * 1000;
/** Single runCode execution timeout (ms); E2B default is 60s. */
const RUN_CODE_TIMEOUT_MS = 120_000;
/** Max chars of result.json embedded in the follow-up LLM message */
const RESULT_JSON_LLM_MAX_CHARS = 14_000;

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

function truncateForLLM(s, maxLen) {
  const t = String(s || "");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}\n… (truncated, ${t.length} chars total)`;
}

function buildSandboxToolMessage(execChunks) {
  const parts = [
    "The following is the outcome of executing your Python in the sandbox. Use it to compose the final answer for the user.",
    "",
  ];
  for (let i = 0; i < execChunks.length; i += 1) {
    const c = execChunks[i];
    parts.push(`--- Run ${i + 1} ---`);
    parts.push(`stdout:\n${c.stdout || "(empty)"}`);
    parts.push(`stderr:\n${c.stderr || "(empty)"}`);
    if (c.resultJson != null) {
      parts.push(`result (JSON):\n${c.resultJson}`);
    } else {
      parts.push("result (JSON): (none or unreadable)");
    }
    parts.push("");
  }
  return parts.join("\n");
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
      max_completion_tokens: 2800,
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

async function ensureDatasetInSandbox(userId, datasetKey, aiParsedDataJson) {
  const box = await getOrCreateSandbox(userId);
  const uid = String(userId || "").trim();
  const key = String(datasetKey || "").trim() || "default";
  const prev = datasetKeyByUserId.get(uid) || "";
  if (prev === key) return box;

  const payload = aiParsedDataJson || "{}";
  await box.files.write("/home/user/flight_data.json", payload);
  await box.files.write("/home/user/ai_parsed_data.json", payload);
  datasetKeyByUserId.set(uid, key);
  return box;
}

async function readJsonIfExists(box, p) {
  try {
    const raw = await box.files.read(p);
    const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
    const t = String(text || "").trim();
    if (!t) return null;
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function readBase64IfExists(box, p) {
  try {
    const raw = await box.files.read(p);
    const buf = typeof raw === "string" ? Buffer.from(raw, "utf-8") : Buffer.from(raw);
    if (!buf || buf.length === 0) return null;
    return buf.toString("base64");
  } catch {
    return null;
  }
}

async function runPythonInSandbox(userId, datasetKey, code, aiParsedDataJson) {
  const box = await ensureDatasetInSandbox(userId, datasetKey, aiParsedDataJson);
  const exec = await box.runCode(code, { timeoutMs: RUN_CODE_TIMEOUT_MS });
  if (exec.error) throw new Error(exec.error.message || String(exec.error));
  const stdout = (exec.logs && exec.logs.stdout && exec.logs.stdout.join("\n")) || "";
  const stderr = (exec.logs && exec.logs.stderr && exec.logs.stderr.join("\n")) || "";

  const result = await readJsonIfExists(box, "/home/user/result.json");
  const artifactsIndex = await readJsonIfExists(box, "/home/user/artifacts.json");
  const artifactsList = artifactsIndex && Array.isArray(artifactsIndex.artifacts) ? artifactsIndex.artifacts : [];
  const artifacts = [];
  for (let i = 0; i < artifactsList.length; i += 1) {
    const a = artifactsList[i];
    if (!a || typeof a !== "object") continue;
    const ap = String(a.path || "").trim();
    if (!ap) continue;
    const mime = String(a.mime || "").trim() || "application/octet-stream";
    const name = String(a.name || path.basename(ap)).trim() || path.basename(ap);
    const base64 = await readBase64IfExists(box, ap);
    if (!base64) continue;
    artifacts.push({ name, mime, base64 });
  }

  return { stdout: stdout.trim(), stderr: stderr.trim(), result, artifacts };
}

async function runSandboxChatSession(userId, openaiCfg, openAiMessages, aiParsedDataJson, datasetKey) {
  const messages = messagesWithSystem(openAiMessages);
  if (messages.length === 0) throw new Error("No messages.");

  const reply1 = await openAiComplete(openaiCfg, messages);
  const blocks = extractPythonBlocks(reply1);
  if (blocks.length === 0) {
    return { text: reply1, result: null, artifacts: [], executedCode: null };
  }

  const execChunks = [];
  let lastResult = null;
  let lastArtifacts = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const { stdout, stderr, result, artifacts } = await runPythonInSandbox(userId, datasetKey, blocks[i], aiParsedDataJson);
    let resultJson = "";
    try {
      resultJson = result == null ? "" : truncateForLLM(JSON.stringify(result, null, 2), RESULT_JSON_LLM_MAX_CHARS);
    } catch {
      resultJson = truncateForLLM(String(result), RESULT_JSON_LLM_MAX_CHARS);
    }
    execChunks.push({ stdout: stdout || "", stderr: stderr || "", resultJson });
    if (result != null) lastResult = result;
    if (Array.isArray(artifacts) && artifacts.length) lastArtifacts = artifacts;
  }

  const toolUserContent = buildSandboxToolMessage(execChunks);
  const hist = Array.isArray(openAiMessages) ? openAiMessages.filter((m) => m && (m.role === "user" || m.role === "assistant")) : [];
  const followupMessages = [
    { role: "system", content: USER_AGENT_FOLLOWUP_SYSTEM_PROMPT },
  ]
    .concat(hist)
    .concat([
      { role: "assistant", content: reply1 },
      { role: "user", content: toolUserContent },
    ]);

  const reply2 = await openAiComplete(openaiCfg, followupMessages);
  let text = stripPythonBlocks(reply2).trim();

  const sum =
    lastResult &&
    typeof lastResult === "object" &&
    lastResult.summary != null &&
    String(lastResult.summary).trim()
      ? String(lastResult.summary).trim()
      : "";
  if (sum && (!text || text.length < 12 || !text.includes(sum.slice(0, Math.min(32, sum.length))))) {
    text = (text ? `${text}\n\n` : "") + sum;
  }

  const executedCode = blocks
    .map((b, i) => `# --- run ${i + 1} ---\n${String(b || "").trim()}`)
    .join("\n\n");

  return {
    text: text.trim(),
    result: lastResult,
    artifacts: lastArtifacts,
    executedCode: executedCode || null,
  };
}

module.exports = {
  runSandboxChatSession,
  runPythonInSandbox,
  USER_AGENT_SYSTEM_PROMPT,
  USER_AGENT_FOLLOWUP_SYSTEM_PROMPT,
};

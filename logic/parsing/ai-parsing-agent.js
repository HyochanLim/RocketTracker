const path = require("path");
const fsp = require("fs/promises");

const PROMPT_TEMPLATE = "Map flight rows to strict JSON schema. JSON only, minimal tokens.";

const RAW_FLIGHT_DATA_JSON = path.join(__dirname, "..", "aiAgent", "rawFlightData.json");
const RULES = [
  "JSON object only. No prose.",
  "Unknown -> null. No guessing.",
  "Keys only: mapping,records,warnings.",
  "mapping keys: time,latitude,longitude,altitude,x,y,pressure,status.",
  "record keys: timeSec,relTimeSec,latitude,longitude,altitude,x,y,pressure,status.",
  "Infer mapping from header semantics only.",
  "If unix ms, convert to sec.",
  "relTimeSec starts at first valid time = 0.",
  "warnings must be short.",
].join("\n");

function loadAgentConfig() {
  try {
    return require("../../config/ai-agent.local");
  } catch {
    return {};
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildDefaultResult(records) {
  return {
    ok: true,
    sourceCount: Array.isArray(records) ? records.length : 0,
    standardizedRecords: [],
    mapping: { time: null, latitude: null, longitude: null, altitude: null, x: null, y: null, pressure: null, status: null },
    warnings: [],
  };
}

function sanitizeMappingCandidate(candidate, availableKeys) {
  const valid = new Set((availableKeys || []).map((k) => String(k)));
  const safe = { time: null, latitude: null, longitude: null, altitude: null, x: null, y: null, pressure: null, status: null };
  if (!candidate || typeof candidate !== "object") return safe;
  Object.keys(safe).forEach((key) => {
    const value = candidate[key];
    if (typeof value === "string" && valid.has(value)) safe[key] = value;
  });
  return safe;
}

function standardizeRecords(records, mapping) {
  let baseTime = null;
  return records.map((row, index) => {
    const rawTime = mapping.time ? row[mapping.time] : null;
    const tNum = toNumber(rawTime);
    if (baseTime === null && tNum !== null) baseTime = tNum > 1000000000000 ? tNum / 1000 : tNum;
    const tSec = tNum === null ? index : tNum > 1000000000000 ? tNum / 1000 : tNum;
    const relSec = baseTime === null ? index : Math.max(0, tSec - baseTime);
    return {
      timeSec: tSec,
      relTimeSec: relSec,
      latitude: mapping.latitude ? toNumber(row[mapping.latitude]) : null,
      longitude: mapping.longitude ? toNumber(row[mapping.longitude]) : null,
      altitude: mapping.altitude ? toNumber(row[mapping.altitude]) : 0,
      x: mapping.x ? toNumber(row[mapping.x]) : null,
      y: mapping.y ? toNumber(row[mapping.y]) : null,
      pressure: mapping.pressure ? toNumber(row[mapping.pressure]) : null,
      status: mapping.status ? row[mapping.status] || null : null,
      raw: row,
    };
  });
}

async function maybeCallLLM(records, meta) {
  const cfg = loadAgentConfig();
  if (!cfg || !cfg.apiKey || !cfg.endpoint || !cfg.model) return null;
  const headerKeys = Object.keys(records[0] || {});
  const userPrompt = `${PROMPT_TEMPLATE}\n\n${RULES}\n\nFilename: ${meta && meta.filename ? meta.filename : "unknown"}\nHeader keys: ${JSON.stringify(headerKeys)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(cfg.timeoutMs || 20000));
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: "Return valid JSON only." }, { role: "user", content: userPrompt }],
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const text = payload?.choices?.[0]?.message?.content || null;
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseRowsWithAiAgent(records, options) {
  const result = buildDefaultResult(records);
  if (!Array.isArray(records) || records.length === 0) {
    result.warnings.push("No records to parse.");
    return result;
  }
  const availableKeys = Object.keys(records[0] || {});
  const llmPatch = await maybeCallLLM(records, options || {});
  const mapping = llmPatch?.mapping ? sanitizeMappingCandidate(llmPatch.mapping, availableKeys) : result.mapping;
  result.mapping = mapping;
  result.standardizedRecords = standardizeRecords(records, mapping);
  if ((!mapping.latitude || !mapping.longitude) && (!mapping.x || !mapping.y)) result.warnings.push("Coordinate mapping is incomplete.");
  if (llmPatch && typeof llmPatch === "object") {
    result.llm = llmPatch;
    result.warnings.push("Mapping selected by AI.");
  } else {
    result.warnings.push("AI mapping unavailable.");
  }

  try {
    await fsp.mkdir(path.dirname(RAW_FLIGHT_DATA_JSON), { recursive: true });
    await fsp.writeFile(
      RAW_FLIGHT_DATA_JSON,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          ok: result.ok,
          sourceCount: result.sourceCount,
          mapping: result.mapping,
          warnings: result.warnings,
          standardizedRecords: result.standardizedRecords,
          llm: result.llm || null,
        },
        null,
        2
      ),
      "utf-8"
    );
  } catch (_) {
    /* persistence must not break upload/rebuild */
  }

  return result;
}

module.exports = { parseRowsWithAiAgent };

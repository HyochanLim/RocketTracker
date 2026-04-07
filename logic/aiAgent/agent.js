/**
 * Per-account last AI-parsed JSON (object). Keys are userId strings.
 * Normal storage is a record array, often wrapped as `{ records: [...] }`.
 * In-process memory only; cleared on restart.
 */
const ai_parsed_data = Object.create(null);

/** @param {unknown} parsed Result of JSON.parse or a record array */
function storeAiParsedData(userId, parsed) {
  const id = String(userId || "").trim();
  if (!id || parsed == null) return;
  if (Array.isArray(parsed)) {
    ai_parsed_data[id] = { records: parsed };
  } else if (typeof parsed === "object") {
    ai_parsed_data[id] = parsed;
  }
}

function getAiParsedData(userId) {
  const id = String(userId || "").trim();
  return id ? ai_parsed_data[id] || null : null;
}

module.exports = {
  ai_parsed_data,
  storeAiParsedData,
  getAiParsedData,
};

/** @type {Map<string, string>} userId → repo 기준 상대 경로(posix) */
const pathsByUserId = new Map();

/**
 * 계정별 마지막 AI 파싱 JSON (객체). 키 = userId 문자열.
 * 표준 저장은 레코드 배열이므로 보통 `{ records: [...] }`.
 */
const ai_parsed_data = Object.create(null);

/** @param {unknown} parsed JSON.parse 결과 또는 레코드 배열 */
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

function setAiParsedJsonRelativePath(relPath, userId) {
  if (!relPath || String(relPath).includes("..")) return;
  const id = String(userId || "").trim();
  if (!id) return;
  pathsByUserId.set(id, String(relPath).replace(/\\/g, "/"));
}

function getAiParsedJsonRelativePath(userId) {
  const id = String(userId || "").trim();
  return id ? pathsByUserId.get(id) || "" : "";
}

/** 프로세스 메모리에만 유지. 서버 재시작 후에는 복구하지 않음. */
function saveLastParsedJsonPath(relPath, extra) {
  const userId = extra && extra.userId != null ? String(extra.userId).trim() : "";
  if (userId) setAiParsedJsonRelativePath(relPath, userId);
}

module.exports = {
  ai_parsed_data,
  storeAiParsedData,
  getAiParsedData,
  getAiParsedJsonRelativePath,
  setAiParsedJsonRelativePath,
  saveLastParsedJsonPath,
};

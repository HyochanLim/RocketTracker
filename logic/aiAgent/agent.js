/**
 * 계정별 마지막 AI 파싱 JSON (객체). 키 = userId 문자열.
 * 표준 저장은 레코드 배열이므로 보통 `{ records: [...] }`.
 * 프로세스 메모리만 사용; 재시작 시 비움.
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

module.exports = {
  ai_parsed_data,
  storeAiParsedData,
  getAiParsedData,
};

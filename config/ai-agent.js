/**
 * Single AI stack from process.env (never cached). Call each time so .env / Heroku load order cannot strand empty values.
 * Use: AI_ENDPOINT, AI_API_KEY, AI_MODEL, optional AI_TIMEOUT_MS.
 */

function trim(s) {
  return String(s || "").trim();
}

function loadAiAgentConfig() {
  const timeoutRaw = trim(process.env.AI_TIMEOUT_MS);
  const timeoutParsed = Number.parseInt(timeoutRaw, 10);
  const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : 20000;

  const model = trim(process.env.AI_MODEL);
  const endpoint = trim(process.env.AI_ENDPOINT);
  const apiKey = trim(process.env.AI_API_KEY);

  return {
    freeModel: model,
    proModel: model,
    model,
    endpoint,
    apiKey,
    timeoutMs,
  };
}

module.exports = loadAiAgentConfig;

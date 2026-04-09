/**
 * Single AI stack for agent + row mapping: one key, one endpoint, one model.
 * Primary env: AI_API_KEY, AI_ENDPOINT, AI_MODEL.
 * Legacy names (AI_FREE_*, AI_PRO_*, AI_MAPPING_MODEL) still work as fallbacks.
 */

function trim(s) {
  return String(s || "").trim();
}

function loadAiAgentConfig() {
  const timeoutRaw = trim(process.env.AI_TIMEOUT_MS);
  const timeoutParsed = Number.parseInt(timeoutRaw, 10);
  const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : 20000;

  const apiKey =
    trim(process.env.AI_API_KEY) ||
    trim(process.env.AI_FREE_API_KEY) ||
    trim(process.env.AI_PRO_API_KEY);

  const endpoint =
    trim(process.env.AI_ENDPOINT) ||
    trim(process.env.AI_FREE_ENDPOINT) ||
    trim(process.env.AI_PRO_ENDPOINT);

  const model =
    trim(process.env.AI_MODEL) ||
    trim(process.env.AI_MAPPING_MODEL) ||
    trim(process.env.AI_FREE_MODEL) ||
    trim(process.env.AI_PRO_MODEL);

  return {
    apiKey,
    endpoint,
    model,
    timeoutMs,
  };
}

module.exports = loadAiAgentConfig;

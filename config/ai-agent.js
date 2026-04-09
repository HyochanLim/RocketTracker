/**
 * AI settings — values come only from the environment (.env locally, Config Vars on Heroku).
 * No API keys are stored in this file.
 */

function trim(s) {
  return String(s || "").trim();
}

const timeoutRaw = trim(process.env.AI_TIMEOUT_MS);
const timeoutParsed = Number.parseInt(timeoutRaw, 10);
const timeoutMs = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : 20000;

module.exports = {
  freeModel: trim(process.env.AI_FREE_MODEL),
  proModel: trim(process.env.AI_PRO_MODEL),

  /** Flight table column → lat/lon mapping (parseRowsWithAiAgent). Defaults to AI_FREE_MODEL. */
  model: trim(process.env.AI_MAPPING_MODEL) || trim(process.env.AI_FREE_MODEL) || trim(process.env.AI_PRO_MODEL),

  endpoint:
    trim(process.env.AI_FREE_ENDPOINT) ||
    trim(process.env.AI_ENDPOINT) ||
    trim(process.env.AI_PRO_ENDPOINT),

  apiKey:
    trim(process.env.AI_FREE_API_KEY) ||
    trim(process.env.AI_API_KEY) ||
    trim(process.env.AI_PRO_API_KEY),

  timeoutMs,
};

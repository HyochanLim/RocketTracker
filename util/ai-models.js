function loadAiAgentConfig() {
  return require("../config/ai-agent")();
}

function resolveModels(cfg) {
  const model =
    String(process.env.AI_MODEL || "").trim() ||
    String(cfg.model || "").trim();
  return { freeModel: model, proModel: model };
}

/** Same endpoint/key for Explorer and Pro; tier only affects UI / entitlements elsewhere. */
function resolveProviderConfig(cfg) {
  const endpoint = String(process.env.AI_ENDPOINT || "").trim() || String(cfg.endpoint || "").trim();
  const apiKey = String(process.env.AI_API_KEY || "").trim() || String(cfg.apiKey || "").trim();
  const timeoutMsRaw = String(process.env.AI_TIMEOUT_MS || "").trim();
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : Number(cfg.timeoutMs);

  return {
    endpoint,
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
  };
}

function getModelForRequest(_isPro) {
  const cfg = loadAiAgentConfig();
  const { freeModel } = resolveModels(cfg);
  return freeModel;
}

function getModelLabels(isPro) {
  const cfg = loadAiAgentConfig();
  const { freeModel } = resolveModels(cfg);
  return {
    tierLabel: isPro ? "Pro" : "Explorer",
    modelLabel: freeModel || "",
  };
}

/** Back-compat with middlewares that only need the model name string. */
function getModelLabel() {
  const cfg = loadAiAgentConfig();
  return String(cfg.model || "").trim();
}

module.exports = {
  loadAiAgentConfig,
  resolveModels,
  resolveProviderConfig,
  getModelForRequest,
  getModelLabels,
  getModelLabel,
};

function loadAiAgentConfig() {
  return require("../config/ai-agent")();
}

function resolveModels(cfg) {
  const freeModel =
    String(process.env.AI_FREE_MODEL || "").trim() ||
    String(cfg.freeModel || "").trim() ||
    String(cfg.model || "").trim();
  const proModel =
    String(process.env.AI_PRO_MODEL || "").trim() ||
    String(cfg.proModel || "").trim() ||
    String(cfg.model || "").trim();
  return { freeModel, proModel };
}

function resolveProviderConfig(cfg, isPro) {
  const endpoint =
    String((isPro ? process.env.AI_PRO_ENDPOINT : process.env.AI_FREE_ENDPOINT) || "").trim() ||
    String(process.env.AI_ENDPOINT || "").trim() ||
    String(cfg.endpoint || "").trim();
  const apiKey =
    String((isPro ? process.env.AI_PRO_API_KEY : process.env.AI_FREE_API_KEY) || "").trim() ||
    String(process.env.AI_API_KEY || "").trim() ||
    String(cfg.apiKey || "").trim();
  const timeoutMsRaw =
    String((isPro ? process.env.AI_PRO_TIMEOUT_MS : process.env.AI_FREE_TIMEOUT_MS) || "").trim() ||
    String(process.env.AI_TIMEOUT_MS || "").trim();
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : Number(cfg.timeoutMs);

  return {
    endpoint,
    apiKey,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
  };
}

function getModelForRequest(isPro) {
  const cfg = loadAiAgentConfig();
  const { freeModel, proModel } = resolveModels(cfg);
  return isPro ? proModel : freeModel;
}

function getModelLabels(isPro) {
  const cfg = loadAiAgentConfig();
  const { freeModel, proModel } = resolveModels(cfg);
  return {
    tierLabel: isPro ? "Pro" : "Explorer",
    modelLabel: isPro ? proModel || "" : freeModel || "",
  };
}

module.exports = { loadAiAgentConfig, resolveModels, resolveProviderConfig, getModelForRequest, getModelLabels };


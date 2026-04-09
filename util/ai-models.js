function loadAiAgentConfig() {
  return require("../config/ai-agent")();
}

function getModelLabel() {
  const cfg = loadAiAgentConfig();
  return String(cfg.model || "").trim();
}

module.exports = { loadAiAgentConfig, getModelLabel };

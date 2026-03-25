const path = require("path");

/**
 * Badge registry (source of truth).
 * - Place SVGs in: public/assets/badges/<id>.svg
 * - Store only badge ids on the user document: user.badges = ["huge-supporter", ...]
 */
const BADGE_REGISTRY = {
  "huge-supporter": {
    id: "huge-supporter",
    label: "Huge Supporter",
    description: "Thank you for supporting the project.",
    svgFile: "huge-supporter.svg",
  },
};

function resolveBadges(badgeIds) {
  const ids = Array.isArray(badgeIds) ? badgeIds : [];
  const seen = new Set();
  const out = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = String(ids[i] || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const def = BADGE_REGISTRY[id];
    if (!def) continue;
    out.push({
      id: def.id,
      label: def.label,
      description: def.description || "",
      svgHref: `/public/assets/badges/${path.basename(def.svgFile)}`,
    });
  }

  return out;
}

module.exports = { BADGE_REGISTRY, resolveBadges };


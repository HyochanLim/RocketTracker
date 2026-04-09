const User = require("../models/user.model");
const { getModelLabels } = require("../util/ai-models");

async function attachEntitlements(req, res, next) {
  res.locals.isPro = false;
  res.locals.proUntil = null;
  res.locals.aiTierLabel = "Explorer";
  res.locals.aiModelLabel = "";

  if (!req.session || !req.session.uid) {
    return next();
  }

  try {
    const userDoc = await User.getById(req.session.uid);
    const isPro = User.isPro(userDoc);
    res.locals.isPro = isPro;
    res.locals.proUntil = userDoc && userDoc.proUntil ? userDoc.proUntil : null;
    const labels = getModelLabels(isPro);
    res.locals.aiTierLabel = labels.tierLabel;
    res.locals.aiModelLabel = labels.modelLabel;
    return next();
  } catch {
    return next();
  }
}

module.exports = attachEntitlements;


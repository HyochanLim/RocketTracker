function getSessionData(req) {
  const data = req.session.flashedData;
  req.session.flashedData = null;
  return data;
}

function flashDataToSession(req, data, action) {
  req.session.flashedData = data;
  req.session.save(action);
}

module.exports = { getSessionData, flashDataToSession };

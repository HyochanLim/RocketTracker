function getHome(req, res) {
  res.render("home/index");
}

function getAbout(req, res) {
  res.render("about/index");
}

function getProducts(req, res) {
  res.render("products/index");
}

function getPricing(req, res) {
  res.render("pricing/index", {
    paypalClientId: String(process.env.PAYPAL_CLIENT_ID || "").trim(),
    paypalCurrency: String(process.env.PAYPAL_PRO_CURRENCY || "USD").trim().toUpperCase(),
    paypalPrice: String(process.env.PAYPAL_PRO_PRICE || "10.00").trim(),
  });
}

function getResources(req, res) {
  res.render("resources/index");
}

function getContact(req, res) {
  res.render("contact/index");
}

function getDownload(req, res) {
  res.render("download/index");
}

module.exports = {
  getHome,
  getAbout,
  getProducts,
  getPricing,
  getResources,
  getContact,
  getDownload,
};

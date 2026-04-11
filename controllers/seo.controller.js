const { publicSiteUrl } = require("../util/env-config");

function getRobots(req, res) {
  const base = publicSiteUrl();
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /tracker",
    "Disallow: /profile",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /billing",
  ];
  if (base) {
    lines.push("Sitemap: " + base + "/sitemap.xml");
  }
  res.type("text/plain; charset=utf-8");
  res.send(lines.join("\n"));
}

function getSitemap(req, res) {
  const base = publicSiteUrl();
  if (!base) {
    return res.status(404).type("text/plain; charset=utf-8").send("Sitemap unavailable. Set PUBLIC_SITE_URL.");
  }
  const paths = ["/", "/about", "/products", "/pricing", "/resources", "/contact", "/download"];
  const day = new Date().toISOString().slice(0, 10);
  const urls = paths
    .map(function (p) {
      const priority = p === "/" ? "1.0" : "0.8";
      return (
        "  <url>\n    <loc>" +
        base +
        p +
        "</loc>\n    <lastmod>" +
        day +
        "</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>" +
        priority +
        "</priority>\n  </url>"
      );
    })
    .join("\n");
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    "\n</urlset>\n";
  res.type("application/xml; charset=utf-8");
  res.send(xml);
}

module.exports = {
  getRobots,
  getSitemap,
};

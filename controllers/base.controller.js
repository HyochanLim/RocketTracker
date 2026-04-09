const User = require("../models/user.model");
const authUtil = require("../util/authentication");
const { resolveBadges } = require("../util/badges");
const { publicSiteUrl } = require("../util/env-config");
const fs = require("fs");
const path = require("path");

function deletePreviousAvatarIfAny(sessionUid, currentImageUrl) {
  if (!currentImageUrl || typeof currentImageUrl !== "string") return;
  const profilePrefix = `/profile-media/${sessionUid}/`;
  if (currentImageUrl.startsWith(profilePrefix)) {
    const name = path.basename(currentImageUrl.slice(profilePrefix.length));
    if (!name || name === "." || name === "..") return;
    const abs = path.join(__dirname, "..", "data", "users", sessionUid, "profile", name);
    fs.unlink(abs, function () {});
    return;
  }
  if (currentImageUrl.startsWith("/uploads/avatars/")) {
    const abs = path.join(__dirname, "..", currentImageUrl.replace(/^\//, ""));
    fs.unlink(abs, function () {});
  }
}

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

function isAjaxRequest(req) {
  return req.xhr || req.get("X-Requested-With") === "XMLHttpRequest";
}

function redirectOwnProfile(req, res) {
  return res.redirect(`/profile/${req.session.uid}`);
}

async function getProfile(req, res, next) {
  if (req.params.id !== req.session.uid) return res.redirect(`/profile/${req.session.uid}`);

  try {
    const profileUser = await User.getById(req.params.id);
    if (!profileUser) return res.redirect(`/profile/${req.session.uid}`);

    const baseView = User.toProfileView(profileUser);
    const userData = {
      ...baseView,
      imageUrl: baseView.imageUrl || (res.locals.user ? res.locals.user.imageUrl : ""),
      badgeDefs: resolveBadges(baseView.badges),
    };
    const message = req.query.saved ? { type: "success", text: "Profile updated successfully." } : null;
    return res.render("profile/index", { userData, message, showEditForm: false });
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  if (req.params.id !== req.session.uid) return res.redirect(`/profile/${req.session.uid}`);

  const displayName = (req.body["display-name"] || "").trim();
  const bio = typeof req.body.bio === "string" ? req.body.bio.trim().slice(0, 1200) : "";
  const email = req.session.user && req.session.user.email ? req.session.user.email : "";
  const currentImageUrl = res.locals.user && res.locals.user.imageUrl ? res.locals.user.imageUrl : "";
  const uploadedAvatarPath = req.file ? `/profile-media/${req.session.uid}/${req.file.filename}` : "";
  const imageUrl = uploadedAvatarPath || currentImageUrl;
  const userData = { ...res.locals.user, id: req.session.uid, email, displayName, imageUrl, bio };

  if (!displayName) {
    if (isAjaxRequest(req)) {
      return res.status(422).json({ ok: false, message: "Display name is required." });
    }
    return res.status(422).render("profile/index", {
      userData,
      message: { type: "error", text: "Display name is required." },
      showEditForm: true,
    });
  }

  try {
    if (req.fileValidationError) {
      if (isAjaxRequest(req)) {
        return res.status(422).json({ ok: false, message: req.fileValidationError });
      }
      return res.status(422).render("profile/index", {
        userData: { ...userData, imageUrl: currentImageUrl },
        message: { type: "error", text: req.fileValidationError },
        showEditForm: true,
      });
    }

    await User.updateProfile(req.session.uid, { email, displayName, imageUrl, bio });

    const nextUserSessionData = {
      _id: req.session.uid,
      email,
      displayName,
      imageUrl,
      isAdmin: req.session.isAdmin,
    };

    if (uploadedAvatarPath) {
      deletePreviousAvatarIfAny(req.session.uid, currentImageUrl);
    }

    authUtil.createUserSession(req, nextUserSessionData, function () {
      if (isAjaxRequest(req)) {
        return res.json({
          ok: true,
          message: "Profile updated successfully.",
          user: {
            id: req.session.uid,
            email,
            displayName,
            imageUrl,
            bio,
          },
        });
      }
      res.redirect(`/profile/${req.session.uid}?saved=1`);
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHome,
  getAbout,
  getProducts,
  getPricing,
  getResources,
  getContact,
  getDownload,
  getRobots,
  getSitemap,
  redirectOwnProfile,
  getProfile,
  updateProfile,
};

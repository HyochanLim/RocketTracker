const User = require("../models/user.model");
const authUtil = require("../util/authentication");
const { resolveBadges } = require("../util/badges");
const fs = require("fs");
const path = require("path");

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
  const uploadedAvatarPath = req.file ? `/uploads/avatars/${req.file.filename}` : "";
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

    if (uploadedAvatarPath && currentImageUrl && currentImageUrl.startsWith("/uploads/avatars/")) {
      const oldPath = path.join(__dirname, "..", currentImageUrl.replace(/^\//, ""));
      fs.unlink(oldPath, function () {});
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
  redirectOwnProfile,
  getProfile,
  updateProfile,
};

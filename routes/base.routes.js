const express = require("express");
const marketingController = require("../controllers/marketing.controller");
const seoController = require("../controllers/seo.controller");
const profileController = require("../controllers/profile.controller");
const protectRoutes = require("../middlewares/protect-routes");
const uploadAvatar = require("../middlewares/avatar-upload");

const router = express.Router();
router.get("/", marketingController.getHome);
router.get("/about", marketingController.getAbout);
router.get("/products", marketingController.getProducts);
router.get("/robots.txt", seoController.getRobots);
router.get("/sitemap.xml", seoController.getSitemap);
router.get("/pricing", marketingController.getPricing);
router.get("/resources", marketingController.getResources);
router.get("/contact", marketingController.getContact);
router.get("/download", marketingController.getDownload);
router.get("/profile", protectRoutes, profileController.redirectOwnProfile);
router.get("/profile/:id", protectRoutes, profileController.getProfile);
router.post("/profile/:id", protectRoutes, uploadAvatar.single("avatar-image"), profileController.updateProfile);

module.exports = router;

const express = require("express");
const baseController = require("../controllers/base.controller");
const protectRoutes = require("../middlewares/protect-routes");
const uploadAvatar = require("../middlewares/avatar-upload");

const router = express.Router();
router.get("/", baseController.getHome);
router.get("/about", baseController.getAbout);
router.get("/products", baseController.getProducts);
router.get("/pricing", baseController.getPricing);
router.get("/resources", baseController.getResources);
router.get("/contact", baseController.getContact);
router.get("/profile", protectRoutes, baseController.redirectOwnProfile);
router.get("/profile/:id", protectRoutes, baseController.getProfile);
router.post("/profile/:id", protectRoutes, uploadAvatar.single("avatar-image"), baseController.updateProfile);

module.exports = router;

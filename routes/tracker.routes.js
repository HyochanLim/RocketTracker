const express = require("express");
const trackerController = require("../controllers/tracker.controller");
const protectRoutes = require("../middlewares/protect-routes");

const router = express.Router();
router.get("/tracker", protectRoutes, trackerController.getTracker);

module.exports = router;

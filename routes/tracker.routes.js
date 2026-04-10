const express = require("express");
const trackerController = require("../controllers/tracker.controller");
const protectRoutes = require("../middlewares/protect-routes");
const uploadFlightFile = require("../middlewares/flight-upload");
const resolveSelectedFlightFile = require("../middlewares/selected-flight-file");

const router = express.Router();
router.get("/tracker", protectRoutes, trackerController.getTracker);
router.post("/tracker/upload", protectRoutes, uploadFlightFile.single("file"), trackerController.uploadTrackerFile);
router.get("/tracker/file/:fileId/data", protectRoutes, resolveSelectedFlightFile, trackerController.getFlightData);
router.post("/tracker/file/:fileId/delete", protectRoutes, resolveSelectedFlightFile, trackerController.deleteTrackerFile);
router.get("/tracker/agent/history", protectRoutes, trackerController.getAgentHistory);
router.post("/tracker/agent/thread/reset", protectRoutes, trackerController.postAgentThreadReset);
router.post("/tracker/agent/chat", protectRoutes, trackerController.postAgentChat);
router.post("/tracker/agent/run", protectRoutes, trackerController.postAgentRun);

module.exports = router;

const express = require("express");
const protectRoutes = require("../middlewares/protect-routes");
const billingController = require("../controllers/billing.controller");

const router = express.Router();

router.post("/billing/paypal/order/create", protectRoutes, billingController.postPayPalCreateOrder);
router.post("/billing/paypal/order/capture", protectRoutes, billingController.postPayPalCaptureOrder);

module.exports = router;


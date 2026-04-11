const db = require("../data/database");
const User = require("../models/user.model");
const paypalService = require("../services/paypal.service");
const { isAjaxRequest } = require("../util/http-request");

function safeDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function plusDays(d, days) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

async function postPayPalConfirmSubscription(req, res, next) {
  if (!isAjaxRequest(req)) return res.status(400).json({ ok: false, message: "Invalid request." });
  try {
    const out = await paypalService.createProOrder();
    const orderId = out && out.id ? String(out.id) : "";
    if (!orderId) return res.status(502).json({ ok: false, message: "PayPal order id missing." });
    return res.json({ ok: true, orderId });
  } catch (err) {
    next(err);
  }
}

async function postPayPalCreateOrder(req, res, next) {
  if (!isAjaxRequest(req)) return res.status(400).json({ ok: false, message: "Invalid request." });
  try {
    const out = await paypalService.createProOrder();
    const orderId = out && out.id ? String(out.id) : "";
    if (!orderId) return res.status(502).json({ ok: false, message: "PayPal order id missing." });
    return res.json({ ok: true, orderId });
  } catch (err) {
    next(err);
  }
}

async function postPayPalCaptureOrder(req, res, next) {
  if (!isAjaxRequest(req)) return res.status(400).json({ ok: false, message: "Invalid request." });
  try {
    const orderId = req.body && req.body.orderID ? String(req.body.orderID).trim() : "";
    if (!orderId) return res.status(422).json({ ok: false, message: "orderID missing." });

    const cap = await paypalService.captureOrder(orderId);
    const status = cap && cap.status ? String(cap.status).toUpperCase() : "";
    if (status !== "COMPLETED") {
      return res.status(402).json({ ok: false, message: "Payment not completed.", status });
    }

    const { currency, value } = paypalService.getProPriceConfig();
    const pu = cap && Array.isArray(cap.purchase_units) ? cap.purchase_units[0] : null;
    const captured =
      pu &&
      pu.payments &&
      Array.isArray(pu.payments.captures) &&
      pu.payments.captures[0] &&
      pu.payments.captures[0].amount
        ? pu.payments.captures[0].amount
        : null;
    const gotCurrency = captured && captured.currency_code ? String(captured.currency_code).toUpperCase() : "";
    const gotValue = captured && captured.value ? String(captured.value) : "";
    if (gotCurrency !== currency || gotValue !== value) {
      return res.status(400).json({ ok: false, message: "Amount verification failed." });
    }

    const payerId = cap && cap.payer && cap.payer.payer_id ? String(cap.payer.payer_id) : "";
    const now = new Date();
    const proUntil = plusDays(now, 30);
    await User.setProUntil(req.session.uid, proUntil, {
      source: "paypal",
      paypalOrderId: orderId,
      paypalPayerId: payerId,
      status: "active",
    });

    return res.json({ ok: true, message: "Pro activated.", proUntil: proUntil.toISOString() });
  } catch (err) {
    next(err);
  }
}

async function postPayPalWebhook(req, res, next) {
  try {
    const rawBody = req.body; // Buffer from express.raw
    const headers = req.headers || {};
    const { verified, status, event } = await paypalService.verifyWebhookSignature(rawBody, headers);

    const eventId = event && event.id ? String(event.id) : "";
    const eventType = event && event.event_type ? String(event.event_type) : "";

    await db.getDb().collection("paypal_webhook_events").updateOne(
      { eventId: eventId || `${Date.now()}-${Math.random()}` },
      {
        $setOnInsert: {
          eventId: eventId || null,
          createdAt: new Date(),
        },
        $set: {
          verified: !!verified,
          verificationStatus: status || "",
          eventType: eventType || "",
          payload: event || {},
          receivedAt: new Date(),
        },
      },
      { upsert: true }
    );

    if (!verified) {
      return res.status(400).json({ ok: false, message: "Webhook signature not verified." });
    }

    // For one-time Pro purchases, webhooks are optional. We keep logging + signature verification.

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  postPayPalCreateOrder,
  postPayPalCaptureOrder,
  postPayPalWebhook,
};


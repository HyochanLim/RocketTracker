const db = require("../data/database");
const User = require("../models/user.model");
const paypalWebhook = require("../services/paypal-webhook.service");

/**
 * POST /webhooks/paypal — must be registered BEFORE csurf and without session requirement.
 */
async function handlePaypalWebhook(req, res) {
  const skipVerify = process.env.PAYPAL_SKIP_VERIFY === "true" && process.env.NODE_ENV !== "production";
  if (skipVerify) {
    console.warn("[paypal] PAYPAL_SKIP_VERIFY — signature not verified (dev only)");
  } else {
    try {
      const ok = await paypalWebhook.verifyWebhookSignature(req, req.body);
      if (!ok) {
        return res.status(401).send("Invalid signature");
      }
    } catch (e) {
      console.error("[paypal] verify error", e.message);
      return res.status(500).send("Verification error");
    }
  }

  const event = req.body;
  const eventType = event.event_type;

  if (!paypalWebhook.PRO_GRANT_EVENT_TYPES.has(eventType)) {
    return res.status(200).json({ ok: true, ignored: true, event_type: eventType });
  }

  const prior = await db.getDb().collection("paypal_webhook_events").findOne({ _id: String(event.id || "") });
  if (prior) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const email = paypalWebhook.extractPayerEmail(event);
  if (!email) {
    console.warn("[paypal] No payer email in event", eventType, event.id);
    return res.status(200).json({ ok: false, reason: "no_email" });
  }

  const paymentTime = paypalWebhook.extractPaymentTime(event);
  const result = await User.grantProMonthFromPayment(email, paymentTime);

  if (!result.ok) {
    console.warn("[paypal] No Orbit user for payer email:", email);
    return res.status(200).json({ ok: false, reason: "no_user", email });
  }

  try {
    await db.getDb().collection("paypal_webhook_events").insertOne({
      _id: String(event.id),
      processedAt: new Date(),
      userId: result.userId,
    });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }

  console.log("[paypal] Pro granted until", result.proExpiresAt, "user", result.userId);
  return res.status(200).json({ ok: true, proExpiresAt: result.proExpiresAt });
}

module.exports = { handlePaypalWebhook };

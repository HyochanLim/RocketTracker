/**
 * PayPal webhooks v2: verify signature and extract payer email from payment events.
 * Requires PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_MODE=sandbox|live
 */

const { getPaypalRestClientId } = require("../util/paypal-env");

function apiBase() {
  return process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken() {
  const id = getPaypalRestClientId() || process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Missing PAYPAL_CLIENT_ID (or PAYPAL_SDK_SCRIPT_URL with client-id) or PAYPAL_CLIENT_SECRET");
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * @param {import('express').Request} req
 * @param {object} body - req.body (parsed JSON)
 */
async function verifyWebhookSignature(req, body) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID");
  }

  const accessToken = await getAccessToken();
  const payload = {
    auth_algo: req.get("paypal-auth-algo"),
    cert_url: req.get("paypal-cert-url"),
    transmission_id: req.get("paypal-transmission-id"),
    transmission_sig: req.get("paypal-transmission-sig"),
    transmission_time: req.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: body,
  };

  const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    return false;
  }
  return data.verification_status === "SUCCESS";
}

/**
 * @param {object} event - webhook event body
 * @returns {string|null}
 */
function extractPayerEmail(event) {
  const r = event.resource || {};
  if (r.payer && r.payer.email_address) return String(r.payer.email_address).trim();
  if (r.payer_email) return String(r.payer_email).trim();
  if (r.subscriber && r.subscriber.email_address) return String(r.subscriber.email_address).trim();
  // Some captures nest under supplementary_data / billing_info
  const pi = r.payer && r.payer.payer_info;
  if (pi && pi.email) return String(pi.email).trim();
  return null;
}

/**
 * Payment/settlement time for Pro window (ISO string or Date).
 */
function extractPaymentTime(event) {
  if (event.create_time) return new Date(event.create_time);
  const r = event.resource || {};
  if (r.create_time) return new Date(r.create_time);
  if (r.update_time) return new Date(r.update_time);
  return new Date();
}

/** Primary event: captured funds (avoid duplicate grants from multiple event types). */
const PRO_GRANT_EVENT_TYPES = new Set(["PAYMENT.CAPTURE.COMPLETED"]);

module.exports = {
  verifyWebhookSignature,
  extractPayerEmail,
  extractPaymentTime,
  PRO_GRANT_EVENT_TYPES,
  apiBase,
};

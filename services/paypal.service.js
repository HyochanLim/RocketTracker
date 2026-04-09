const PAYPAL_API_BASE = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

function getPayPalEnv() {
  const v = (process.env.PAYPAL_ENV || "sandbox").toLowerCase().trim();
  return v === "live" ? "live" : "sandbox";
}

function getPayPalBaseUrl() {
  return PAYPAL_API_BASE[getPayPalEnv()];
}

function getPayPalCreds() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
  const secret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
  if (!clientId || !secret) {
    throw new Error("PayPal env missing: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET");
  }
  return { clientId, secret };
}

async function getAccessToken() {
  const { clientId, secret } = getPayPalCreds();
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`PayPal token failed (${res.status}): ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw);
  const tok = data && data.access_token ? String(data.access_token) : "";
  if (!tok) throw new Error("PayPal token missing in response.");
  return tok;
}

async function paypalGet(pathname) {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBaseUrl()}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`PayPal GET ${pathname} failed (${res.status}): ${raw.slice(0, 400)}`);
  return JSON.parse(raw);
}

async function paypalPost(pathname, bodyObj) {
  const token = await getAccessToken();
  const res = await fetch(`${getPayPalBaseUrl()}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyObj || {}),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`PayPal POST ${pathname} failed (${res.status}): ${raw.slice(0, 400)}`);
  return raw ? JSON.parse(raw) : {};
}

function getProPriceConfig() {
  const currency = String(process.env.PAYPAL_PRO_CURRENCY || "USD").trim().toUpperCase() || "USD";
  const value = String(process.env.PAYPAL_PRO_PRICE || "10.00").trim() || "10.00";
  return { currency, value };
}

async function createProOrder() {
  const { currency, value } = getProPriceConfig();
  return paypalPost("/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: currency, value },
        description: "Orbit Pro (30 days)",
      },
    ],
  });
}

async function captureOrder(orderId) {
  const id = String(orderId || "").trim();
  if (!id) throw new Error("orderId required");
  return paypalPost(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {});
}

async function verifyWebhookSignature(rawBody, headers) {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookId) throw new Error("PayPal env missing: PAYPAL_WEBHOOK_ID");

  const transmissionId = String(headers["paypal-transmission-id"] || "");
  const transmissionTime = String(headers["paypal-transmission-time"] || "");
  const certUrl = String(headers["paypal-cert-url"] || "");
  const authAlgo = String(headers["paypal-auth-algo"] || "");
  const transmissionSig = String(headers["paypal-transmission-sig"] || "");

  const bodyText = Buffer.isBuffer(rawBody) ? rawBody.toString("utf-8") : String(rawBody || "");
  let webhookEvent;
  try {
    webhookEvent = JSON.parse(bodyText);
  } catch {
    webhookEvent = null;
  }
  if (!webhookEvent) throw new Error("Webhook body was not JSON.");

  const payload = {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: webhookId,
    webhook_event: webhookEvent,
  };

  const out = await paypalPost("/v1/notifications/verify-webhook-signature", payload);
  const status = out && out.verification_status ? String(out.verification_status) : "";
  return { verified: status === "SUCCESS", status, event: webhookEvent };
}

module.exports = {
  getPayPalEnv,
  getPayPalBaseUrl,
  getProPriceConfig,
  createProOrder,
  captureOrder,
  verifyWebhookSignature,
};


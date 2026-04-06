/**
 * PayPal REST / SDK: resolve client id from env or from PAYPAL_SDK_SCRIPT_URL query string.
 */

function getPaypalRestClientId() {
  const direct =
    process.env.PAYPAL_CLIENT_ID ||
    process.env.PAYPAL_CLIENTID ||
    process.env.PAYPAL_SANDBOX_CLIENT_ID ||
    process.env.SANDBOX_CLIENT_ID ||
    "";
  const t = String(direct)
    .trim()
    .replace(/^\uFEFF/, "");
  if (t) return t;

  const url = String(process.env.PAYPAL_SDK_SCRIPT_URL || "").trim();
  const m = url.match(/[?&]client-id=([^&]+)/i);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).replace(/^\uFEFF/, "");
  } catch {
    return m[1];
  }
}

function resolvePaypalSdkUrl() {
  const full = String(process.env.PAYPAL_SDK_SCRIPT_URL || "")
    .trim()
    .replace(/^\uFEFF/, "");
  if (full.startsWith("https://www.paypal.com/sdk/js")) {
    return full;
  }
  const cid = getPaypalRestClientId();
  if (!cid) return null;
  const currency = (process.env.PAYPAL_CURRENCY || "USD").trim() || "USD";
  const locale = (process.env.PAYPAL_SDK_LOCALE || "").trim();
  let url = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cid)}&components=hosted-buttons&disable-funding=venmo&currency=${encodeURIComponent(currency)}`;
  if (locale) {
    url += `&locale=${encodeURIComponent(locale)}`;
  }
  return url;
}

module.exports = { getPaypalRestClientId, resolvePaypalSdkUrl };

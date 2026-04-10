const http = require("http");
const fs = require("fs");
const path = require("path");

function request(method, path, { headers = {}, body = null, cookieJar } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 3000,
        method,
        path,
        headers: {
          ...headers,
          ...(cookieJar && cookieJar.header() ? { Cookie: cookieJar.header() } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString("utf8");
          if (cookieJar) cookieJar.capture(res.headers["set-cookie"]);
          resolve({ status: res.statusCode, headers: res.headers, text });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }
  capture(setCookie) {
    const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    for (const line of arr) {
      const part = String(line).split(";")[0];
      const i = part.indexOf("=");
      if (i > 0) this.map.set(part.slice(0, i), part.slice(i + 1));
    }
  }
  header() {
    if (this.map.size === 0) return "";
    return Array.from(this.map.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

function encodeForm(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function extractCsrf(html) {
  const m = String(html || "").match(/name="_csrf"\s+value="([^"]+)"/);
  return m ? m[1] : "";
}

function extractTrackerCsrf(html) {
  const m = String(html || "").match(/id="tracker-csrf-token"\s+value="([^"]+)"/);
  return m ? m[1] : "";
}

async function main() {
  const jar = new CookieJar();
  const email = `test+${Math.random().toString(16).slice(2, 10)}@example.com`;
  const pw = "TestPassw0rd!";

  const s1 = await request("GET", "/signup", { cookieJar: jar });
  if (s1.status !== 200) throw new Error(`/signup status ${s1.status}`);
  const csrf1 = extractCsrf(s1.text);
  if (!csrf1) throw new Error("csrf missing on /signup");

  const s2 = await request("POST", "/signup", {
    cookieJar: jar,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm({ email, password: pw, "confirm-password": pw, _csrf: csrf1 }),
  });
  if (![200, 302].includes(s2.status)) throw new Error(`/signup POST unexpected ${s2.status}`);

  const l1 = await request("GET", "/login", { cookieJar: jar });
  if (l1.status !== 200) throw new Error(`/login status ${l1.status}`);
  const csrf2 = extractCsrf(l1.text);
  if (!csrf2) throw new Error("csrf missing on /login");

  const l2 = await request("POST", "/login", {
    cookieJar: jar,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm({ email, password: pw, _csrf: csrf2 }),
  });
  if (l2.status !== 302) throw new Error(`/login POST expected 302 got ${l2.status}`);

  const t1 = await request("GET", "/tracker", { cookieJar: jar });
  if (t1.status !== 200) throw new Error(`/tracker status ${t1.status}`);

  const trackerCsrf = extractTrackerCsrf(t1.text);
  if (!trackerCsrf) throw new Error("csrf missing on /tracker");

  // Upload a small sample JSON and ensure parseInterpretation is included.
  const samplePath = path.join(__dirname, "sample-flight.json");
  const fileBuf = fs.readFileSync(samplePath);
  const boundary = `----orbitBoundary${Math.random().toString(16).slice(2)}`;
  const pre =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="_csrf"\r\n\r\n` +
    `${trackerCsrf}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="sample-flight.json"\r\n` +
    `Content-Type: application/json\r\n\r\n`;
  const post = `\r\n--${boundary}--\r\n`;
  const bodyBuf = Buffer.concat([Buffer.from(pre, "utf8"), fileBuf, Buffer.from(post, "utf8")]);
  const up = await request("POST", "/tracker/upload", {
    cookieJar: jar,
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "CSRF-Token": trackerCsrf,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(bodyBuf.length),
    },
    body: bodyBuf,
  });
  if (up.status !== 200) throw new Error(`/tracker/upload expected 200 got ${up.status}`);
  let upJson = null;
  try {
    upJson = JSON.parse(up.text);
  } catch {
    throw new Error("upload did not return JSON");
  }
  if (!upJson.ok || !upJson.file || !upJson.parseInterpretation) throw new Error("upload JSON missing fields");

  const run = await request("POST", "/tracker/agent/run", {
    cookieJar: jar,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "csrf-token": trackerCsrf,
      "xsrf-token": trackerCsrf,
    },
    body: JSON.stringify({ _csrf: trackerCsrf, fileId: upJson.file._id, code: "print('hello')\n" }),
  });
  // With fileId but without E2B key configured, we expect a 502 error JSON. If E2B is configured, expect 200.
  if (![200, 502].includes(run.status)) throw new Error(`/tracker/agent/run expected 200 or 502, got ${run.status}`);

  console.log("OK auth + tracker page reachable");
}

main().catch((err) => {
  console.error("E2E failed:", err && err.message ? err.message : String(err));
  process.exit(1);
});


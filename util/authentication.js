// 계정 생성 시 랜덤으로 생성되는 이미지
function hashStringToUint32(str) {
  const s = String(str || "");
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toDataSvg(svg) {
  // Keep it compact and safe for URLs.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getDefaultAvatarUrl(seedValue) {
  // Deterministic random blob for the same seed.
  const seed = hashStringToUint32(seedValue || "rocket-user");
  const rng = mulberry32(seed);

  const palette = [
    "6f42ff", // purple
    "2f7f8d", // teal
    "5c86ff", // blue
    "ff4fd8", // pink
    "2ecc71", // green
    "ff8a3d", // orange
    "1ccad8", // cyan
    "b517ff", // violet
    "00d2ff", // sky
    "00ffa3", // mint
  ];

  const c1 = pick(rng, palette);
  const c2 = pick(rng, palette);
  const c3 = pick(rng, palette);
  const c4 = pick(rng, palette);

  const cx1 = Math.round(38 + rng() * 28);
  const cy1 = Math.round(34 + rng() * 26);
  const cx2 = Math.round(42 + rng() * 24);
  const cy2 = Math.round(38 + rng() * 30);
  const cx3 = Math.round(36 + rng() * 30);
  const cy3 = Math.round(40 + rng() * 26);

  const r1 = Math.round(44 + rng() * 18);
  const r2 = Math.round(42 + rng() * 20);
  const r3 = Math.round(46 + rng() * 18);

  const blur = Math.round(14 + rng() * 10);

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <clipPath id="clip">
      <circle cx="64" cy="64" r="64"/>
    </clipPath>
    <filter id="b" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#${c1}" stop-opacity="0.96"/>
      <stop offset="38%" stop-color="#${c2}" stop-opacity="0.9"/>
      <stop offset="72%" stop-color="#${c3}" stop-opacity="0.86"/>
      <stop offset="100%" stop-color="#${c4}" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="g1" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="22%" stop-color="#${c1}" stop-opacity="1"/>
      <stop offset="62%" stop-color="#${c2}" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#${c3}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="55%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="20%" stop-color="#${c2}" stop-opacity="0.98"/>
      <stop offset="60%" stop-color="#${c3}" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#${c1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g3" cx="45%" cy="60%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="24%" stop-color="#${c3}" stop-opacity="0.96"/>
      <stop offset="64%" stop-color="#${c4}" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#${c2}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="128" height="128" fill="#0a101b"/>
  <rect width="128" height="128" fill="url(#bg)"/>

  <g clip-path="url(#clip)" filter="url(#b)">
    <circle cx="${cx1}" cy="${cy1}" r="${r1}" fill="url(#g1)"/>
    <circle cx="${cx2}" cy="${cy2}" r="${r2}" fill="url(#g2)"/>
    <circle cx="${cx3}" cy="${cy3}" r="${r3}" fill="url(#g3)"/>
  </g>

  <circle cx="64" cy="64" r="64" fill="none" stroke="rgba(255,255,255,0.08)" />
</svg>`.trim();

  return toDataSvg(svg);
}

function createUserSession(req, user, action) {
  const displayName = user.displayName || user.email || "User";
  const imageUrl = user.imageUrl && user.imageUrl.trim().length > 0
    ? user.imageUrl
    : getDefaultAvatarUrl(displayName);

  req.session.uid = user._id.toString();
  req.session.isAdmin = user.isAdmin === true;
  req.session.user = {
    email: user.email,
    displayName,
    imageUrl,
  };
  req.session.save(action);
}

function destroyUserSession(req, action) {
  const onDone = typeof action === "function" ? action : function () {};
  req.session.destroy(function () {
    resClearSessionCookie(req);
    onDone();
  });
}

function resClearSessionCookie(req) {
  if (!req || !req.res) return;
  req.res.clearCookie("connect.sid");
}

module.exports = { createUserSession, destroyUserSession, getDefaultAvatarUrl };

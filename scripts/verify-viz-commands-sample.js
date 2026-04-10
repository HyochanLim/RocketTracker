/**
 * Node smoke test: mirrors logic/3Dvisualizer/cesium-viz-commands.js readPosition + inferLonLat.
 * Run: node scripts/verify-viz-commands-sample.js
 */
function inferLonLat(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -90 || x > 90) return { lon: x, lat: y };
  if (y < -90 || y > 90) return { lon: y, lat: x };
  return { lon: x, lat: y };
}

function readPosition(cmd) {
  if (!cmd || typeof cmd !== "object") return null;

  var lon = Number(cmd.lon != null ? cmd.lon : cmd.longitude);
  var lat = Number(cmd.lat != null ? cmd.lat : cmd.latitude);
  var h = 0;

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    if (cmd.x != null && cmd.y != null) {
      var ll = inferLonLat(Number(cmd.x), Number(cmd.y));
      if (ll) {
        lon = ll.lon;
        lat = ll.lat;
      }
    }
  }

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    var pt = cmd.point;
    if (pt && typeof pt === "object") {
      var px = pt.x != null ? pt.x : pt.lon != null ? pt.lon : pt.longitude;
      var py = pt.y != null ? pt.y : pt.lat != null ? pt.lat : pt.latitude;
      if (px != null && py != null) {
        var ll2 = inferLonLat(Number(px), Number(py));
        if (ll2) {
          lon = ll2.lon;
          lat = ll2.lat;
        }
      }
      if (pt.z != null && Number.isFinite(Number(pt.z))) h = Number(pt.z);
      else if (pt.heightM != null && Number.isFinite(Number(pt.heightM))) h = Number(pt.heightM);
      else if (pt.alt != null && Number.isFinite(Number(pt.alt))) h = Number(pt.alt);
    }
  }

  if (cmd.heightM != null && Number.isFinite(Number(cmd.heightM))) h = Number(cmd.heightM);
  else if (cmd.alt != null && Number.isFinite(Number(cmd.alt))) h = Number(cmd.alt);
  else if (cmd.elevation != null && Number.isFinite(Number(cmd.elevation))) h = Number(cmd.elevation);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (!Number.isFinite(h)) h = 0;
  return { lon: lon, lat: lat, h: h };
}

function readLabelText(cmd) {
  if (cmd.text != null && String(cmd.text).trim()) return String(cmd.text);
  if (cmd.label == null) return "";
  if (typeof cmd.label === "string") return String(cmd.label);
  if (typeof cmd.label === "object" && cmd.label.text != null) return String(cmd.label.text);
  return String(cmd.label);
}

var failed = false;

var llmShape = {
  type: "addPoint",
  name: "maxAltitudePoint",
  style: { color: "#ff0000", radius: 6 },
  point: { x: 126.7917869, y: 35.8918746 },
  label: { text: "Max altitude: 1814.130", offset: [8, -8] },
};

var p = readPosition(llmShape);
if (!p || Math.abs(p.lon - 126.7917869) > 1e-6 || Math.abs(p.lat - 35.8918746) > 1e-6) {
  console.error("FAIL: LLM point.x/y shape", p);
  failed = true;
} else {
  console.log("OK: LLM point.x/y -> lon/lat", p.lon, p.lat);
}

var lt = readLabelText(llmShape);
if (lt.indexOf("1814.13") === -1) {
  console.error("FAIL: label text", lt);
  failed = true;
} else {
  console.log("OK: nested label.text");
}

process.exit(failed ? 1 : 0);

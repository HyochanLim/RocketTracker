/* global Cesium */
/**
 * Scratch trajectory overlay — uses the same records array the tracker already fetched
 * (GET /tracker/file/:id/data). Browsers cannot read local disk paths; no loadParsedFile.
 * Large logs: polyline with stride (max ~20k vertices) so the tab stays usable.
 */
(function () {
  function toNumber(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function pickPressurePa(row) {
    if (!row || typeof row !== "object") return null;
    var p = toNumber(row.pressure);
    if (p !== null && p > 0) return p;
    if (row.raw && typeof row.raw === "object") {
      var pr = toNumber(row.raw.pressure);
      if (pr !== null && pr > 0) return pr;
    }
    return null;
  }

  function referencePressurePa(records) {
    if (!Array.isArray(records)) return null;
    for (var i = 0; i < records.length; i += 1) {
      var p = pickPressurePa(records[i]);
      if (p !== null && p > 0) return p;
    }
    return null;
  }

  function barometricHeightMeters(pressurePa, p0Pa) {
    if (pressurePa == null || p0Pa == null || pressurePa <= 0 || p0Pa <= 0) return null;
    return 44330 * (1 - Math.pow(pressurePa / p0Pa, 0.1903));
  }

  function buildTrajectoryDegreesHeights(records, maxVertices) {
    var cap = maxVertices == null ? 20000 : Math.max(2, maxVertices);
    if (!Array.isArray(records) || records.length === 0) return [];
    var p0 = referencePressurePa(records);
    var step = 1;
    if (records.length > cap) step = Math.ceil(records.length / cap);
    var flat = [];
    for (var i = 0; i < records.length; i += step) {
      var r = records[i];
      if (!r || typeof r !== "object") continue;
      var lat = toNumber(r.latitude != null ? r.latitude : r.lat);
      var lon = toNumber(r.longitude != null ? r.longitude : r.lon != null ? r.lon : r.lng);
      if (lat === null || lon === null) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      var pRow = pickPressurePa(r);
      var baroM = p0 != null && pRow != null ? barometricHeightMeters(pRow, p0) : null;
      var gpsM = toNumber(r.altitude != null ? r.altitude : r.alt != null ? r.alt : r.height);
      var h = baroM != null && Number.isFinite(baroM) ? baroM : gpsM != null && Number.isFinite(gpsM) ? gpsM : 0;
      flat.push(lon, lat, h);
    }
    return flat;
  }

  function ensureScratchHud() {
    var section = document.getElementById("trackerVisualizerSection");
    if (!section) return null;
    if (!section.style.position) section.style.position = "relative";

    var el = document.getElementById("trajectory-scratch-hud");
    if (el) return el;
    el = document.createElement("div");
    el.id = "trajectory-scratch-hud";
    el.setAttribute("aria-live", "polite");
    el.style.cssText =
      "position:absolute;top:10px;left:10px;z-index:3;padding:8px 12px;" +
      "background:rgba(6,40,42,0.9);color:#9ff; font:13px/1.4 system-ui,sans-serif;" +
      "border-radius:10px;border:1px solid rgba(120,200,200,0.35);pointer-events:none;";
    var container = document.getElementById("cesiumContainer");
    if (container && container.parentNode) {
      container.parentNode.insertBefore(el, container);
    } else {
      section.insertBefore(el, section.firstChild);
    }
    return el;
  }

  function applyTrajectoryScratch(viewer, records) {
    var list = Array.isArray(records) ? records : [];
    var n = list.length;

    var hud = ensureScratchHud();
    if (hud) {
      hud.textContent = "trajectory.js · rows: " + n;
    }

    if (!viewer || typeof Cesium === "undefined") return;

    var old = viewer.entities.getById("flight-trajectory-polyline");
    if (old) viewer.entities.remove(old);

    var trailFlat = buildTrajectoryDegreesHeights(list, 20000);
    if (trailFlat.length >= 6) {
      viewer.entities.add({
        id: "flight-trajectory-polyline",
        name: "Flight trajectory (trajectory.js)",
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(trailFlat),
          width: 2,
          material: Cesium.Color.RED.withAlpha(0.9),
          clampToGround: false,
        },
      });
    }
  }

  window.applyTrajectoryScratch = applyTrajectoryScratch;
})();

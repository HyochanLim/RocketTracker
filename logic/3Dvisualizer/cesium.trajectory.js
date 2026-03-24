/* global Cesium */
/**
 * Flight telemetry overlays on an existing Cesium.Viewer — launch marker, camera, future path.
 * Edit this file to change how trajectories and related graphics appear.
 */
(function () {
  var FALLBACK_SNU = {
    lat: 37.459,
    lon: 126.9512,
    cameraHeightM: 4200,
    pitchDeg: -52,
  };

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

  function pickLaunchView(records) {
    if (!Array.isArray(records) || records.length === 0) return null;
    var p0 = referencePressurePa(records);
    for (var i = 0; i < records.length; i += 1) {
      var r = records[i];
      if (!r || typeof r !== "object") continue;
      var lat = toNumber(r.latitude != null ? r.latitude : r.lat);
      var lon = toNumber(r.longitude != null ? r.longitude : r.lon != null ? r.lon : r.lng);
      if (lat === null || lon === null) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

      var pRow = pickPressurePa(r);
      var baroM = p0 != null && pRow != null ? barometricHeightMeters(pRow, p0) : null;
      var gpsM = toNumber(r.altitude != null ? r.altitude : r.alt != null ? r.alt : r.height);

      var heightM = baroM != null && Number.isFinite(baroM) ? baroM : gpsM != null ? gpsM : 0;
      return {
        lat: lat,
        lon: lon,
        heightM: heightM,
        source: baroM != null ? "baro" : gpsM != null ? "gps" : "none",
      };
    }
    return null;
  }

  function cameraHeightAboveLaunch(heightM) {
    var a = heightM;
    if (a == null || !Number.isFinite(a)) return 3500;
    if (a < -500) return 3500;
    if (a < 0) return 2500;
    return Math.max(a + 2500, 2000);
  }

  /**
   * @param {Cesium.Viewer} viewer
   * @param {object[]|null|undefined} rawRecords
   */
  async function applyCesiumFlightOverlay(viewer, rawRecords) {
    if (!viewer || typeof Cesium === "undefined") return;

    var launch = pickLaunchView(rawRecords || []);

    if (launch) {
      var h = cameraHeightAboveLaunch(launch.heightM);
      var groundAlt = Number.isFinite(launch.heightM) && launch.heightM > -1e4 ? launch.heightM : 0;

      viewer.entities.add({
        id: "launch-point",
        name: launch.source === "baro" ? "Launch (first fix, baro height)" : "Launch (first fix)",
        position: Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat, groundAlt),
        point: {
          pixelSize: 14,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
        },
      });

      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(launch.lon, launch.lat, h),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-90),
          roll: 0,
        },
        duration: 2.2,
      });
    } else {
      await viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(FALLBACK_SNU.lon, FALLBACK_SNU.lat, FALLBACK_SNU.cameraHeightM),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(FALLBACK_SNU.pitchDeg),
          roll: 0,
        },
        duration: 2.5,
      });
    }
  }

  window.applyCesiumFlightOverlay = applyCesiumFlightOverlay;
})();

/* global Cesium */
(function () {
  var viewer = null;
  var trajectoryEntity = null;
  var movingEntity = null;
  var records = [];
  var isPlaying = false;
  var timer = null;
  var currentIndex = 0;

  function toNumber(value) {
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function pickValue(row, keys) {
    if (!row) return null;
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        return row[key];
      }
    }
    return null;
  }

  function detectTimeSeconds(row) {
    var raw = pickValue(row, ["time", "current_time", "timestamp", "unix_time", "time_s", "t"]);
    var numeric = toNumber(raw);
    if (numeric === null) return null;
    return numeric > 1000000000000 ? numeric / 1000 : numeric;
  }

  function normalizeFlightRecords(rawRecords) {
    if (!Array.isArray(rawRecords)) return [];
    var normalized = [];
    var anchorLon = 127.0;
    var anchorLat = 37.0;
    var anchorFixed = false;

    rawRecords.forEach(function (row, idx) {
      var lat = toNumber(pickValue(row, ["latitude", "lat", "gps_lat", "gpsLatitude"]));
      var lon = toNumber(pickValue(row, ["longitude", "lon", "lng", "gps_lon", "gps_lng", "gpsLongitude"]));
      var alt = toNumber(pickValue(row, ["alt", "altitude", "height", "gps_alt"])) || 0;
      var x = toNumber(pickValue(row, ["x"]));
      var y = toNumber(pickValue(row, ["y"]));
      var pressure = toNumber(pickValue(row, ["pressure", "press", "baro_pressure", "pressure_pa", "pressure_hpa"]));

      if (lat !== null && lon !== null && !anchorFixed) {
        anchorLon = lon;
        anchorLat = lat;
        anchorFixed = true;
      }

      if ((lat === null || lon === null) && x !== null && y !== null) {
        // Convert local XY meters to approximate lon/lat near anchor.
        var latRad = anchorLat * (Math.PI / 180);
        var metersPerDegLat = 111320;
        var metersPerDegLon = Math.max(1e-6, 111320 * Math.cos(latRad));
        lat = anchorLat + y / metersPerDegLat;
        lon = anchorLon + x / metersPerDegLon;
      }

      if (lat === null || lon === null) return;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;

      var timeSec = detectTimeSeconds(row);
      if (timeSec === null) timeSec = idx;

      normalized.push({ lat: lat, lon: lon, alt: alt, timeSec: timeSec, x: x, y: y, pressure: pressure });
    });

    normalized.sort(function (a, b) {
      return a.timeSec - b.timeSec;
    });

    if (normalized.length === 0) return [];
    var start = normalized[0].timeSec;
    normalized.forEach(function (point) {
      point.relTimeSec = Math.max(0, point.timeSec - start);
    });

    // 1) Altitude from pressure (preferred when pressure exists):
    //    h = 44330 * (1 - (p/p0)^0.1903), p0 = first valid pressure.
    var p0 = null;
    for (var i = 0; i < normalized.length; i += 1) {
      if (normalized[i].pressure !== null && normalized[i].pressure > 0) {
        p0 = normalized[i].pressure;
        break;
      }
    }
    if (p0 !== null) {
      normalized.forEach(function (point) {
        if (point.pressure !== null && point.pressure > 0) {
          var ratio = point.pressure / p0;
          var h = 44330 * (1 - Math.pow(ratio, 0.1903));
          point.alt = Math.max(0, h);
        } else {
          point.alt = Math.max(0, point.alt || 0);
        }
      });
    } else {
      normalized.forEach(function (point) {
        point.alt = Math.max(0, point.alt || 0);
      });
    }

    // 2) If horizontal movement is too tiny to see, scale XY visually.
    var base = normalized[0];
    var lat0 = base.lat;
    var lon0 = base.lon;
    var latRad = lat0 * (Math.PI / 180);
    var metersPerDegLat = 111320;
    var metersPerDegLon = Math.max(1e-6, 111320 * Math.cos(latRad));
    var maxRadiusMeters = 0;
    var offsets = normalized.map(function (p) {
      var dx = (p.lon - lon0) * metersPerDegLon;
      var dy = (p.lat - lat0) * metersPerDegLat;
      var r = Math.sqrt(dx * dx + dy * dy);
      if (r > maxRadiusMeters) maxRadiusMeters = r;
      return { dx: dx, dy: dy };
    });

    if (maxRadiusMeters > 0 && maxRadiusMeters < 150) {
      var scale = Math.min(800, 1500 / maxRadiusMeters);
      normalized.forEach(function (p, idx) {
        var sx = offsets[idx].dx * scale;
        var sy = offsets[idx].dy * scale;
        p.lon = lon0 + sx / metersPerDegLon;
        p.lat = lat0 + sy / metersPerDegLat;
      });
    }

    return normalized;
  }

  function formatRelativeTime(seconds) {
    var total = Math.max(0, Math.floor(seconds || 0));
    var mm = Math.floor(total / 60);
    var ss = total % 60;
    return "T+" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  }

  function stopPlayback() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function clearEntities() {
    if (!viewer) return;
    if (trajectoryEntity) {
      viewer.entities.remove(trajectoryEntity);
      trajectoryEntity = null;
    }
    if (movingEntity) {
      viewer.entities.remove(movingEntity);
      movingEntity = null;
    }
  }

  function updateUI() {
    var playButton = document.getElementById("playButton");
    var progressBar = document.getElementById("playbackProgress");
    var timeText = document.getElementById("playbackTime");
    var pressureText = document.getElementById("playbackPressure");
    var maxIndex = records.length > 0 ? records.length - 1 : 0;
    var percent = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0;

    if (playButton) playButton.textContent = isPlaying ? "Pause" : "Play";
    if (progressBar) progressBar.value = String(Math.round(percent));
    if (timeText) {
      var current = records[currentIndex];
      timeText.textContent = formatRelativeTime(current ? current.relTimeSec : 0);
      if (pressureText) {
        var pressureValue = current && current.pressure !== null ? String(Math.round(current.pressure)) : "-";
        pressureText.textContent = "P: " + pressureValue;
      }
    }
  }

  function renderFrame(index) {
    if (!viewer || records.length === 0) return;
    currentIndex = Math.max(0, Math.min(index, records.length - 1));
    var point = records[currentIndex];
    if (!point || !movingEntity) return;

    movingEntity.position = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.alt);
    movingEntity.label = {
      text: point.pressure !== null ? "P " + Math.round(point.pressure) : "",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 18),
      font: "13px sans-serif",
    };
    updateUI();
  }

  function startPlayback() {
    if (timer || records.length < 2) return;
    timer = setInterval(function () {
      if (currentIndex >= records.length - 1) {
        stopPlayback();
        isPlaying = false;
        currentIndex = records.length - 1;
        updateUI();
        return;
      } else {
        currentIndex += 1;
      }
      renderFrame(currentIndex);
    }, 120);
  }

  function zoomToEntityWithFallback(entity) {
    if (!entity || !viewer) return;
    var result = viewer.zoomTo(entity);
    if (!result) return;
    if (typeof result.catch === "function") {
      result.catch(function () {
        viewer.camera.flyHome(0);
      });
    } else if (typeof result.otherwise === "function") {
      result.otherwise(function () {
        viewer.camera.flyHome(0);
      });
    }
  }

  function drawTrajectory() {
    if (!viewer) return;
    clearEntities();
    if (records.length === 0) {
      viewer.camera.flyHome(0);
      return;
    }

    var positions = records.map(function (p) {
      return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
    });

    if (positions.length > 1) {
      trajectoryEntity = viewer.entities.add({
        polyline: {
          positions: positions,
          width: 6,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.22,
            taperPower: 0.6,
            color: Cesium.Color.fromCssColorString("#ff4d4d"),
          }),
        },
      });
    }

    movingEntity = viewer.entities.add({
      position: positions[0],
      point: {
        pixelSize: 12,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
      },
    });

    var first = records[0];
    // Always force a safe global-ish camera target first.
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(first.lon, first.lat, Math.max(15000, first.alt + 12000)),
      duration: 0,
    });

    if (trajectoryEntity) {
      zoomToEntityWithFallback(trajectoryEntity);
    } else {
      zoomToEntityWithFallback(movingEntity);
    }
    renderFrame(0);
  }

  function bindPlaybackControls() {
    var playButton = document.getElementById("playButton");
    var progressBar = document.getElementById("playbackProgress");

    if (playButton && !playButton.dataset.bound) {
      playButton.dataset.bound = "1";
      playButton.addEventListener("click", function () {
        if (records.length < 2) return;
        isPlaying = !isPlaying;
        if (isPlaying) startPlayback();
        else stopPlayback();
        updateUI();
      });
    }

    if (progressBar && !progressBar.dataset.bound) {
      progressBar.dataset.bound = "1";
      progressBar.addEventListener("input", function () {
        var percent = Number(progressBar.value || 0);
        var maxIndex = records.length > 0 ? records.length - 1 : 0;
        var nextIndex = Math.round((percent / 100) * maxIndex);
        renderFrame(nextIndex);
      });
    }
  }

  function initCesiumVisualizer(rawRecords) {
    if (viewer) {
      viewer.resize();
    } else {
      viewer = new Cesium.Viewer("cesiumViewer", {
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: true,
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      });

      // Force a non-ion imagery source so the globe is always visible.
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
          url: "https://tile.openstreetmap.org/",
        })
      );

      viewer.scene.screenSpaceCameraController.enableLook = false;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableTranslate = false;
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.scene.globe.show = true;
      viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#0b1d2c");
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#020b15");
      viewer.camera.flyHome(0);

      bindPlaybackControls();
    }

    stopPlayback();
    isPlaying = false;
    records = normalizeFlightRecords(rawRecords);
    currentIndex = 0;
    drawTrajectory();
    updateUI();
    return viewer;
  }

  window.initCesiumVisualizer = initCesiumVisualizer;
})();

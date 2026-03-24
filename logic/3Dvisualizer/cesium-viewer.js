/* global Cesium */
/**
 * Cesium Viewer — Ion token, terrain, optional OSM buildings, container lifecycle.
 * Does not add flight-specific entities; use cesium.trajectory.js for overlays.
 */
(function () {
  var viewerInstance = null;

  function readCesiumIonToken() {
    var el = document.getElementById("cesium-ion-token-json");
    if (el) {
      try {
        var t = JSON.parse(el.textContent || '""');
        if (typeof t === "string") return t.trim();
      } catch (e) {
        /* ignore */
      }
    }
    if (typeof window.__CESIUM_ION_TOKEN__ === "string") return window.__CESIUM_ION_TOKEN__.trim();
    return "";
  }

  function destroyViewer() {
    if (viewerInstance) {
      try {
        viewerInstance.destroy();
      } catch (e) {
        /* ignore */
      }
      viewerInstance = null;
    }
    var el = document.getElementById("cesiumContainer");
    if (el) el.innerHTML = "";
  }

  /**
   * @returns {Promise<Cesium.Viewer|null>}
   */
  async function initCesiumViewer() {
    if (typeof Cesium === "undefined") {
      console.error("CesiumJS failed to load.");
      return null;
    }

    var token = readCesiumIonToken();
    if (!token) {
      console.warn("Cesium ion access token missing. Add config/cesium-ion.local.js or CESIUM_ION_ACCESS_TOKEN.");
    }
    Cesium.Ion.defaultAccessToken = token;

    destroyViewer();

    viewerInstance = new Cesium.Viewer("cesiumContainer", {
      terrain: Cesium.Terrain.fromWorldTerrain(),
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: true,
      sceneModePicker: false,
      baseLayerPicker: false,
      navigationHelpButton: false,
      fullscreenButton: true,
      infoBox: false,
      selectionIndicator: false,
    });

    try {
      var buildingTileset = await Cesium.createOsmBuildingsAsync();
      viewerInstance.scene.primitives.add(buildingTileset);
    } catch (e) {
      console.warn("Cesium OSM buildings:", e);
    }

    if (typeof viewerInstance.resize === "function") {
      viewerInstance.resize();
    }

    return viewerInstance;
  }

  function getCesiumViewer() {
    return viewerInstance;
  }

  window.initCesiumViewer = initCesiumViewer;
  window.destroyCesiumViewer = destroyViewer;
  window.getCesiumViewer = getCesiumViewer;
})();

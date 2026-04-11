/* global Cesium */

/**

 * Cesium Viewer — Ion token, world terrain, default Ion/Bing-style imagery (위성·항공 타일).

 * Imagery tiles default to low max zoom (저해상·가벼움). Override:
 *   window.__TRACKER_IMAGERY_MAX_LEVEL = 8 (sharper) or keep 1 (very coarse). Default is 1.

 * No 3D buildings (OSM). Flight overlays: cesium.trajectory.js / cesium.visual.js.

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



  /** Default max tile level when unset — coarse imagery, less memory & GPU. */

  var DEFAULT_IMAGERY_MAX_LEVEL = 1;

  /**

   * Cap imagery tile detail (provider.maximumLevel). Lower = blurrier map, less GPU/VRAM/bandwidth.

   */

  function applyImageryMaximumLevel(viewer) {

    if (typeof window === "undefined") return;

    var raw = window.__TRACKER_IMAGERY_MAX_LEVEL;

    var cap =

      raw == null || raw === ""

        ? DEFAULT_IMAGERY_MAX_LEVEL

        : Number(raw);

    if (!Number.isFinite(cap)) return;

    cap = Math.max(0, Math.min(25, Math.floor(cap)));

    function run() {

      try {

        var layers = viewer.imageryLayers;

        if (!layers || layers.length === 0) return;

        for (var i = 0; i < layers.length; i += 1) {

          var p = layers.get(i).imageryProvider;

          if (p && typeof p.maximumLevel === "number") {

            p.maximumLevel = Math.min(p.maximumLevel, cap);

          }

        }

      } catch (e) {

        /* ignore */

      }

    }

    run();

    setTimeout(run, 0);

    setTimeout(run, 120);

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

      console.warn("Cesium Ion access token missing. Set CESIUM_ION_ACCESS_TOKEN in `.env` or host environment.");

    }

    Cesium.Ion.defaultAccessToken = token;



    destroyViewer();



    viewerInstance = new Cesium.Viewer("cesiumContainer", {

      terrain: Cesium.Terrain.fromWorldTerrain(),

      animation: false,

      timeline: false,

      geocoder: false,

      homeButton: false,

      sceneModePicker: false,

      baseLayerPicker: false,

      navigationHelpButton: false,

      fullscreenButton: true,

      infoBox: false,

      selectionIndicator: false,

    });



    /**

     * Internal render scale for the *whole* scene (terrain, imagery, polylines, labels).

     * Separate from imagery tile level: this is how many pixels are shaded per frame.

     */

    viewerInstance.resolutionScale = 1.0;



    viewerInstance.scene.globe.maximumScreenSpaceError = 2;

    viewerInstance.scene.globe.enableLighting = true;

    viewerInstance.scene.verticalExaggeration = 1.0;



    applyImageryMaximumLevel(viewerInstance);



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


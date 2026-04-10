/* global Cesium */
/**
 * Tracker Cesium entry — creates the base viewer, then applies flight overlays from cesium.trajectory.js.
 */
(function () {
  async function initCesiumVisualizer(rawRecords) {
    if (typeof Cesium === "undefined") {
      console.error("CesiumJS failed to load.");
      return;
    }

    var viewer = await window.initCesiumViewer();
    if (!viewer) return;

    window.__trackerLastFlightRecords = Array.isArray(rawRecords) ? rawRecords : [];

    if (typeof window.applyCesiumFlightOverlay === "function") {
      await window.applyCesiumFlightOverlay(viewer, rawRecords);
    }
    if (typeof window.applyTrajectoryScratch === "function") {
      window.applyTrajectoryScratch(viewer, rawRecords);
    }

    function resizeViewer() {
      if (viewer && typeof viewer.resize === "function") viewer.resize();
    }
    resizeViewer();
    requestAnimationFrame(resizeViewer);
    setTimeout(resizeViewer, 120);
    if (typeof ResizeObserver !== "undefined") {
      var el = document.getElementById("cesiumContainer");
      if (el) {
        var ro = new ResizeObserver(resizeViewer);
        ro.observe(el);
      }
    }
  }

  window.initCesiumVisualizer = initCesiumVisualizer;
})();

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

    if (typeof window.applyCesiumFlightOverlay === "function") {
      await window.applyCesiumFlightOverlay(viewer, rawRecords);
    }
    if (typeof window.applyTrajectoryScratch === "function") {
      window.applyTrajectoryScratch(viewer, rawRecords);
    }
  }

  window.initCesiumVisualizer = initCesiumVisualizer;
})();

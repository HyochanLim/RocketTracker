/* global Cesium */
(function () {
  var viewer = null;

  function initCesiumVisualizer() {
    if (viewer) {
      viewer.resize();
      return viewer;
    }

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
    });

    viewer.scene.screenSpaceCameraController.enableLook = false;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;

    var playButton = document.getElementById("playButton");
    var progressBar = document.getElementById("playbackProgress");
    var progress = 0;
    var isPlaying = false;
    var timer = null;

    function updateUI() {
      if (playButton) playButton.textContent = isPlaying ? "Pause" : "Play";
      if (progressBar) progressBar.value = String(progress);
    }

    function startPlayback() {
      if (timer) return;
      timer = setInterval(function () {
        progress += 1;
        if (progress > 100) progress = 0;
        updateUI();
      }, 120);
    }

    function stopPlayback() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }

    if (playButton) {
      playButton.addEventListener("click", function () {
        isPlaying = !isPlaying;
        if (isPlaying) startPlayback();
        else stopPlayback();
        updateUI();
      });
    }

    if (progressBar) {
      progressBar.addEventListener("input", function () {
        progress = Number(progressBar.value || 0);
        updateUI();
      });
    }

    updateUI();
    return viewer;
  }

  window.initCesiumVisualizer = initCesiumVisualizer;
})();

(function () {
  var fileInput = document.getElementById("tracker-upload-file");
  var savedSelect = document.getElementById("saved-flight-file");
  var analyzeWrap = document.getElementById("tracker-analyze-wrap");
  var showVisualizerButton = document.getElementById("showVisualizerButton");
  var backToUploadButton = document.getElementById("backToUploadButton");
  var inputSection = document.getElementById("trackerInputSection");
  var visualizerSection = document.getElementById("trackerVisualizerSection");
  if (!analyzeWrap) return;

  function updateAnalyzeButtonVisibility() {
    var hasUpload = fileInput && fileInput.files && fileInput.files.length > 0;
    var hasSaved = savedSelect && savedSelect.value && savedSelect.value.trim() !== "";
    analyzeWrap.hidden = !(hasUpload || hasSaved);
  }

  function showVisualizer() {
    if (inputSection) inputSection.classList.add("tracker-hidden-section");
    if (visualizerSection) visualizerSection.classList.remove("tracker-hidden-section");
    if (window.initCesiumVisualizer) window.initCesiumVisualizer();
  }

  function showInputSection() {
    if (visualizerSection) visualizerSection.classList.add("tracker-hidden-section");
    if (inputSection) inputSection.classList.remove("tracker-hidden-section");
  }

  if (fileInput) fileInput.addEventListener("change", updateAnalyzeButtonVisibility);
  if (savedSelect) savedSelect.addEventListener("change", updateAnalyzeButtonVisibility);
  if (showVisualizerButton) showVisualizerButton.addEventListener("click", showVisualizer);
  if (backToUploadButton) backToUploadButton.addEventListener("click", showInputSection);
  updateAnalyzeButtonVisibility();
})();

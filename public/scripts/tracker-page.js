(function () {
  var fileInput = document.getElementById("tracker-upload-file");
  var clearFileButton = document.getElementById("clear-upload-file-button");
  var analyzeWrap = document.getElementById("tracker-analyze-wrap");
  var showVisualizerButton = document.getElementById("showVisualizerButton");
  var backToUploadButton = document.getElementById("backToUploadButton");
  var inputSection = document.getElementById("trackerInputSection");
  var visualizerSection = document.getElementById("trackerVisualizerSection");
  var csrfTokenInput = document.getElementById("tracker-csrf-token");
  var savedControls = document.getElementById("tracker-saved-controls");
  var savedList = document.getElementById("tracker-saved-list");
  var emptyText = document.getElementById("tracker-empty-text");
  var warningBox = document.getElementById("tracker-warning");
  var selectedSavedFileId = "";
  var warningTimer = null;
  if (!analyzeWrap) return;

  function updateAnalyzeButtonVisibility() {
    var hasUpload = fileInput && fileInput.files && fileInput.files.length > 0;
    var hasSaved = selectedSavedFileId.trim() !== "";
    analyzeWrap.hidden = !(hasUpload || hasSaved);
  }

  function showVisualizer() {
    clearWarning();
    if (inputSection) inputSection.classList.add("tracker-hidden-section");
    if (visualizerSection) visualizerSection.classList.remove("tracker-hidden-section");
  }

  async function getSavedFileRecords(fileId) {
    var response = await fetch("/tracker/file/" + encodeURIComponent(fileId) + "/data", {
      method: "GET",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    var data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Failed to load saved flight data.");
    }
    return Array.isArray(data.records) ? data.records : [];
  }

  function showVisualizerWithRecords(records) {
    showVisualizer();
    if (window.initCesiumVisualizer) window.initCesiumVisualizer(records);
  }

  function showInputSection() {
    if (visualizerSection) visualizerSection.classList.add("tracker-hidden-section");
    if (inputSection) inputSection.classList.remove("tracker-hidden-section");
  }

  function clearWarning() {
    if (!warningBox) return;
    warningBox.textContent = "";
    warningBox.classList.add("tracker-hidden-section");
    if (warningTimer) {
      window.clearTimeout(warningTimer);
      warningTimer = null;
    }
  }

  function showWarning(message) {
    if (!warningBox) return;
    warningBox.textContent = message || "Something went wrong.";
    warningBox.classList.remove("tracker-hidden-section");
    if (warningTimer) window.clearTimeout(warningTimer);
    warningTimer = window.setTimeout(clearWarning, 4200);
  }

  function selectSavedFile(fileId) {
    selectedSavedFileId = fileId || "";
    if (!savedList) return;

    var items = savedList.querySelectorAll(".tracker-saved-item");
    items.forEach(function (item) {
      item.classList.toggle("is-selected", item.getAttribute("data-file-id") === selectedSavedFileId);
    });
  }

  function toggleSavedFile(fileId) {
    if (!fileId) return;
    if (selectedSavedFileId === fileId) {
      selectSavedFile("");
    } else {
      selectSavedFile(fileId);
    }
  }

  function appendSavedCard(file) {
    if (!savedList || !file || !file._id) return;
    var existing = savedList.querySelector('[data-file-id="' + file._id + '"]');
    if (existing) return;

    var item = document.createElement("div");
    item.className = "tracker-saved-item";
    item.setAttribute("data-file-id", file._id);
    item.innerHTML = "<strong>" + file.originalName + "</strong>";
    item.addEventListener("click", function () {
      toggleSavedFile(file._id);
      updateAnalyzeButtonVisibility();
    });
    savedList.prepend(item);
  }

  function showSavedSection() {
    if (savedControls) savedControls.classList.remove("tracker-hidden-section");
    if (emptyText) emptyText.classList.add("tracker-hidden-section");
  }

  async function uploadSelectedFile() {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) return { uploaded: false };

    var token = csrfTokenInput ? csrfTokenInput.value : "";
    var formData = new FormData();
    formData.append("file", fileInput.files[0]);
    if (token) formData.append("_csrf", token);

    var response = await fetch("/tracker/upload", {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "CSRF-Token": token,
      },
      body: formData,
    });

    var data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Upload failed.");
    }

    if (data.file) {
      showSavedSection();
      appendSavedCard(data.file);
      selectSavedFile(data.file._id);
    }
    if (fileInput) fileInput.value = "";
    return data;
  }

  async function handleAnalyzeClick() {
    try {
      clearWarning();
      var hasUpload = fileInput && fileInput.files && fileInput.files.length > 0;
      var hasSaved = selectedSavedFileId.trim() !== "";
      if (!hasUpload && !hasSaved) return;
      if (hasUpload && hasSaved) {
        showWarning("You selected both a new file and a saved file. Please choose only one.");
        return;
      }

      if (hasUpload) {
        if (showVisualizerButton) showVisualizerButton.disabled = true;
        var uploaded = await uploadSelectedFile();
        if (!uploaded || !uploaded.file || !uploaded.file._id) {
          throw new Error("Uploaded file data not found.");
        }
        var uploadedRecords = await getSavedFileRecords(uploaded.file._id);
        showVisualizerWithRecords(uploadedRecords);
        return;
      }

      var savedRecords = await getSavedFileRecords(selectedSavedFileId);
      showVisualizerWithRecords(savedRecords);
    } catch (error) {
      showWarning(error && error.message ? error.message : "Failed to prepare analysis.");
    } finally {
      if (showVisualizerButton) showVisualizerButton.disabled = false;
      updateAnalyzeButtonVisibility();
    }
  }

  if (fileInput) fileInput.addEventListener("change", updateAnalyzeButtonVisibility);
  if (clearFileButton) {
    clearFileButton.addEventListener("click", function () {
      if (fileInput) fileInput.value = "";
      updateAnalyzeButtonVisibility();
      clearWarning();
    });
  }
  if (savedList) {
    savedList.querySelectorAll(".tracker-saved-item").forEach(function (item) {
      item.addEventListener("click", function () {
        toggleSavedFile(item.getAttribute("data-file-id"));
        updateAnalyzeButtonVisibility();
      });
    });
  }
  if (showVisualizerButton) showVisualizerButton.addEventListener("click", handleAnalyzeClick);
  if (backToUploadButton) backToUploadButton.addEventListener("click", showInputSection);
  updateAnalyzeButtonVisibility();
})();

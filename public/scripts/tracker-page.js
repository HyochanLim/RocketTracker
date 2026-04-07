(function () {
  var fileInput = document.getElementById("tracker-upload-file");
  var clearFileButton = document.getElementById("clear-upload-file-button");
  var analyzeWrap = document.getElementById("tracker-analyze-wrap");
  var showVisualizerButton = document.getElementById("showVisualizerButton");
  var inputSection = document.getElementById("trackerInputSection");
  var visualizerSection = document.getElementById("trackerVisualizerSection");
  var csrfTokenInput = document.getElementById("tracker-csrf-token");
  var savedControls = document.getElementById("tracker-saved-controls");
  var savedList = document.getElementById("tracker-saved-list");
  var emptyText = document.getElementById("tracker-empty-text");
  var warningBox = document.getElementById("tracker-warning");
  var analyzeLoading = document.getElementById("tracker-analyze-loading");
  var analyzeLoadingText = document.getElementById("tracker-analyze-loading-text");
  var selectedSavedFileId = "";
  var warningTimer = null;

  function setAnalyzeLoading(active, message) {
    if (!analyzeLoading) return;
    if (analyzeLoadingText && typeof message === "string" && message) {
      analyzeLoadingText.textContent = message;
    }
    analyzeLoading.classList.toggle("tracker-hidden-section", !active);
    analyzeLoading.setAttribute("aria-hidden", active ? "false" : "true");
    if (showVisualizerButton) showVisualizerButton.disabled = !!active;
  }

  function updateAnalyzeButtonVisibility() {
    var hasUpload = fileInput && fileInput.files && fileInput.files.length > 0;
    var hasSaved = selectedSavedFileId.trim() !== "";
    if (analyzeWrap) analyzeWrap.hidden = !(hasUpload || hasSaved);
  }

  function showVisualizer() {
    clearWarning();
    if (inputSection) inputSection.classList.add("tracker-hidden-section");
    if (visualizerSection) visualizerSection.classList.remove("tracker-hidden-section");
    if (document.documentElement) document.documentElement.classList.add("tracker-map-mode");
    if (document.body) document.body.classList.add("tracker-map-mode");
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
    setTimeout(function () {
      var v = window.getCesiumViewer && window.getCesiumViewer();
      if (v && typeof v.resize === "function") v.resize();
    }, 150);
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

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function updateSavedListEmptyState() {
    if (!savedList) return;
    var count = savedList.querySelectorAll(".tracker-saved-item").length;
    if (count === 0) {
      if (emptyText) emptyText.classList.remove("tracker-hidden-section");
      if (savedControls) savedControls.classList.add("tracker-hidden-section");
    }
  }

  async function deleteSavedFlight(fileId) {
    if (!fileId) return;
    if (!window.confirm("Delete this saved flight from the server? This cannot be undone.")) return;
    var token = csrfTokenInput ? csrfTokenInput.value : "";
    try {
      var response = await fetch("/tracker/file/" + encodeURIComponent(fileId) + "/delete", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "CSRF-Token": token,
        },
        body: JSON.stringify({ _csrf: token }),
      });
      var data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Failed to delete.");
      }
      var row = savedList && savedList.querySelector('.tracker-saved-item[data-file-id="' + fileId + '"]');
      if (row) row.remove();
      if (selectedSavedFileId === fileId) selectSavedFile("");
      updateSavedListEmptyState();
      updateAnalyzeButtonVisibility();
      clearWarning();
    } catch (error) {
      showWarning(error && error.message ? error.message : "Failed to delete saved file.");
    }
  }

  function appendSavedCard(file) {
    if (!savedList || !file || !file._id) return;
    var existing = savedList.querySelector('[data-file-id="' + file._id + '"]');
    if (existing) return;

    var item = document.createElement("div");
    item.className = "tracker-saved-item";
    item.setAttribute("data-file-id", file._id);
    item.innerHTML =
      '<span class="tracker-saved-item-label"><strong>' +
      escapeHtml(file.originalName) +
      '</strong></span><button type="button" class="button button-ghost tracker-saved-delete" data-file-id="' +
      escapeHtml(file._id) +
      '" aria-label="Delete saved flight file">Delete</button>';
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
        setAnalyzeLoading(
          true,
          "Analyzing flight data (AI mapping)…"
        );
        var uploaded = await uploadSelectedFile();
        if (!uploaded || !uploaded.file || !uploaded.file._id) {
          throw new Error("Uploaded file data not found.");
        }
        setAnalyzeLoading(true, "Loading processed flight data…");
        var uploadedRecords = await getSavedFileRecords(uploaded.file._id);
        window.__trackerActiveFileId = uploaded.file._id;
        showVisualizerWithRecords(uploadedRecords);
        return;
      }

      setAnalyzeLoading(true, "Loading flight data…");
      var savedRecords = await getSavedFileRecords(selectedSavedFileId);
      window.__trackerActiveFileId = selectedSavedFileId;
      showVisualizerWithRecords(savedRecords);
    } catch (error) {
      showWarning(error && error.message ? error.message : "Failed to prepare analysis.");
    } finally {
      setAnalyzeLoading(false);
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
  function clickTargetElement(ev) {
    var t = ev.target;
    if (!t) return null;
    if (t.nodeType === 1) return t;
    return t.parentElement;
  }

  if (savedList) {
    savedList.addEventListener("click", function (ev) {
      var el = clickTargetElement(ev);
      if (!el || !el.closest) return;
      var delBtn = el.closest(".tracker-saved-delete");
      if (delBtn) {
        ev.preventDefault();
        ev.stopPropagation();
        deleteSavedFlight(delBtn.getAttribute("data-file-id"));
        return;
      }
      var row = el.closest(".tracker-saved-item");
      if (!row) return;
      toggleSavedFile(row.getAttribute("data-file-id"));
      updateAnalyzeButtonVisibility();
    });
  }
  if (showVisualizerButton) showVisualizerButton.addEventListener("click", handleAnalyzeClick);

  updateAnalyzeButtonVisibility();
})();

(function initAgentDockToggle() {
  var workbench = document.getElementById("tracker-visualizer-workbench");
  var toggle = document.getElementById("tracker-agent-toggle");
  var dock = document.getElementById("tracker-agent-dock");
  if (!workbench || !toggle || !dock) return;

  function resizeCesium() {
    var v = window.getCesiumViewer && window.getCesiumViewer();
    if (v && typeof v.resize === "function") v.resize();
  }

  /** One resize after CSS settles — calling resize() during the transition often stutters WebGL */
  var RESIZE_AFTER_TOGGLE_MS = 580;
  var resizeAfterToggleTimer = null;

  function scheduleResizeAfterToggle() {
    if (resizeAfterToggleTimer) window.clearTimeout(resizeAfterToggleTimer);
    resizeAfterToggleTimer = window.setTimeout(function () {
      resizeAfterToggleTimer = null;
      resizeCesium();
      requestAnimationFrame(resizeCesium);
    }, RESIZE_AFTER_TOGGLE_MS);
  }

  function syncToggleUi(open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    dock.setAttribute("aria-hidden", open ? "false" : "true");
    toggle.classList.toggle("is-open", !!open);
    toggle.setAttribute(
      "aria-label",
      open ? "Close AI assistant panel" : "Open AI assistant panel",
    );
  }

  function setOpen(open) {
    var on = !!open;
    workbench.classList.toggle("is-agent-open", on);
    syncToggleUi(on);
    if (typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype) {
      dock.inert = !on;
    }
    scheduleResizeAfterToggle();
    if (on) {
      window.setTimeout(function () {
        var input = document.getElementById("tracker-agent-input");
        if (input) {
          input.focus();
          if (typeof window.__trackerFitAgentInput === "function") window.__trackerFitAgentInput();
        }
      }, 420);
    } else if (dock.contains(document.activeElement)) {
      toggle.focus();
    }
  }

  function isOpen() {
    return workbench.classList.contains("is-agent-open");
  }

  toggle.addEventListener("click", function () {
    setOpen(!isOpen());
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape" || !isOpen()) return;
    var vs = document.getElementById("trackerVisualizerSection");
    if (!vs || vs.classList.contains("tracker-hidden-section")) return;
    setOpen(false);
  });

  if (typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype) {
    dock.inert = true;
  }

  window.__trackerSetAgentOpen = setOpen;
})();

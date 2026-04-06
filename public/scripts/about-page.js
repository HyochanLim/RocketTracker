(function () {
  var modal = document.getElementById("aboutProfileModal");
  var overlay = document.getElementById("aboutProfileModalOverlay");
  var closeBtn = document.getElementById("aboutProfileModalClose");
  var triggers = document.querySelectorAll("[data-about-profile-open=\"true\"]");
  var mailTrigger = document.getElementById("aboutMailTrigger");
  var mailPopover = document.getElementById("aboutMailPopover");
  var copyButtons = document.querySelectorAll("[data-copy]");

  if (!modal || !overlay || !triggers || triggers.length === 0) return;

  var lastFocused = null;
  var copiedTimer = null;

  function setOpen(open) {
    overlay.classList.toggle("is-open", open);
    modal.classList.toggle("is-open", open);

    overlay.setAttribute("aria-hidden", open ? "false" : "true");
    modal.setAttribute("aria-hidden", open ? "false" : "true");

    document.body.classList.toggle("about-modal-open", open);

    if (open) {
      lastFocused = document.activeElement;
      window.setTimeout(function () {
        modal.focus();
      }, 0);
    } else if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
      lastFocused = null;
    }
  }

  function openModal() {
    setOpen(true);
  }

  function closeModal() {
    setMailPopoverOpen(false);
    setOpen(false);
  }

  function setMailPopoverOpen(open) {
    if (!mailTrigger || !mailPopover) return;
    mailPopover.classList.toggle("is-open", open);
    mailPopover.setAttribute("aria-hidden", open ? "false" : "true");
    mailTrigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  async function copyTextToClipboard(text) {
    var value = String(text || "");
    if (!value) return false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (e) {
        // fall through to legacy path
      }
    }

    try {
      var ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.left = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e2) {
      return false;
    }
  }

  function showCopied(el) {
    if (!el) return;
    el.classList.add("is-copied");
    if (copiedTimer) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(function () {
      el.classList.remove("is-copied");
    }, 1100);
  }

  triggers.forEach(function (el) {
    el.addEventListener("click", openModal);
  });
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  overlay.addEventListener("click", closeModal);

  document.addEventListener("keydown", function (e) {
    if (!modal.classList.contains("is-open")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
    }
  });

  if (mailTrigger && mailPopover) {
    mailTrigger.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setMailPopoverOpen(!mailPopover.classList.contains("is-open"));
    });

    mailTrigger.addEventListener("mouseenter", function () {
      setMailPopoverOpen(true);
    });

    if (modal) {
      modal.addEventListener("mouseleave", function () {
        setMailPopoverOpen(false);
      });
    }

    document.addEventListener("click", function (e) {
      if (!mailPopover.classList.contains("is-open")) return;
      if (mailPopover.contains(e.target) || mailTrigger.contains(e.target)) return;
      setMailPopoverOpen(false);
    });
  }

  if (copyButtons && copyButtons.length > 0) {
    copyButtons.forEach(function (btn) {
      btn.addEventListener("click", async function (e) {
        e.preventDefault();
        var text = btn.getAttribute("data-copy") || "";
        var ok = await copyTextToClipboard(text);
        if (ok) showCopied(btn);
      });
    });
  }
})();


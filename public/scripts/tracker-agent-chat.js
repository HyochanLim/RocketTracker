/**
 * Tracker agent panel — multi-turn chat. Server adds system + flight context and
 * forwards user/assistant history to the sandbox LLM.
 */
(function () {
  var thread = document.getElementById("tracker-agent-thread");
  var welcome = document.getElementById("tracker-agent-welcome");
  var messagesEl = document.getElementById("tracker-agent-messages");
  var input = document.getElementById("tracker-agent-input");
  var sendBtn = document.getElementById("tracker-agent-send");
  var csrfEl = document.getElementById("tracker-csrf-token");

  if (!thread || !input || !sendBtn) return;

  /** @type {{role:string, content:string}[]} */
  var transcript = [];
  var busy = false;

  function escapeHtml(t) {
    return String(t || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function scrollThread() {
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }

  function ensureMessagesVisible() {
    if (welcome) welcome.hidden = true;
    if (messagesEl) messagesEl.hidden = false;
  }

  function appendBubble(role, text) {
    if (!messagesEl) return;
    ensureMessagesVisible();
    var wrap = document.createElement("div");
    wrap.className =
      "tracker-agent-msg " + (role === "user" ? "tracker-agent-msg--user" : "tracker-agent-msg--assistant");
    var inner = document.createElement("div");
    inner.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
    if (role === "user") {
      inner.className = "tracker-agent-msg-bubble";
    } else {
      inner.className = "tracker-agent-msg-content";
    }
    wrap.appendChild(inner);
    messagesEl.appendChild(wrap);
    scrollThread();
    return wrap;
  }

  function appendArtifacts(parent, artifacts) {
    if (!parent || !artifacts || !Array.isArray(artifacts) || artifacts.length === 0) return;
    for (var i = 0; i < artifacts.length; i += 1) {
      var a = artifacts[i];
      if (!a || typeof a !== "object") continue;
      var mime = String(a.mime || "");
      var base64 = String(a.base64 || "");
      var name = String(a.name || "");
      if (!mime || !base64) continue;

      if (mime.indexOf("image/") === 0) {
        var img = document.createElement("img");
        img.className = "tracker-agent-artifact-image";
        img.alt = name || "artifact image";
        img.src = "data:" + mime + ";base64," + base64;
        parent.appendChild(img);
      } else {
        var pre = document.createElement("pre");
        pre.className = "tracker-agent-artifact-raw";
        pre.textContent = (name ? name + "\n" : "") + "(unsupported artifact type: " + mime + ")";
        parent.appendChild(pre);
      }
    }
    scrollThread();
  }

  function makeDialog(titleText, bodyPreText) {
    var dlg = document.createElement("dialog");
    dlg.className = "tracker-agent-dialog";
    var inner = document.createElement("div");
    inner.className = "tracker-agent-dialog-inner";
    var head = document.createElement("div");
    head.className = "tracker-agent-dialog-head";
    var title = document.createElement("span");
    title.className = "tracker-agent-dialog-title";
    title.textContent = titleText;
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tracker-agent-dialog-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "닫기";
    closeBtn.addEventListener("click", function () {
      dlg.close();
    });
    head.appendChild(title);
    head.appendChild(closeBtn);
    var pre = document.createElement("pre");
    pre.className = "tracker-agent-dialog-pre";
    pre.textContent = bodyPreText;
    inner.appendChild(head);
    inner.appendChild(pre);
    dlg.appendChild(inner);
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg) dlg.close();
    });
    return dlg;
  }

  /** Below assistant text: optional code / 세부 수치 buttons opening dialogs */
  function appendAssistantActionRow(parent, data) {
    if (!parent) return;
    var code = data.executedCode != null && String(data.executedCode).trim() ? String(data.executedCode).trim() : "";
    var hasResult = data.result != null;
    if (!code && !hasResult) return;

    var row = document.createElement("div");
    row.className = "tracker-agent-msg-actions";

    if (code) {
      var btnC = document.createElement("button");
      btnC.type = "button";
      btnC.className = "tracker-agent-msg-action";
      btnC.textContent = "코드 보기";
      var dlgC = makeDialog("실행된 Python 코드", code);
      document.body.appendChild(dlgC);
      btnC.addEventListener("click", function () {
        if (typeof dlgC.showModal === "function") dlgC.showModal();
        else window.alert(code.slice(0, 4000) + (code.length > 4000 ? "\n…" : ""));
      });
      row.appendChild(btnC);
    }

    if (hasResult) {
      var jsonStr = "";
      try {
        jsonStr = JSON.stringify(data.result, null, 2);
      } catch (_) {
        jsonStr = String(data.result);
      }
      var btnR = document.createElement("button");
      btnR.type = "button";
      btnR.className = "tracker-agent-msg-action";
      btnR.textContent = "세부 수치 · 표";
      var dlgR = makeDialog("세부 수치 · 표 (result.json)", jsonStr);
      document.body.appendChild(dlgR);
      btnR.addEventListener("click", function () {
        if (typeof dlgR.showModal === "function") dlgR.showModal();
        else window.alert(jsonStr.slice(0, 4000) + (jsonStr.length > 4000 ? "\n…" : ""));
      });
      row.appendChild(btnR);
    }

    parent.appendChild(row);
    scrollThread();
  }

  function appendTyping() {
    if (!messagesEl) return;
    ensureMessagesVisible();
    var id = "tracker-agent-typing-" + Date.now();
    var wrap = document.createElement("div");
    wrap.className = "tracker-agent-msg tracker-agent-msg--assistant";
    wrap.id = id;
    var typing = document.createElement("div");
    typing.className = "tracker-agent-msg-typing";
    typing.setAttribute("aria-label", "Assistant is replying");
    typing.innerHTML =
      '<span class="tracker-agent-typing-dots" aria-hidden="true">' +
      "<span></span><span></span><span></span></span>";
    wrap.appendChild(typing);
    messagesEl.appendChild(wrap);
    scrollThread();
    return id;
  }

  function removeNode(id) {
    var n = document.getElementById(id);
    if (n) n.remove();
  }

  function syncSend() {
    sendBtn.disabled = busy || !String(input.value || "").trim();
  }

  /** Grow/shrink with line breaks; scroll only beyond CSS max-height. */
  function fitInputHeight() {
    var cs = window.getComputedStyle(input);
    var minH = parseFloat(cs.minHeight, 10) || 0;
    var maxH = parseFloat(cs.maxHeight, 10) || Infinity;
    input.style.overflowY = "hidden";
    input.style.height = "auto";
    var sh = input.scrollHeight;
    var h = Math.min(Math.max(sh, minH), maxH);
    input.style.height = h + "px";
    input.style.overflowY = sh > maxH ? "auto" : "hidden";
  }

  async function onSend() {
    var text = String(input.value || "").trim();
    if (!text || busy) return;
    var token = csrfEl ? csrfEl.value : "";
    if (!token) {
      appendBubble("assistant", "Missing CSRF token. Refresh the page and try again.");
      return;
    }

    busy = true;
    syncSend();
    input.value = "";
    fitInputHeight();
    appendBubble("user", text);
    transcript.push({ role: "user", content: text });

    var typingId = appendTyping();

    try {
      var res = await fetch("/tracker/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "csrf-token": token,
          "xsrf-token": token,
        },
        body: JSON.stringify({
          _csrf: token,
          messages: transcript,
          fileId: (typeof window !== "undefined" && window.__trackerActiveFileId) || "",
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      removeNode(typingId);
      if (!res.ok || !data.ok) {
        var err = data.message || "Request failed (" + res.status + ")";
        appendBubble("assistant", err);
        transcript.pop();
        return;
      }
      var reply = String(data.text || "").trim() || "(empty reply)";
      transcript.push({ role: "assistant", content: reply });
      var wrap = appendBubble("assistant", reply);
      if (wrap) {
        appendAssistantActionRow(wrap, data);
        appendArtifacts(wrap, data.artifacts);
      }
    } catch (e) {
      removeNode(typingId);
      appendBubble("assistant", "Network error: " + (e.message || String(e)));
      transcript.pop();
    } finally {
      busy = false;
      syncSend();
      input.focus();
    }
  }

  sendBtn.addEventListener("click", onSend);
  input.addEventListener("input", function () {
    fitInputHeight();
    syncSend();
  });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      onSend();
    }
  });
  fitInputHeight();
  syncSend();

  window.__trackerFitAgentInput = fitInputHeight;
})();

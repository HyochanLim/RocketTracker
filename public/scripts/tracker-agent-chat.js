/**
 * Tracker agent panel — multi-turn chat within one page load. Server still persists
 * transcripts to disk, but this UI does not reload them after refresh or file change.
 */
(function () {
  var thread = document.getElementById("tracker-agent-thread");
  var welcome = document.getElementById("tracker-agent-welcome");
  var messagesEl = document.getElementById("tracker-agent-messages");
  var input = document.getElementById("tracker-agent-input");
  var sendBtn = document.getElementById("tracker-agent-send");
  var csrfEl = document.getElementById("tracker-csrf-token");
  var newChatBtn = document.getElementById("tracker-agent-new-chat");

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

  /** Turn HTML / Express default error pages into a short message for modals. */
  function humanizeFetchErrorBody(res, rawText, jsonMessage) {
    var jm = jsonMessage != null && String(jsonMessage).trim();
    if (jm) return jm;
    var raw = String(rawText || "").trim();
    var code = res && typeof res.status === "number" ? res.status : 0;
    if (!raw) {
      return "요청이 처리되지 않았습니다 (HTTP " + code + "). 페이지를 새로고침한 뒤 다시 시도하세요.";
    }
    // Stop before '<' so HTML like <pre>Cannot POST /path</pre> does not capture "</pre>".
    var cannot = raw.match(/Cannot (POST|GET|PUT|PATCH|DELETE)\s+([^\s<]+)/i);
    if (cannot) {
      return (
        "서버에 이 API가 등록되어 있지 않습니다: " +
        cannot[2] +
        " (" +
        cannot[1].toUpperCase() +
        ", HTTP " +
        code +
        "). 최신 코드를 쓰는지 확인하고 Node 서버를 한 번 재시작해 주세요."
      );
    }
    if (/^<!DOCTYPE/i.test(raw) || /<html[\s>]/i.test(raw)) {
      return (
        "서버가 HTML 오류 페이지를 반환했습니다 (HTTP " +
        code +
        "). 주소·배포 버전·서버 재시작을 확인해 주세요."
      );
    }
    if (raw.length > 500) return raw.slice(0, 500) + "…";
    return raw;
  }

  /** Native <dialog> alert (no window.alert). */
  function showTrackerAlertModal(title, bodyText) {
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "tracker-agent-dialog tracker-agent-dialog--narrow";
      var inner = document.createElement("div");
      inner.className = "tracker-agent-dialog-inner";
      var head = document.createElement("div");
      head.className = "tracker-agent-dialog-head";
      var ttl = document.createElement("span");
      ttl.className = "tracker-agent-dialog-title";
      ttl.textContent = title || "알림";
      head.appendChild(ttl);
      var body = document.createElement("div");
      body.className = "tracker-agent-dialog-body";
      body.textContent = String(bodyText || "");
      var actions = document.createElement("div");
      actions.className = "tracker-agent-dialog-actions";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "button button-secondary";
      ok.textContent = "확인";
      function close() {
        try {
          dlg.close();
        } catch (_) {
          /* ignore */
        }
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve();
      }
      ok.addEventListener("click", close);
      actions.appendChild(ok);
      inner.appendChild(head);
      inner.appendChild(body);
      inner.appendChild(actions);
      dlg.appendChild(inner);
      dlg.addEventListener("click", function (ev) {
        if (ev.target === dlg) close();
      });
      dlg.addEventListener("cancel", function (ev) {
        ev.preventDefault();
        close();
      });
      document.body.appendChild(dlg);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else {
        window.alert(String(title || "") + "\n\n" + String(bodyText || "").slice(0, 2500));
        close();
      }
    });
  }

  /** Confirm modal; resolves true / false (no window.confirm). */
  function showTrackerConfirmModal(title, bodyText, confirmLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var settled = false;
      var dlg = document.createElement("dialog");
      dlg.className = "tracker-agent-dialog tracker-agent-dialog--narrow";
      var inner = document.createElement("div");
      inner.className = "tracker-agent-dialog-inner";
      var head = document.createElement("div");
      head.className = "tracker-agent-dialog-head";
      var ttl = document.createElement("span");
      ttl.className = "tracker-agent-dialog-title";
      ttl.textContent = title || "확인";
      head.appendChild(ttl);
      var body = document.createElement("div");
      body.className = "tracker-agent-dialog-body";
      body.textContent = String(bodyText || "");
      var actions = document.createElement("div");
      actions.className = "tracker-agent-dialog-actions";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button button-ghost";
      cancel.textContent = cancelLabel || "취소";
      var go = document.createElement("button");
      go.type = "button";
      go.className = "button button-secondary";
      go.textContent = confirmLabel || "확인";
      function finish(v) {
        if (settled) return;
        settled = true;
        try {
          dlg.close();
        } catch (_) {
          /* ignore */
        }
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(!!v);
      }
      cancel.addEventListener("click", function () {
        finish(false);
      });
      go.addEventListener("click", function () {
        finish(true);
      });
      actions.appendChild(cancel);
      actions.appendChild(go);
      inner.appendChild(head);
      inner.appendChild(body);
      inner.appendChild(actions);
      dlg.appendChild(inner);
      dlg.addEventListener("click", function (ev) {
        if (ev.target === dlg) finish(false);
      });
      dlg.addEventListener("cancel", function (ev) {
        ev.preventDefault();
        finish(false);
      });
      document.body.appendChild(dlg);
      if (typeof dlg.showModal === "function") dlg.showModal();
      else finish(window.confirm(String(bodyText || "")));
    });
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

  function clearThreadUi() {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    if (welcome) welcome.hidden = false;
    messagesEl.hidden = true;
  }

  /** Always start with an empty thread (no restore from disk after refresh or file change). */
  async function loadHistoryForFile(fileId) {
    var fid = String(fileId || "").trim();
    transcript = [];
    clearThreadUi();
    scrollThread();
    if (fid && typeof window.__trackerEnsureVisualizerForFile === "function") {
      window.__trackerEnsureVisualizerForFile(fid);
    }
  }

  function applyVizFromAgentResponse(data) {
    var cmds = null;
    if (data && Array.isArray(data.vizCommands) && data.vizCommands.length) cmds = data.vizCommands;
    else if (data && data.result && Array.isArray(data.result.vizCommands) && data.result.vizCommands.length) {
      cmds = data.result.vizCommands;
    }
    if (!cmds || !cmds.length) return;
    if (typeof window.__trackerApplyVizCommands !== "function") return;
    window.__trackerApplyVizCommands(cmds).then(function (r) {
      if (r && r.errors && r.errors.length) console.warn("[vizCommands]", r.errors.join("; "));
    });
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

  function makeCodeEditorDialog(initialCode) {
    var dlg = document.createElement("dialog");
    dlg.className = "tracker-agent-dialog tracker-agent-dialog--code";
    var inner = document.createElement("div");
    inner.className = "tracker-agent-dialog-inner";
    var head = document.createElement("div");
    head.className = "tracker-agent-dialog-head";
    var title = document.createElement("span");
    title.className = "tracker-agent-dialog-title";
    title.textContent = "실행된 Python 코드";
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

    var ta = document.createElement("textarea");
    ta.className = "tracker-agent-dialog-code";
    ta.setAttribute("spellcheck", "false");
    ta.value = String(initialCode || "");

    var foot = document.createElement("div");
    foot.className = "tracker-agent-dialog-foot";
    var runBtn = document.createElement("button");
    runBtn.type = "button";
    runBtn.className = "button button-secondary tracker-agent-dialog-run";
    runBtn.textContent = "이 코드로 다시 실행";
    var statusEl = document.createElement("span");
    statusEl.className = "tracker-agent-dialog-run-status";
    statusEl.setAttribute("aria-live", "polite");
    foot.appendChild(runBtn);
    foot.appendChild(statusEl);

    inner.appendChild(head);
    inner.appendChild(ta);
    inner.appendChild(foot);
    dlg.appendChild(inner);
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg) dlg.close();
    });

    runBtn.addEventListener("click", async function () {
      var token = csrfEl ? csrfEl.value : "";
      if (!token) {
        statusEl.textContent = "CSRF 토큰 없음. 새로고침 후 다시 시도하세요.";
        return;
      }
      var fid = (typeof window !== "undefined" && window.__trackerActiveFileId) || "";
      var py = String(ta.value || "").trim();
      if (!py) {
        statusEl.textContent = "코드가 비어 있습니다.";
        return;
      }
      runBtn.disabled = true;
      statusEl.textContent = "실행 중…";
      try {
        var res = await fetch("/tracker/agent/run", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "CSRF-Token": token,
            "csrf-token": token,
            "xsrf-token": token,
          },
          body: JSON.stringify({ _csrf: token, fileId: fid, code: py }),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || !data.ok) {
          statusEl.textContent = data.message || "실행 실패 (" + res.status + ")";
          runBtn.disabled = false;
          return;
        }
        statusEl.textContent = "완료";
        dlg.close();
        var reply = String(data.text || "").trim() || "(empty)";
        transcript.push({ role: "assistant", content: "[재실행] " + reply });
        var wrap = appendBubble("assistant", "[재실행] " + reply);
        if (wrap) {
          appendAssistantActionRow(wrap, data);
          appendArtifacts(wrap, data.artifacts);
        }
        applyVizFromAgentResponse(data);
        scrollThread();
      } catch (e) {
        statusEl.textContent = "네트워크 오류: " + (e.message || String(e));
      } finally {
        runBtn.disabled = false;
      }
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
      var dlgC = makeCodeEditorDialog(code);
      document.body.appendChild(dlgC);
      btnC.addEventListener("click", function () {
        if (typeof dlgC.showModal === "function") dlgC.showModal();
        else {
          var snippet = code.slice(0, 12000) + (code.length > 12000 ? "\n…" : "");
          void showTrackerAlertModal("실행된 Python 코드", snippet);
        }
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
        else {
          var snippet = jsonStr.slice(0, 12000) + (jsonStr.length > 12000 ? "\n…" : "");
          void showTrackerAlertModal("세부 수치 · 표", snippet);
        }
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
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "CSRF-Token": token,
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
      applyVizFromAgentResponse(data);
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

  if (newChatBtn) {
    newChatBtn.addEventListener("click", async function () {
      if (busy || newChatBtn.disabled) return;
      var confirmed = await showTrackerConfirmModal(
        "새 대화",
        "이 비행 파일에 저장된 대화를 모두 지우고 새로 시작할까요? 이 작업은 되돌릴 수 없습니다.",
        "새로 시작",
        "취소",
      );
      if (!confirmed) return;
      var token = csrfEl ? csrfEl.value : "";
      if (!token) {
        await showTrackerAlertModal(
          "오류",
          "보안 토큰이 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
        );
        return;
      }
      var fid = (typeof window !== "undefined" && window.__trackerActiveFileId) || "";
      newChatBtn.disabled = true;
      try {
        var res = await fetch("/tracker/agent/thread/reset", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "CSRF-Token": token,
            "csrf-token": token,
            "xsrf-token": token,
          },
          body: JSON.stringify({ _csrf: token, fileId: fid }),
        });
        var raw = await res.text();
        var data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
          data = {};
        }
        if (!res.ok || !data.ok) {
          await showTrackerAlertModal(
            "대화 초기화 실패",
            humanizeFetchErrorBody(res, raw, data.message),
          );
          return;
        }
        transcript = [];
        clearThreadUi();
        scrollThread();
        input.focus();
      } catch (e) {
        await showTrackerAlertModal("오류", "네트워크 오류: " + (e.message || String(e)));
      } finally {
        newChatBtn.disabled = false;
      }
    });
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

  window.__trackerAgentLoadHistory = loadHistoryForFile;
  loadHistoryForFile((typeof window !== "undefined" && window.__trackerActiveFileId) || "");

  window.__trackerFitAgentInput = fitInputHeight;
})();

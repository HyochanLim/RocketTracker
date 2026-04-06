/**
 * Tracker 에이전트 패널 — 다턴 대화. 서버가 system + flight context 를 붙이고
 * user/assistant 히스토리를 샌드박스 LLM 에 전달.
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
    var bubble = document.createElement("div");
    bubble.className = "tracker-agent-msg-bubble";
    bubble.innerHTML = escapeHtml(text).replace(/\n/g, "<br>");
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    scrollThread();
  }

  function appendTyping() {
    if (!messagesEl) return;
    ensureMessagesVisible();
    var id = "tracker-agent-typing-" + Date.now();
    var wrap = document.createElement("div");
    wrap.className = "tracker-agent-msg tracker-agent-msg--assistant";
    wrap.id = id;
    var bubble = document.createElement("div");
    bubble.className = "tracker-agent-msg-bubble tracker-agent-msg-bubble--typing";
    bubble.textContent = "…";
    wrap.appendChild(bubble);
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

  async function onSend() {
    var text = String(input.value || "").trim();
    if (!text || busy) return;
    var token = csrfEl ? csrfEl.value : "";
    if (!token) {
      appendBubble("assistant", "CSRF 토큰이 없습니다. 페이지를 새로고침하세요.");
      return;
    }

    busy = true;
    syncSend();
    input.value = "";
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
        body: JSON.stringify({ _csrf: token, messages: transcript }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      removeNode(typingId);
      if (!res.ok || !data.ok) {
        var err = data.message || "요청 실패 (" + res.status + ")";
        appendBubble("assistant", err);
        transcript.pop();
        return;
      }
      var reply = String(data.text || "").trim() || "(빈 응답)";
      transcript.push({ role: "assistant", content: reply });
      appendBubble("assistant", reply);
    } catch (e) {
      removeNode(typingId);
      appendBubble("assistant", "네트워크 오류: " + (e.message || String(e)));
      transcript.pop();
    } finally {
      busy = false;
      syncSend();
      input.focus();
    }
  }

  sendBtn.addEventListener("click", onSend);
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      onSend();
    }
  });
  syncSend();
})();

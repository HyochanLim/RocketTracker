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
      appendBubble("assistant", "Missing CSRF token. Refresh the page and try again.");
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
      appendBubble("assistant", reply);
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
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      onSend();
    }
  });
  syncSend();
})();

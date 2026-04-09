(function () {
  var wrap = document.getElementById("paypal-pro-wrap");
  if (!wrap) return;

  var clientId = wrap.getAttribute("data-paypal-client-id") || "";
  var currency = wrap.getAttribute("data-paypal-currency") || "USD";
  var csrfToken = (document.getElementById("paypal-csrf-token") || {}).value || "";

  var statusEl = document.getElementById("paypal-pro-status");
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t || "";
  }

  if (!clientId) {
    setStatus("PayPal is not configured yet.");
    return;
  }

  function ensureSdkLoaded(cb) {
    if (window.paypal && window.paypal.Buttons) return cb();
    var s = document.createElement("script");
    s.src =
      "https://www.paypal.com/sdk/js?client-id=" +
      encodeURIComponent(clientId) +
      "&currency=" +
      encodeURIComponent(currency || "USD");
    s.async = true;
    s.onload = cb;
    s.onerror = function () {
      setStatus("Could not load PayPal checkout.");
    };
    document.head.appendChild(s);
  }

  function render() {
    if (!window.paypal || !window.paypal.Buttons) {
      setStatus("PayPal checkout unavailable.");
      return;
    }

    window.paypal
      .Buttons({
        style: { layout: "vertical" },
        createOrder: async function () {
          setStatus("");
          var res = await fetch("/billing/paypal/order/create", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Requested-With": "XMLHttpRequest",
              "csrf-token": csrfToken,
              "xsrf-token": csrfToken,
            },
            body: JSON.stringify({}),
          });
          var out = await res.json().catch(function () {
            return {};
          });
          if (!res.ok || !out.ok || !out.orderId) {
            throw new Error((out && out.message) || "Could not create PayPal order.");
          }
          return out.orderId;
        },
        onApprove: async function (data) {
          try {
            setStatus("Confirming payment…");
            var res = await fetch("/billing/paypal/order/capture", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Requested-With": "XMLHttpRequest",
                "csrf-token": csrfToken,
                "xsrf-token": csrfToken,
              },
              body: JSON.stringify({ orderID: data.orderID }),
            });
            var out = await res.json().catch(function () {
              return {};
            });
            if (!res.ok || !out.ok) {
              setStatus((out && out.message) || "Confirmation failed.");
              return;
            }
            setStatus("Pro activated. Redirecting…");
            window.location.href = "/tracker";
          } catch (e) {
            setStatus("Network error: " + (e && e.message ? e.message : "Unknown"));
          }
        },
        onError: function (err) {
          setStatus("Checkout error: " + (err && err.message ? err.message : "Unknown"));
        },
      })
      .render("#paypal-pro-button");
  }

  ensureSdkLoaded(render);
})();


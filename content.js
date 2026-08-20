/**
 * GhostBlock — Main Content Script (MAIN world)
 *
 * Runs in the page's JS context so it can:
 *  • Intercept script / XHR / fetch for ad URLs
 *  • Remove ad DOM nodes
 *  • Spoof detection-fingerprint APIs
 *
 * IMPORTANT: Everything here is designed to be stealthy.
 */
(function () {
  "use strict";

  const R = window.__GB_RULES__;
  if (!R) return; // rules not loaded

  let enabled = true;

  /* ============================================================
     1. STEALTH — spoof common adblocker-detection APIs
     ============================================================ */
  function patchStealthAPIs() {
    // Some sites check navigator.plugins for empty list (common
    // in headless / automated envs which extensions can cause).
    // We don't touch navigator.plugins here, but we DO patch
    // the `document.createElement` to hide our injected elements.

    // Spoof `getComputedStyle` — some detectors check if ad
    // elements become display:none and blame extensions.
    // We keep the original behaviour and instead remove the
    // nodes before the site script reads them.

    // Patch `window.getComputedStyle` to report normal display
    // for elements we haven't yet removed (race-condition guard).
    const origGetCS = window.getComputedStyle;
    if (origGetCS) {
      window.getComputedStyle = function (el, pseudo) {
        const cs = origGetCS.call(this, el, pseudo);
        // If site is specifically probing ad containers, we
        // already remove them so this is just a safety net.
        return cs;
      };
    }

    // Patch `document.querySelector` / `querySelectorAll` so
    // if a detection script queries for our injected helper
    // elements it won't find them.
    // (GhostBlock doesn't inject visible helper elements, so
    // this is purely precautionary.)

    // Ensure `navigator.webdriver` is not set by the extension
    // context (it isn't, but belt-and-suspenders).
    if (navigator.webdriver) {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
        configurable: true
      });
    }

    // Spoof MutationObserver disconnect detection.
    // Some anti-adblock scripts observe body mutations to see
    // if something removed their ad nodes.
    const OrigMO = window.MutationObserver;
    window.MutationObserver = function (callback) {
      const wrappedCallback = function (mutations, observer) {
        // Filter out mutations caused by our cleanup
        const filtered = mutations.filter((m) => {
          if (m.type === "childList") {
            for (const node of m.removedNodes) {
              if (node && node.__GB_AD__) return false;
            }
          }
          return true;
        });
        if (filtered.length > 0) {
          callback(filtered, observer);
        }
      };
      return new OrigMO(wrappedCallback);
    };
    window.MutationObserver.prototype = OrigMO.prototype;
    Object.defineProperty(window.MutationObserver, "name", {
      value: "MutationObserver"
    });
  }

  /* ============================================================
     2. NETWORK INTERCEPTION (in page context)
     ============================================================ */
  function patchNetworkAPIs() {
    // --- XMLHttpRequest ---
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      if (enabled && typeof url === "string" && isAdURL(url)) {
        // Silently abort — return a fake empty response
        this.__GB_BLOCKED__ = true;
        try {
          origOpen.call(this, method, "data:,", ...rest);
        } catch (_) {
          // some envs throw on data: URL
          origOpen.call(this, method, "about:blank", ...rest);
        }
        return;
      }
      return origOpen.call(this, method, url, ...rest);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__GB_BLOCKED__) return;
      return origSend.call(this, ...args);
    };

    // --- fetch ---
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      if (!enabled) return origFetch.call(this, input, init);
      const url =
        typeof input === "string"
          ? input
          : input && input.url
          ? input.url
          : "";
      if (isAdURL(url)) {
        return Promise.resolve(
          new Response("", { status: 200, statusText: "OK" })
        );
      }
      return origFetch.call(this, input, init);
    };

    // --- Dynamic script injection via createElement("script") ---
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function (tagName, options) {
      const el = origCreateElement(tagName, options);
      if (tagName.toLowerCase() === "script") {
        const origSetAttr = el.setAttribute.bind(el);
        const origSetSrcDescriptor = Object.getOwnPropertyDescriptor(
          HTMLScriptElement.prototype,
          "src"
        );
        if (origSetSrcDescriptor) {
          Object.defineProperty(el, "src", {
            get() {
              return origSetSrcDescriptor.get.call(this);
            },
            set(val) {
              if (enabled && isAdURL(val)) {
                el.__GB_BLOCKED__ = true;
                // Serve empty inline script instead
                return;
              }
              return origSetSrcDescriptor.set.call(this, val);
            },
            configurable: true
          });
        }
      }
      return el;
    };
  }

  /* ============================================================
     3. URL CHECKER
     ============================================================ */
  function isAdURL(url) {
    if (!url) return false;
    const lower = url.toLowerCase();

    // Quick host check
    for (const host of R.adHosts) {
      if (lower.includes(host)) return true;
    }

    // Script pattern check
    for (const pat of R.adScriptPatterns) {
      if (lower.includes(pat.toLowerCase())) return true;
    }

    return false;
  }

  /* ============================================================
     4. DOM CLEANUP — remove ad elements
     ============================================================ */
  let removeCount = 0;

  function removeAdElements(root) {
    if (!enabled || !root) return;

    // 1) Remove by selectors
    for (const sel of R.hideSelectors) {
      try {
        const els = root.querySelectorAll(sel);
        els.forEach((el) => markAndRemove(el));
      } catch (_) {
        // invalid selector — skip
      }
    }

    // 2) Scan for ad-related attributes / class names
    const allEls = root.querySelectorAll
      ? root.querySelectorAll("*")
      : [];
    for (const el of allEls) {
      if (el.__GB_AD__ || el.__GB_CHECKED__) continue;
      el.__GB_CHECKED__ = true;

      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();

      for (const kw of R.adKeywords) {
        if (cls.includes(kw) || id.includes(kw)) {
          markAndRemove(el);
          break;
        }
      }
    }
  }

  function markAndRemove(el) {
    if (!el || el.__GB_AD__) return;
    el.__GB_AD__ = true;
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("height", "0", "important");
    el.style.setProperty("max-height", "0", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.setAttribute("aria-hidden", "true");

    // Delayed removal so the page scripts don't immediately
    // detect the mutation and trigger anti-adblock.
    setTimeout(() => {
      if (el.parentNode) {
        try {
          el.parentNode.removeChild(el);
        } catch (_) {}
      }
    }, 100);

    removeCount++;
    if (removeCount % 5 === 0) {
      try {
        chrome.runtime.sendMessage({ type: "AD_BLOCKED" });
      } catch (_) {}
    }
  }

  /* ============================================================
     5. OBSERVE DOM CHANGES (ongoing ad removal)
     ============================================================ */
  function startObserving() {
    const observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const m of mutations) {
        if (m.type === "childList") {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              removeAdElements(node);
            }
          }
        }
        if (m.type === "attributes") {
          const el = m.target;
          if (el && el.nodeType === 1 && !el.__GB_AD__) {
            removeAdElements(el);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id", "src", "href", "data-ad-slot"]
    });
  }

  /* ============================================================
     6. IFRAME CLEANUP
     ============================================================ */
  function cleanIframes() {
    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      const src = (iframe.src || "").toLowerCase();
      const name = (iframe.name || "").toLowerCase();
      const id = (iframe.id || "").toLowerCase();

      for (const host of R.adHosts) {
        if (src.includes(host) || name.includes(host) || id.includes(host)) {
          markAndRemove(iframe);
          break;
        }
      }
    });
  }

  /* ============================================================
     7. ANTI-ADBLOCK BYPASS — site-specific
     ============================================================ */
  function patchAntiAdblock() {
    const hostname = window.location.hostname;

    // --- online-fix.me specific bypasses ---
    if (hostname.includes("online-fix.me")) {
      // 1) Block the K3 domain rotator script
      //    It generates rotating domains for tracking/ads.
      //    We spoof the K3 object so the script doesn't crash
      //    but doesn't do anything useful.
      if (!window.K3) {
        window.K3 = { U: {} };
      }
      if (!window.K3.U) {
        window.K3.U = {};
      }
      // Override K3.U.a to return empty array (no ad domains)
      window.K3.U.a = function () {
        return [];
      };
      // Override K3.U.b to never call the callback
      window.K3.U.b = function () {};

      // 2) Hide the anti-adblock "helpus" dialog
      //    The site checks if ad elements exist and shows #helpus
      const origGetById = document.getElementById;
      document.getElementById = function (id) {
        const el = origGetById.call(this, id);
        if (id === "helpus" || id === "bottomads") {
          // Return a fake element that looks like it exists
          // so the anti-adblock check passes
          return el || {
            style: { display: "none" },
            clientHeight: 100,
            innerHTML: "",
            appendChild: function () {},
            querySelector: function () { return null; },
            querySelectorAll: function () { return []; }
          };
        }
        return el;
      };

      // 3) Block the anti-adblock class check
      //    The site checks: document.getElementsByClassName('7680279de8d0ec434f7ecb3999fff7d3')[0].clientHeight < "20"
      const origGetByClassName = document.getElementsByClassName;
      document.getElementsByClassName = function (name) {
        if (name === "7680279de8d0ec434f7ecb3999fff7d3") {
          // Return a fake element collection with a fake element
          // that has a large clientHeight so the check passes
          return [{
            clientHeight: 100,
            style: { display: "block" },
            innerHTML: "ad-content"
          }];
        }
        return origGetByClassName.call(this, name);
      };

      // 4) Block localStorage check that disables helpus
      //    The site checks: !localStorage.getItem("disable-helpus")
      //    We set it so the check thinks user already dismissed it
      try {
        localStorage.setItem("disable-helpus", "true");
      } catch (_) {}

      // 5) Override document.querySelector to hide ad detection probes
      const origQSA = document.querySelectorAll;
      document.querySelectorAll = function (selector) {
        const result = origQSA.call(this, selector);
        // If querying for elements that contain ad-related IDs
        if (typeof selector === "string" && 
            (selector.includes("85640") || 
             selector.includes("themoneytizer") ||
             selector.includes("bottomads") ||
             selector.includes("helpus"))) {
          return [];
        }
        return result;
      };
    }
  }

  /* ============================================================
     8. INIT
     ============================================================ */
  function init() {
    // Check if disabled via storage
    try {
      const stored = localStorage.getItem("__gb_disabled__");
      if (stored === "true") enabled = false;
    } catch (_) {}

    // Apply stealth patches FIRST, before any site script runs
    patchStealthAPIs();
    patchNetworkAPIs();
    patchAntiAdblock();

    // Wait for DOM ready, then clean
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        removeAdElements(document.documentElement);
        cleanIframes();
        startObserving();
      });
    } else {
      removeAdElements(document.documentElement);
      cleanIframes();
      startObserving();
    }

    // Periodic cleanup for lazy-loaded ads
    setInterval(() => {
      if (enabled) {
        removeAdElements(document.documentElement);
        cleanIframes();
      }
    }, 3000);
  }

  init();
})();

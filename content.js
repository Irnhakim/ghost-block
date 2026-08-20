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
      try {
        const url =
          typeof input === "string"
            ? input
            : input && input.url
            ? String(input.url)
            : "";
        if (isAdURL(url)) {
          return Promise.resolve(
            new Response("", { status: 200, statusText: "OK" })
          );
        }
      } catch (_) {}
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
    // Ensure url is a string (might be Request, URL, or other object)
    const urlStr = typeof url === "string" ? url
      : (url && typeof url === "object" && url.url) ? String(url.url)
      : String(url);
    const lower = urlStr.toLowerCase();

    // IMPORTANT: Never block YouTube ad network requests!
    // YouTube detects if ad requests are blocked and shows
    // the "adblocker not allowed" popup. Instead, we let
    // ads load but hide them visually + fake detection signals.
    if (lower.includes("youtube.com") || lower.includes("youtu.be") ||
        lower.includes("googlevideo.com") || lower.includes("ytimg.com") ||
        lower.includes("google.com/youtube")) {
      return false;
    }

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
      // MAIN world doesn't have chrome.runtime!
      // Use postMessage → bridge.js (ISOLATED) will forward to background
      try {
        window.postMessage({ type: "__GB_ADBLOCKED__" }, "*");
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
      attributeFilter: ["class", "id", "src", "href", "data-ad-slot", "data-testid", "aria-label", "role"]
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

    // --- otakudesu.blog specific bypasses ---
    if (hostname.includes("otakudesu.blog") || hostname.includes("otakudesu.io")) {
      // 1) Remove fixed bottom ad (#iklanbawah) after page load
      //    The site uses a jQuery close button, but we remove it entirely
      const removeBottomAd = () => {
        const el = document.getElementById("iklanbawah");
        if (el) {
          el.__GB_AD__ = true;
          el.style.setProperty("display", "none", "important");
          el.style.setProperty("visibility", "hidden", "important");
          try { el.parentNode.removeChild(el); } catch (_) {}
        }
        // Also remove .box_item_ads_popup
        document.querySelectorAll(".box_item_ads_popup").forEach((el) => {
          markAndRemove(el);
        });
        // Remove .iklan banner ads
        document.querySelectorAll(".iklan").forEach((el) => {
          markAndRemove(el);
        });
        // Remove #venads section
        document.querySelectorAll("#venads").forEach((el) => {
          markAndRemove(el);
        });
        // Remove #lightsoff overlay
        document.querySelectorAll("#lightsoff").forEach((el) => {
          markAndRemove(el);
        });
      };

      // Run immediately and after delay
      removeBottomAd();
      setTimeout(removeBottomAd, 500);
      setTimeout(removeBottomAd, 1500);
      setTimeout(removeBottomAd, 3000);

      // 2) Block the ads.desustream.com script from loading
      //    by spoofing the script element's src property
      const origCreateEl = document.createElement;
      document.createElement = function (tag) {
        const el = origCreateEl.call(document, tag);
        if (tag.toLowerCase() === "script") {
          const origSrcDesc = Object.getOwnPropertyDescriptor(
            HTMLScriptElement.prototype, "src"
          );
          if (origSrcDesc) {
            Object.defineProperty(el, "src", {
              get() { return origSrcDesc.get.call(this); },
              set(val) {
                if (val && (
                  val.includes("desustream") ||
                  val.includes("tolstoycomments")
                )) {
                  // Block the ad script
                  return;
                }
                return origSrcDesc.set.call(this, val);
              },
              configurable: true
            });
          }
        };
        return el;
      };

      // 3) Override jQuery ready to prevent ad initialization
      //    The site uses jQuery to initialize ads on document.ready
      if (window.jQuery) {
        const origReady = window.jQuery.fn.ready;
        if (origReady) {
          window.jQuery.fn.ready = function (fn) {
            // Wrap to run our cleanup after jQuery ready
            return origReady.call(this, function () {
              fn.call(this);
              // Clean up ads after jQuery initializes them
              setTimeout(removeBottomAd, 100);
              setTimeout(removeBottomAd, 500);
            });
          };
        }
      }

      // 4) Block the counter_tampilan ad timer
      //    The site uses setInterval for a 6-second ad display timer
      const origSetInterval = window.setInterval;
      window.setInterval = function (fn, delay) {
        const fnStr = fn.toString();
        if (fnStr.includes("counter_tampilan") || 
            fnStr.includes("auto_close_tampilan") ||
            fnStr.includes("iklanbawah")) {
          // Block ad-related intervals
          return 0;
        }
        return origSetInterval.call(this, fn, delay);
      };
    }

    // --- youtube.com / m.youtube.com specific bypasses ---
    if (hostname.includes("youtube.com")) {
      // YouTube's adblocker detection checks:
      // 1. Whether ad-related network requests were blocked
      // 2. Whether ad DOM containers are visible
      // 3. Whether video ad playback was interrupted
      // 4. Whether ytInitialPlayerResponse contains ad data
      //
      // Strategy: Let ads LOAD (don't block network),
      // but HIDE them visually + fake detection signals.

      // 1) Remove the adblocker warning popup
      const removeYTAdPopup = () => {
        // The popup is a ytd-enforcement-message-view-model
        const popupSelectors = [
          'ytd-enforcement-message-view-model',
          'ytd-popup-container:has(ytd-enforcement-message-view-model)',
          '#consent-bump',
          'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
          '[id*="enforcement-message"]',
          '.ytp-ad-overlay-container',
          '.ytp-ad-text-overlay',
          '.ytp-ad-image-overlay'
        ];
        for (const sel of popupSelectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              el.__GB_AD__ = true;
              el.style.setProperty("display", "none", "important");
              el.style.setProperty("visibility", "hidden", "important");
              setTimeout(() => {
                try { el.remove(); } catch (_) {}
              }, 50);
            });
          } catch (_) {}
        }
      };

      // 2) Fake ad container presence so YouTube thinks
      //    ads are playing normally.
      const fakeYTAdContainers = () => {
        // YouTube checks for .ad-showing class on the player
        // to determine if an ad is playing. If we remove it,
      //    YouTube thinks ads are blocked.
        // Instead, we keep it but hide the ad visuals.

        // Hide ad video elements but keep the container
        const adVideoSelectors = [
          '.video-ads',
          '.ad-container',
          '.ytp-ad-player-overlay',
          '.ytp-ad-text',
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-ad-skip-button-slot',
          '.ytp-ad-overlay-link',
          '.ytp-ad-image-overlay-link',
          '.ytp-ad-overlay-close-button',
          '.ytp-ad-overlay-container iframe',
          '.ytp-ad-progress',
          '.ytp-ad-progress-bar',
          '.ytp-ad-display-overlay',
          '.ytp-ad-text-overlay',
          '.ytp-ad-image-overlay',
          'div.ytp-ad-overlay-container',
          'div.video-ads > div'
        ];

        for (const sel of adVideoSelectors) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              // Don't mark as __GB_AD__ — we just want to
              // hide visually, not remove (detection needs them)
              el.style.setProperty("opacity", "0", "important");
              el.style.setProperty("pointer-events", "none", "important");
              el.style.setProperty("z-index", "-9999", "important");
              el.style.setProperty("position", "absolute", "important");
              el.style.setProperty("left", "-9999px", "important");
              el.style.setProperty("top", "-9999px", "important");
              el.style.setProperty("width", "1px", "important");
              el.style.setProperty("height", "1px", "important");
            });
          } catch (_) {}
        }
      };

      // 3) Hide sidebar ad slots
      const hideYTSidebarAds = () => {
        const sidebarAds = [
          'ytd-display-ad-renderer',
          'ytd-promoted-sparkles-web-renderer',
          'ytd-promoted-video-renderer',
          'ytd-ad-slot-renderer',
          'ytd-statement-banner-renderer-ad',
          'ytd-in-feed-ad-layout-renderer',
          '#player-ads',
          '#related > ytd-item-section-renderer:first-child ytd-rich-item-renderer:has(ytd-display-ad-renderer)',
          'ytd-ad-slot-renderer'
        ];
        for (const sel of sidebarAds) {
          try {
            document.querySelectorAll(sel).forEach((el) => {
              markAndRemove(el);
            });
          } catch (_) {}
        }
      };

      // 4) Block the adblocker detection by spoofing
      //    the signals YouTube checks.
      const patchYTDetection = () => {
        // YouTube checks window.yt.config_ for ad blocking signals
        try {
          if (window.yt && window.yt.config_) {
            // Remove ad-blocked flag if set
            delete window.yt.config_.adsBlocked;
            delete window.yt.config_['COLLABIATOR'];
          }
          if (window.ytcfg) {
            const get = window.ytcfg.get;
            if (get) {
              window.ytcfg.get = function (key) {
                if (key === 'ADS_BLOCKED' || key === 'adsBlocked') return false;
                return get.call(this, key);
              };
            }
          }
        } catch (_) {}

        // Fake the ad element check — YouTube queries for
        // a specific element and checks if it's visible
        try {
          const origQSE = document.querySelector;
          document.querySelector = function (selector) {
            const result = origQSE.call(this, selector);
            // If YouTube is checking for ad-related elements,
            // return a fake visible element
            if (typeof selector === 'string') {
              if (selector.includes('.ytp-ad') || 
                  selector.includes('video-ads') ||
                  selector.includes('ad-showing')) {
                // Return the real element if it exists,
                // otherwise return a fake one
                if (result) return result;
                // Don't return fake — just return null
                // (YouTube checks if result is null to detect blocking)
              }
              // Hide the adblocker popup
              if (selector.includes('enforcement-message')) {
                return null;
              }
            }
            return result;
          };
        } catch (_) {}
      };

      // 5) Override ytInitialPlayerResponse to remove ad data
      //    that YouTube uses for detection
      const patchYTPlayerResponse = () => {
        try {
          if (window.ytInitialPlayerResponse) {
            // Keep ad info intact (YouTube needs it to not
            // detect blocking), but we'll hide visuals
            // The key is to NOT remove adSpec — just let it be
          }
        } catch (_) {};
      };

      // Run all YouTube patches
      patchYTDetection();
      patchYTPlayerResponse();
      removeYTAdPopup();
      fakeYTAdContainers();
      hideYTSidebarAds();

      // Repeatedly clean up (YouTube re-renders constantly)
      setInterval(removeYTAdPopup, 500);
      setInterval(fakeYTAdContainers, 1000);
      setInterval(hideYTSidebarAds, 2000);

      // Watch for navigation (YouTube is SPA)
      // Wait for body to be available (script runs at document_start)
      const startYTObserving = () => {
        if (!document.body) {
          setTimeout(startYTObserving, 100);
          return;
        }
        try {
          const ytObserver = new MutationObserver(() => {
            removeYTAdPopup();
            fakeYTAdContainers();
            hideYTSidebarAds();
          });
          ytObserver.observe(document.body, {
            childList: true,
            subtree: true
          });
        } catch (_) {}
      };
      startYTObserving();
    }

    // --- facebook.com / m.facebook.com specific bypasses ---
    if (hostname.includes("facebook.com")) {
      // 1) Facebook ad selector map — common patterns for
      //    sponsored posts in the feed. We run a periodic
      //    scan since FB is a React SPA that constantly
      //    re-renders content.
      const FB_AD_SELECTORS = [
        // Sponsored label (multi-language)
        '[aria-label="Sponsored"]',
        '[aria-label="Sponsorlu"]',
        '[aria-label="Ditaja"]',
        '[aria-label="Gesponsert"]',
        '[aria-label="Sponsorisé"]',
        '[aria-label="Publicidad"]',
        '[aria-label="Sponsorizzato"]',
        '[aria-label="Gesponsord"]',
        '[aria-label="Patrocinado"]',
        '[aria-label="Pеklama"]',
        '[aria-label="Реклама"]',
        '[aria-label="赞助内容"]',
        '[aria-label="贊助"]',
        '[aria-label="سپانسر"]',
        '[aria-label="ponsorowana"]',
        // Ad tracking containers
        '[data-testid="placementTracking"]',
        '[data-testid*="BoostedComponent"]',
        '[data-testid*="feed-ads"]',
        '[data-testid*="adsManager"]',
        '[data-testid*="instream-ad"]',
        '[data-testid*="video-ad"]',
        '[data-testid*="reels-ad"]',
        '[data-testid*="marketplace-ad"]',
        '[data-testid="sponsoredMessage"]',
        '[data-testid="profile_growth_hat"]',
        // Facebook internal class-based selectors
        '._7jy', '._7jz', '._1iot', '._1ioe', '._1iof',
        '._1va1', '._2b0v', '._4-u2', '._51z2',
        '._50vh', '._50vi', '._50vj', '._50vk',
        '._7j9', '._7j_', '._7j-w', '._7kz',
        '._4k_b', '._4k_c', '._1imp', '._4j5r',
        '._702', '._703', '._1s7z'
      ];

      // 2) Find the sponsored label, then walk up to the
      //    story container and remove the whole ad post.
      function removeFbAds() {
        if (!enabled) return;

        for (const sel of FB_AD_SELECTORS) {
          try {
            const els = document.querySelectorAll(sel);
            els.forEach((label) => {
              // Walk up to find the story/article container
              let story = label;
              for (let i = 0; i < 15; i++) {
                if (!story.parentElement) break;
                story = story.parentElement;
                // Facebook wraps feed items in role="article"
                // or in divs with specific data-testid
                const testId = story.getAttribute("data-testid") || "";
                const role = story.getAttribute("role") || "";
                if (
                  role === "article" ||
                  testId.includes("fbfeed_story") ||
                  testId.includes("FeedUnit") ||
                  story.querySelector('[aria-label="See more"]')
                ) {
                  markAndRemove(story);
                  break;
                }
              }
            });
          } catch (_) {}
        }

        // Also hide the right sidebar ad column
        const sidebar = document.querySelector(
          '[role="complementary"], [role="complementary"] [data-testid], ._4j5p._4-u5'
        );
        if (sidebar && !sidebar.__GB_AD__) {
          // Only hide if it contains ad-like content
          const hasAd = sidebar.querySelector(
            '[aria-label="Sponsored"], [aria-label="Sponsorlu"], [data-testid*="adsManager"]'
          );
          if (hasAd) {
            markAndRemove(sidebar);
          }
        }
      }

      // 3) Intercept Facebook's ad insertion by patching
      //    the DOM insertion methods used by React/FB framework
      const origInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function (newNode, refNode) {
        if (enabled && newNode && newNode.nodeType === 1) {
          // Check if the new node contains sponsored content
          try {
            const sponsored = newNode.querySelector(
              '[aria-label="Sponsored"], [aria-label="Sponsorlu"], ' +
              '[data-testid="placementTracking"], [data-testid*="BoostedComponent"]'
            );
            if (sponsored) {
              newNode.__GB_AD__ = true;
              newNode.style.setProperty("display", "none", "important");
              setTimeout(() => {
                try { newNode.remove(); } catch (_) {}
              }, 50);
              return refNode;
            }
          } catch (_) {}
        }
        return origInsertBefore.call(this, newNode, refNode);
      };

      const origAppendChild = Node.prototype.appendChild;
      Node.prototype.appendChild = function (child) {
        if (enabled && child && child.nodeType === 1) {
          try {
            const sponsored = child.querySelector(
              '[aria-label="Sponsored"], [aria-label="Sponsorlu"], ' +
              '[data-testid="placementTracking"], [data-testid*="BoostedComponent"]'
            );
            if (sponsored) {
              child.__GB_AD__ = true;
              child.style.setProperty("display", "none", "important");
              setTimeout(() => {
                try { child.remove(); } catch (_) {}
              }, 50);
              return child;
            }
          } catch (_) {}
        }
        return origAppendChild.call(this, child);
      };

      // 4) Run ad removal periodically (FB is React SPA,
      //    content loads dynamically)
      setInterval(removeFbAds, 1000);
      setInterval(removeFbAds, 3000);

      // 5) Also remove on scroll (new feed items load)
      let scrollTimeout;
      try {
        window.addEventListener("scroll", () => {
          clearTimeout(scrollTimeout);
          scrollTimeout = setTimeout(removeFbAds, 200);
        }, { passive: true });
      } catch (_) {}
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

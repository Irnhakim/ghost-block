/**
 * GhostBlock — Injected Stealth Script
 * This is injected into the page context to patch
 * detection-fingerprint APIs before any site script runs.
 */
(function () {
  "use strict";

  // 1. Patch `document.getElementById` so detection scripts
  // can't find our hidden ad containers.
  const origGetById = document.getElementById;
  document.getElementById = function (id) {
    const el = origGetById.call(this, id);
    if (el && el.__GB_AD__) return null;
    return el;
  };

  // 2. Ensure `window.adblock` is undefined (some detection
  // scripts check this global).
  if (window.adblock !== undefined) {
    try {
      delete window.adblock;
    } catch (_) {}
  }

  // 3. Some detectors check if `document.body.children` count
  // changed or if certain script tags are missing. We can't
  // easily spoof that, but our delayed removal helps.

  // 4. Override `Object.defineProperty` for `HTMLElement` to
  // prevent sites from detecting our style modifications via
  // property descriptors.
  // (This is a light touch — we don't want to break anything.)

  // 5. Spoof `window.adsbygoogle` to exist as an empty array
  // (Google's ad script pushes to this array; if it's missing
  // after page load, some detection scripts flag it).
  if (!window.adsbygoogle) {
    try {
      window.adsbygoogle = [];
    } catch (_) {}
  }

  // 6. Fake `googletag` API so detection scripts that check
  // for its existence don't trigger anti-adblock messages.
  if (!window.googletag) {
    try {
      window.googletag = {
        cmd: [],
        pubads: function () {
          return {
            set: function () { return this; },
            get: function () { return ""; },
            addEventListener: function () { return this; },
            setTargeting: function () { return this; },
            clearTargeting: function () { return this; },
            refresh: function () {},
            collapseEmptyDivs: function () { return this; }
          };
        },
        CompanionAds: function () {
          return { set: function () { return this; } };
        },
        sizeMapping: function () {
          return { addSize: function () { return this; }, build: function () { return {}; } };
        },
        display: function () {},
        enableServices: function () {},
        defineSlot: function () {
          return {
            addService: function () { return this; },
            set: function () { return this; },
            defineSizeMapping: function () { return this; },
            setTargeting: function () { return this; },
            getSlotId: function () { return { getId: function () { return ""; } }; }
          };
        },
        destroySlots: function () { return []; },
        setIsAsync: function () {}
      };
    } catch (_) {}
  }

  // 7. Override `MutationObserver` to suppress adblock-detection
  // observers that watch for removal of ad elements.
  const OrigMO = window.MutationObserver;
  if (OrigMO) {
    window.MutationObserver = function (callback) {
      const wrapped = function (mutations, obs) {
        const safe = mutations.filter((m) => {
          if (m.type !== "childList") return true;
          for (const n of m.removedNodes) {
            if (n && n.__GB_AD__) return false;
          }
          return true;
        });
        if (safe.length > 0) callback(safe, obs);
      };
      return new OrigMO(wrapped);
    };
    window.MutationObserver.prototype = OrigMO.prototype;
  }

  // 8. Spoof K3 domain rotator (online-fix.me specific)
  //    The K3 object generates rotating ad/tracking domains.
  //    By spoofing it early, we prevent it from loading any
  //    ad-related domains.
  if (window.location.hostname.includes("online-fix.me")) {
    if (!window.K3) {
      window.K3 = { U: {} };
    }
    if (!window.K3.U) {
      window.K3.U = {};
    }
    window.K3.U.a = function () { return [];
    };
    window.K3.U.b = function () {};
  }

  // 9. Block otakudesu.ad-specific ad scripts early
  //    The ads.desustream.com script loads ads before our
  //    content script runs. We patch createElement to intercept.
  if (window.location.hostname.includes("otakudesu")) {
    const _origCE = document.createElement;
    document.createElement = function (tag, opts) {
      const el = _origCE.call(document, tag, opts);
      if (tag.toLowerCase() === "script") {
        const _desc = Object.getOwnPropertyDescriptor(
          HTMLScriptElement.prototype, "src"
        );
        if (_desc) {
          Object.defineProperty(el, "src", {
            get() { return _desc.get.call(this); },
            set(v) {
              if (v && (v.includes("desustream") || v.includes("tolstoycomments"))) {
                return; // block
              }
              return _desc.set.call(this, v);
            },
            configurable: true
          });
        }
      }
      return el;
    };

    // Also block the fixed bottom ad immediately
    const _blockBottom = () => {
      const e = document.getElementById("iklanbawah");
      if (e) e.remove();
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _blockBottom);
    } else {
      _blockBottom();
    }
  }

  // 10. YouTube anti-adblock bypass (early patches)
  //     YouTube detects adblockers by checking:
  //     - If ad network requests were blocked
  //     - If ad DOM elements are removed/hidden
  //     - If video ad playback was interrupted
  //     We patch detection signals EARLY before YT scripts run.
  if (window.location.hostname.includes("youtube.com")) {
    // Patch ytcfg.get to prevent adsBlocked detection
    const _origYtcfgGet = window.ytcfg && window.ytcfg.get;
    if (_origYtcfgGet) {
      window.ytcfg.get = function (key) {
        if (key === "ADS_BLOCKED" || key === "adsBlocked") return false;
        return _origYtcfgGet.call(this, key);
      };
    }

    // Remove adsBlocked from yt.config_ if it exists
    try {
      if (window.yt && window.yt.config_) {
        delete window.yt.config_.adsBlocked;
      }
    } catch (_) {}
  }
})();

/**
 * GhostBlock — Background Service Worker
 * Handles declarative net request rules, dynamic blocking,
 * and communication with content scripts.
 */

/* ============================================================
   1. DEFAULT AD NETWORK HOSTNAMES (used as fallback seeds)
   ============================================================ */
const DEFAULT_AD_HOSTS = [
  // Google Ads
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "googleads.g.doubleclick.net",
  "tpc.googlesyndication.com",
  "www.googleadservices.com",
  "ads.google.com",
  "ad.doubleclick.net",
  "ad.turn.com",
  "ad.admob.com",

  // Generic ad / tracking
  "adnxs.com",
  "adsrvr.org",
  "adtechus.com",
  "advertising.com",
  "amazon-adsystem.com",
  "bidswitch.net",
  "casalemedia.com",
  "chartboost.com",
  "criteo.com",
  "criteo.net",
  "demdex.net",
  "doubleclick.net",
  "eyeota.net",
  "facebook.net",
  "hotjar.com",
  "_index.ru",
  "indexww.com",
  "insurads.com",
  "lijit.com",
  "media.net",
  "moatads.com",
  "mookie1.com",
  "mzcloud.net",
  "newrelic.com",
  "nr-data.net",
  "openx.net",
  "optimizely.com",
  "outbrain.com",
  "permutive.com",
  "pubmatic.com",
  "quantserve.com",
  "revjet.com",
  "rlcdn.com",
  "rubiconproject.com",
  "scorecardresearch.com",
  "segment.com",
  "sharethrough.com",
  "simpli.fi",
  "taboola.com",
  "teads.tv",
  "trafficjunky.com",
  "tribalfusion.com",
  "turn.com",
  "tapad.com",
  "nexage.com",
  "bidgear.com",
  "adcolony.com",
  "serving-sys.com",
  "stickyadstv.com",
  "undertone.com",
  "yieldmo.com",
  "zemanta.com",
  "zeotap.com",

  // Social widgets & tracking pixels
  "connect.facebook.net",
  "pixel.facebook.com",
  "analytics.twitter.com",
  "ads.twitter.com",
  "ads.linkedin.com",
  "snap.licdn.com",
  "tags.tiqcdn.com",

  // Crypto miners
  "coinhive.com",
  "coin-hive.com",
  "jsecoin.com",
  "crypto-loot.com",

  // Popups / malvertising
  "popads.net",
  "popcash.net",
  "propellerads.com",
  "exoclick.com",
  "juicyads.com",
  "trafficjunky.com",
  "ero-advertising.com",
  "adskeeper.com",

  // TheMoneyTizer
  "ads.themoneytizer.com",
  "themoneytizer.com",

  // Mediapays TDS (popunder/redirect)
  "tds.mediapays.info",
  "mediapays.info",

  // LootLabs (CloudFront ad CDN)
  "d2ng6x3yyemlxz.cloudfront.net",
  "d2dxy39sqorbhv.cloudfront.net",

  // ADCash
  "acscdn.com",
  "acstatic-dsa.com",

  // Galaksion (popunder domains)
  "bowersorgamy.com",
  "lekachmididae.com",
  "barkersceleb.com",

  // AdManager
  "wpadmngr.com",
  "js.wpadmngr.com",

  // Bot detection (anti-adblock)
  "botradar.tech",

  // OtakuDesu specific
  "ads.desustream.com",
  "desustream.com",
  "rebrand.ly",

  // Tolstoy Comments (used as ad vector)
  "web.tolstoycomments.com"
];

/* ============================================================
   2. STATE
   ============================================================ */
let enabled = true;
let blockedStats = { total: 0, today: 0, date: todayStr() };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ============================================================
   3. INIT — load saved state
   ============================================================ */
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(["enabled", "blockedStats"]);
  enabled = data.enabled !== undefined ? data.enabled : true;
  blockedStats = data.blockedStats || blockedStats;
  if (blockedStats.date !== todayStr()) {
    blockedStats.today = 0;
    blockedStats.date = todayStr();
  }
  await chrome.storage.local.set({ enabled, blockedStats });
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(["enabled", "blockedStats"]);
  enabled = data.enabled !== undefined ? data.enabled : true;
  blockedStats = data.blockedStats || blockedStats;
  if (blockedStats.date !== todayStr()) {
    blockedStats.today = 0;
    blockedStats.date = todayStr();
    await chrome.storage.local.set({ blockedStats });
  }
});

/* ============================================================
   4. MESSAGE HANDLER (from content scripts & popup)
   ============================================================ */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "GET_STATUS":
      sendResponse({ enabled, blockedStats });
      break;

    case "TOGGLE":
      enabled = !enabled;
      chrome.storage.local.set({ enabled });
      sendResponse({ enabled });
      break;

    case "AD_BLOCKED":
      blockedStats.total += 1;
      blockedStats.today += 1;
      chrome.storage.local.set({ blockedStats });
      break;

    case "GET_STATS":
      if (blockedStats.date !== todayStr()) {
        blockedStats.today = 0;
        blockedStats.date = todayStr();
        chrome.storage.local.set({ blockedStats });
      }
      sendResponse({ blockedStats });
      break;
  }
  return true; // keep channel open for async
});

/* ============================================================
   5. DYNAMIC RULE MANAGEMENT
   We build DNR rules at install time and can add custom
   hostnames the user adds through the popup.
   ============================================================ */
async function getCustomBlockedHosts() {
  const data = await chrome.storage.local.get(["customHosts"]);
  return data.customHosts || [];
}

async function buildDynamicRules() {
  const customHosts = await getCustomBlockedHosts();
  const allHosts = [...new Set([...DEFAULT_AD_HOSTS, ...customHosts])];

  const rules = allHosts.map((host, idx) => ({
    id: idx + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: host,
      resourceTypes: [
        "script",
        "image",
        "sub_frame",
        "xmlhttprequest",
        "font",
        "media",
        "other"
      ]
    }
  }));

  // Remove old dynamic rules, then add new ones
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: rules
  });
}

// Build rules on install / startup
chrome.runtime.onInstalled.addListener(() => buildDynamicRules());
chrome.runtime.onStartup.addListener(() => buildDynamicRules());

/* ============================================================
   6. CNAME / HTTPS REDIRECT INTERCEPTION
   Some ad trackers use CNAME cloaking — we catch those too.
   ============================================================ */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (!enabled) return;
  if (details.frameId !== 0) return; // only top-level

  // Skip chrome:// and extension pages
  if (
    details.url.startsWith("chrome://") ||
    details.url.startsWith("chrome-extension://")
  )
    return;
});

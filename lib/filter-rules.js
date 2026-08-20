/**
 * GhostBlock — Filter Rules
 * Large keyword / selector / hostname blocklists used by the
 * content script. Loaded in MAIN world before content.js.
 */
window.__GB_RULES__ = {
  /* -----------------------------------------------------------
     Hostnames to block (network-level)
     ----------------------------------------------------------- */
  adHosts: new Set([
    // Google Ads
    "pagead2.googlesyndication.com",
    "adservice.google.com",
    "googleads.g.doubleclick.net",
    "tpc.googlesyndication.com",
    "www.googleadservices.com",
    "ads.google.com",
    "ad.doubleclick.net",

    // General ad / tracking
    "adnxs.com",
    "adsrvr.org",
    "amazon-adsystem.com",
    "bidswitch.net",
    "casalemedia.com",
    "criteo.com",
    "criteo.net",
    "demdex.net",
    "doubleclick.net",
    "hotjar.com",
    "indexww.com",
    "media.net",
    "moatads.com",
    "mookie1.com",
    "openx.net",
    "pubmatic.com",
    "quantserve.com",
    "rlcdn.com",
    "rubiconproject.com",
    "scorecardresearch.com",
    "sharethrough.com",
    "taboola.com",
    "teads.tv",
    "turn.com",

    // Crypto miners
    "coinhive.com",
    "coin-hive.com",

    // Popups
    "popads.net",
    "popcash.net",
    "propellerads.com",
    "exoclick.com",
    "adskeeper.com",

    // TheMoneyTizer
    "ads.themoneytizer.com",
    "themoneytizer.com",

    // Mediapays TDS
    "tds.mediapays.info",
    "mediapays.info",

    // LootLabs (CloudFront ad CDN)
    "d2ng6x3yyemlxz.cloudfront.net",
    "d2dxy39sqorbhv.cloudfront.net",

    // ADCash
    "acscdn.com",
    "acstatic-dsa.com",

    // Galaksion
    "bowersorgamy.com",
    "lekachmididae.com",
    "barkersceleb.com",

    // AdManager
    "wpadmngr.com",
    "js.wpadmngr.com",

    // Bot detection (used for anti-adblock)
    "botradar.tech"
  ]),

  /* -----------------------------------------------------------
     CSS selectors to hide or remove from the DOM
     ----------------------------------------------------------- */
  hideSelectors: [
    /* --- Generic ad containers --- */
    '[class*="ad-banner"]',
    '[class*="ad-block"]',
    '[class*="ad-container"]',
    '[class*="ad-wrapper"]',
    '[class*="ad-slot"]',
    '[class*="ad-unit"]',
    '[class*="adsbygoogle"]',
    '[class*="advert"]',
    '[id*="ad-banner"]',
    '[id*="ad-block"]',
    '[id*="ad-container"]',
    '[id*="ad-wrapper"]',
    '[id*="ad-slot"]',
    '[id*="ad-unit"]',
    '[id*="google_ads"]',
    '[id*="googlead"]',
    '[data-ad]',
    '[data-ad-slot]',
    '[data-adunit]',
    '[data-adunitid]',

    /* --- Google specific --- */
    ".adsbygoogle",
    "#google_ads_frame",
    ".google-auto-placed",
    ".ads-container",
    'div[id*="div-gpt-ad"]',
    'div[data-google-query-id]',

    /* --- Facebook / Social --- */
    "[data-testid='fbfeed_story']:not([data-testid])",

    /* --- Sponsored sections --- */
    '[class*="sponsored"]',
    '[class*="promoted"]',
    '[data-testid="placementTracking"]',

    /* --- Common ad network widgets --- */
    '[class*="taboola"]',
    '[class*="outbrain"]',
    '[id*="taboola"]',
    '[id*="outbrain"]',

    /* --- Popunder / overlay ads --- */
    '[class*="interstitial-ad"]',
    '[class*="overlay-ad"]',
    '[class*="popup-ad"]',
    '[class*="modal-ad"]',

    /* --- Iframe ad wrappers --- */
    'iframe[src*="doubleclick"]',
    'iframe[src*="googlesyndication"]',
    'iframe[src*="ad"]',
    'iframe[id*="google_ads"]',
    'iframe[name*="google_ads"]',

    /* --- Video ads --- */
    '[class*="player-ad"]',
    '[class*="video-ad"]',
    '[id*="player-ad"]',

    /* --- Native ads --- */
    '[class*="native-ad"]',
    '[class*="sponsored-content"]',
    '[class*="promoted-content"]'
  ],

  /* -----------------------------------------------------------
     Keywords found in element attributes / textContent
     that suggest ad content
     ----------------------------------------------------------- */
  adKeywords: [
    "advertisement",
    "advertorial",
    "sponsored",
    "promoted",
    "ad-slot",
    "ad-unit",
    "adsbygoogle",
    "googletag",
    "pubads",
    "gpt-ad",
    "adblock",
    "doubleclick",
    "adsense",
    "adsrvr",
    "adnxs",
    "taboola-widget",
    "outbrain-widget",
    "taboola-container"
  ],

  /* -----------------------------------------------------------
     Ad-related script URL patterns
     ----------------------------------------------------------- */
  adScriptPatterns: [
    "googletag",
    "adsbygoogle",
    "google_ads",
    "pagead2",
    "doubleclick.net",
    "adnxs",
    "taboola",
    "outbrain",
    "moat",
    "criteo",
    "pubmatic",
    "rubiconproject",
    "openx",
    "amazon-adsystem",
    "media.net",
    "sharethrough",
    "teads",
    "casalemedia",

    // online-fix.me specific
    "themoneytizer",
    "mediapays",
    "lootlabs",
    "acscdn",
    "wpadmngr",
    "botradar",
    "aclib",
    "aclib",
    "bowersorgamy",
    "lekachmididae",
    "barkersceleb"
  ]
};

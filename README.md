# 👻 GhostBlock — Invisible Ad Shield

<p align="center">
  <img src="icons/icon128.png" width="96" alt="GhostBlock Icon" />
</p>

<p align="center">
  <strong>Silent ad blocker that stays invisible to detection scripts.</strong><br/>
  Blocks ads at the network & DOM level — without being detected as an adblocker.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blueviolet?style=for-the-badge" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome-120+-brightgreen?style=for-the-badge" alt="Chrome 120+" />
  <img src="https://img.shields.io/badge/License-MIT-orange?style=for-the-badge" alt="MIT License" />
  <img src="https://img.shields.io/badge/No%20Tracking-✅-red?style=for-the-badge" alt="No Tracking" />
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🌐 **Network-Level Blocking** | Uses Declarative Net Request (DNR) to block 50+ ad networks at the network layer |
| 🧹 **DOM Cleanup** | Removes ad containers, iframes, and banners from the page |
| 🛡️ **Stealth Mode** | Patches detection APIs — sites can't tell you're using an adblocker |
| 🎭 **Fake Ad APIs** | Provides dummy `googletag`, `adsbygoogle` so anti-adblock scripts pass |
| 📊 **Block Stats** | Track how many ads blocked today and total (with batching) |
| ⚡ **Lightweight** | Zero external dependencies, pure vanilla JavaScript |
| 🔇 **Silent Operation** | No notifications, no popups — just blocks silently |
| 🎯 **Site-Specific Bypasses** | Custom anti-detection for YouTube, Facebook, and more |


## 🛡️ Anti-Detection Techniques

GhostBlock is specifically designed to bypass common adblocker detection methods:

| Technique | How It Works |
|-----------|--------------|
| **Fake `googletag` API** | Provides a complete dummy `window.googletag` object so detector scripts don't flag the page |
| **Fake `adsbygoogle` array** | Sites checking for `window.adsbygoogle` will find it exists as expected |
| **Patched `MutationObserver`** | Filters out mutations caused by our ad removal — detector observers won't see anything suspicious |
| **Delayed DOM Removal** | Ad elements are removed after 100ms instead of instantly, avoiding race-condition detectors |
| **Stealth CSS injection** | Ad containers are hidden at `document_start` — no flash of ad content |
| **XHR/fetch interception** | Ad requests are blocked in the page context, not via detectable extension APIs |
| **Patched `getComputedStyle`** | Prevents detectors from spotting hidden ad elements via style inspection |
| **Type-safe URL checking** | Handles `Request`, `URL`, `Blob`, and string inputs without crashing |

## 📦 Installation

### From Source (Developer Mode)

1. **Clone** this repository:
   ```bash
   git clone https://github.com/your-username/ghost-block.git
   ```

2. Open **Chrome** and navigate to:
   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** and select the `ghost-block/` folder

5. 🎉 Done! GhostBlock is now active (👻 icon in toolbar)

### From Chrome Web Store

> *Coming soon*

## 🚀 Usage

| Action | How |
|--------|-----|
| **Toggle on/off** | Click the 👻 icon → toggle the switch |
| **View stats** | See blocked ads today & total in the popup |
| **Default mode** | Protection is ON by default after installation |

## 🏗️ Architecture

```
ghost-block/
├── manifest.json              # Manifest V3 configuration
├── background.js              # Service worker — DNR rules & messaging
├── content.js                 # MAIN world — DOM cleanup + network intercept + site bypasses
├── bridge.js                  # ISOLATED world — cross-context communication (MAIN → background)
├── popup.html                 # Extension popup UI
├── popup.js                   # Popup logic
│
├── css/
│   └── stealth.css            # Pre-render ad hiding (100+ selectors)
│
├── lib/
│   ├── filter-rules.js        # Blocklists: hosts, selectors, keywords
│   ├── dnr-rules.json         # Declarative Net Request static rules (40+ rules)
│   └── inject-stealth.js      # Stealth API patches (googletag, MutationObserver, K3)
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### How the Layers Work

```
┌──────────────────────────────────────────────────────┐
│                    BROWSER LAYER                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  DNR Static Rules (dnr-rules.json)             │  │
│  │  → Blocks 50+ known ad domains                 │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Dynamic Rules (background.js)                 │  │
│  │  → User-added custom domains                   │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│              PAGE LAYER (MAIN world)                  │
│  ┌────────────────────────────────────────────────┐  │
│  │  Stealth CSS (stealth.css)                     │  │
│  │  → Hides ad containers before render           │  │
│  ├────────────────────────────────────────────────┤  │
│  │  DOM Cleanup (content.js)                      │  │
│  │  → Removes ad nodes, iframes, banners          │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Network Intercept (content.js)                │  │
│  │  → Patches fetch/XHR to block ad URLs          │  │
│  │  → YouTube exempt (stealth strategy)           │  │
│  ├────────────────────────────────────────────────┤  │
│  │  API Spoofing (inject-stealth.js)              │  │
│  │  → Fakes googletag, adsbygoogle, K3, etc.      │  │
│  ├────────────────────────────────────────────────┤  │
│  │  Site-Specific Bypasses (content.js)           │  │
│  │  → YouTube, Facebook, online-fix, otakudesu    │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│              BRIDGE (ISOLATED world)                  │
│  ┌────────────────────────────────────────────────┐  │
│  │  cross-context messaging (postMessage)         │  │
│  │  → MAIN world → bridge.js → background.js      │  │
│  │  → Batched AD_BLOCKED messages (200ms)         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Message Flow (Stats Counter)

```
content.js (MAIN world)
  → markAndRemove() every 5 ad removals
  → window.postMessage("__GB_ADBLOCKED__")

bridge.js (ISOLATED world)
  → listen postMessage
  → batch 200ms
  → chrome.runtime.sendMessage("AD_BLOCKED", count)

background.js (service worker)
  → blockedStats.total += count
  → blockedStats.today += count
  → chrome.storage.local.set({ blockedStats })

popup.js
  → GET_STATUS → render(today, total)
```

## 🌐 Blocked Ad Networks

<details>
<summary><strong>Click to see full list (50+ networks)</strong></summary>

### Google Ads
- `pagead2.googlesyndication.com`
- `adservice.google.com`
- `googleads.g.doubleclick.net`
- `tpc.googlesyndication.com`
- `www.googleadservices.com`

### Ad Networks
- `adnxs.com` — Xandr/AppNexus
- `adsrvr.org` — The Trade Desk
- `amazon-adsystem.com` — Amazon Advertising
- `bidswitch.net` — IPONWEB
- `casalemedia.com` — Index Exchange
- `criteo.com` / `criteo.net` — Criteo
- `doubleclick.net` — Google DoubleClick
- `indexww.com` — Index Exchange
- `media.net` — Media.net
- `openx.net` — OpenX
- `pubmatic.com` — PubMatic
- `rlcdn.com` — Rocket Fuel
- `rubiconproject.com` — Magnite
- `sharethrough.com` — Sharethrough
- `taboola.com` — Taboola
- `teads.tv` — Teads
- `turn.com` — Amobee

### Analytics & Tracking
- `hotjar.com` — Hotjar
- `moatads.com` — Oracle Moat
- `scorecardresearch.com` — comScore

### Crypto Miners
- `coinhive.com` — CoinHive
- `coin-hive.com` — Coin-Hive

### Popups & Malvertising
- `popads.net` — PopAds
- `popcash.net` — PopCash
- `propellerads.com` — PropellerAds
- `exoclick.com` — ExoClick
- `adskeeper.com` — AdsKeeper

### TheMoneyTizer & Mediapays
- `ads.themoneytizer.com` — TheMoneyTizer
- `tds.mediapays.info` — Mediapays TDS

### LootLabs & ADCash
- `d2ng6x3yyemlxz.cloudfront.net` — LootLabs
- `d2dxy39sqorbhv.cloudfront.net` — LootLabs
- `acscdn.com` — ADCash

### Galaksion & AdManager
- `bowersorgamy.com` — Galaksion
- `lekachmididae.com` — Galaksion
- `barkersceleb.com` — Galaksion
- `wpadmngr.com` — AdManager

### Site-Specific
- `botradar.tech` — Bot detection (anti-adblock)
- `ads.desustream.com` — OtakuDesu ads
- `rebrand.ly` — Affiliate redirect (betting)
- `web.tolstoycomments.com` — Comment widget ad vector
- `pixel.facebook.com` — Facebook tracking
- `analytics.facebook.com` — Facebook analytics

</details>

## ⚙️ Permissions

| Permission | Why It's Needed |
|------------|-----------------|
| `storage` | Save toggle state, custom rules, and block statistics |
| `activeTab` | Interact with the current tab for future features |
| `scripting` | Inject scripts when needed |
| `webNavigation` | Monitor page navigation for rule application |
| `declarativeNetRequest` | Block ad network requests at the browser level |
| `declarativeNetRequestWithHostAccess` | Block requests across all sites |
| `host_permissions: <all_urls>` | Required to intercept and block ad network requests across all sites |

> **Note:** GhostBlock does NOT collect, transmit, or store any browsing data. All processing happens locally.

## 🛠️ Development

### Prerequisites
- Google Chrome 120+ (or Chromium-based browser)
- Basic text editor

### Setup
```bash
git clone https://github.com/your-username/ghost-block.git
cd ghost-block
# No build step needed — load directly in Chrome
```

### Testing
1. Load the extension in developer mode
2. Visit a site with ads (e.g., news sites, YouTube, Facebook)
3. Open DevTools → Console to verify no errors
4. Check the popup for block statistics

### Adding New Ad Networks
1. Edit `lib/dnr-rules.json` — add a new rule object with unique ID
2. Edit `lib/filter-rules.js` — add hostname to `adHosts` and patterns to `adScriptPatterns`
3. Edit `background.js` — add to `DEFAULT_AD_HOSTS` array
4. Edit `css/stealth.css` — add iframe/DOM selectors if needed

### Adding Site-Specific Bypasses
1. Edit `content.js` → `patchAntiAdblock()` function
2. Add hostname check: `if (hostname.includes("example.com")) { ... }`
3. Add CSS selectors to `stealth.css`
4. Add hostnames to `filter-rules.js` → `adHosts`
5. Add hostnames to `background.js` → `DEFAULT_AD_HOSTS`
6. Add DNR rules to `lib/dnr-rules.json`

## 🔒 Privacy

GhostBlock is designed with privacy as a priority:

- ✅ **No data collection** — zero telemetry
- ✅ **No remote connections** — everything runs locally
- ✅ **No analytics** — we don't track your usage
- ✅ **Open source** — full code transparency
- ✅ **Minimal permissions** — only what's needed to function

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by the need for ad blockers that work on sites with anti-adblock detection
- Built with Manifest V3 for Chrome's latest extension architecture
- YouTube bypass strategy: "hide visuals, don't block requests"

---

<p align="center">
  <strong>👻 GhostBlock</strong> — <em>Silent. Invisible. Undetectable.</em>
</p>

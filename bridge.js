/**
 * GhostBlock — Bridge (ISOLATED world)
 * Listens for storage changes and communicates with background.
 */
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    // Notify the MAIN-world content script
    window.postMessage(
      { type: "__GB_ENABLED__", enabled: changes.enabled.newValue },
      "*"
    );
  }
});

// Listen for messages from MAIN world
// Batch AD_BLOCKED messages to avoid flooding background
let pendingBlocked = 0;
let flushTimer = null;

function flushBlocked() {
  if (pendingBlocked > 0) {
    try {
      chrome.runtime.sendMessage({
        type: "AD_BLOCKED",
        count: pendingBlocked
      });
    } catch (_) {}
    pendingBlocked = 0;
  }
  flushTimer = null;
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.type === "__GB_ADBLOCKED__") {
    pendingBlocked += 1;
    if (!flushTimer) {
      flushTimer = setTimeout(flushBlocked, 200);
    }
  }
});

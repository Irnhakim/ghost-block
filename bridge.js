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
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data && event.data.type === "__GB_ADBLOCKED__") {
    try {
      chrome.runtime.sendMessage({ type: "AD_BLOCKED" });
    } catch (_) {}
  }
});

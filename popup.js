/**
 * GhostBlock — Popup Script
 */
const toggleBtn = document.getElementById("toggleBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const todayCount = document.getElementById("todayCount");
const totalCount = document.getElementById("totalCount");

function render(status) {
  const { enabled, blockedStats } = status;

  if (enabled) {
    toggleBtn.classList.add("active");
    statusDot.classList.add("active");
    statusText.classList.add("on");
    statusText.textContent = "ON";
  } else {
    toggleBtn.classList.remove("active");
    statusDot.classList.remove("active");
    statusText.classList.remove("on");
    statusText.textContent = "OFF";
  }

  todayCount.textContent = formatNum(blockedStats.today);
  totalCount.textContent = formatNum(blockedStats.total);
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// Load initial state
chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);

// Toggle
toggleBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TOGGLE" }, (resp) => {
    // Refresh
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
  });
});

// Auto-refresh stats every 2 seconds
setInterval(() => {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, render);
}, 2000);

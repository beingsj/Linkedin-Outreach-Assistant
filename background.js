// Auto-Connect Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "nextConnect") {
    const { queue = [], autoConnectMode = false } = await chrome.storage.local.get(["queue", "autoConnectMode"]);
    if (!autoConnectMode || !queue.length) return;

    const { url, delay } = queue.shift();
    await chrome.storage.local.set({ queue });

    chrome.tabs.create({ url });

    if (queue.length) {
      chrome.alarms.create("nextConnect", { delayInMinutes: delay });
    } else {
      await chrome.storage.local.set({ autoConnectMode: false });
    }
  }
});

// Visit Tracking
let visitStartTimes = {};
let trackingEnabled = false;

function onTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.status === "complete" && tab.url.includes("linkedin.com/in/")) {
    visitStartTimes[tabId] = Date.now();
  }
}

function onTabRemoved(tabId) {
  const startTime = visitStartTimes[tabId];
  if (!startTime) return;

  const endTime = Date.now();
  const duration = endTime - startTime;
  delete visitStartTimes[tabId];

  chrome.tabs.get(tabId, async (tab) => {
    if (!tab?.url) return;

    const url = tab.url;
    const { visitData = {} } = await chrome.storage.local.get("visitData");

    const prev = visitData[url] || { visits: 0, totalTime: 0 };
    visitData[url] = {
      visits: prev.visits + 1,
      totalTime: prev.totalTime + duration
    };

    chrome.storage.local.set({ visitData });
  });
}

function registerVisitTracking() {
  if (trackingEnabled) return;
  chrome.tabs.onUpdated.addListener(onTabUpdated);
  chrome.tabs.onRemoved.addListener(onTabRemoved);
  trackingEnabled = true;
}

function unregisterVisitTracking() {
  if (!trackingEnabled) return;
  chrome.tabs.onUpdated.removeListener(onTabUpdated);
  chrome.tabs.onRemoved.removeListener(onTabRemoved);
  visitStartTimes = {};
  trackingEnabled = false;
}

chrome.storage.sync.get(["trackVisits"], ({ trackVisits }) => {
  if (trackVisits) registerVisitTracking();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.trackVisits) {
    const enabled = !!changes.trackVisits.newValue;
    if (enabled) {
      registerVisitTracking();
    } else {
      unregisterVisitTracking();
    }
  }
});

// Support data fetch from popup.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getVisitStats") {
    chrome.storage.local.get("visitData", data => sendResponse(data.visitData || {}));
    return true; // Needed for async response
  }
});

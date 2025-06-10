// Helper to safely get default objects
async function getStorage(keys) {
  return await chrome.storage.local.get(keys);
}
// Not essential — logic embedded inline already

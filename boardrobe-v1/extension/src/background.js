chrome.runtime.onInstalled.addListener(() => {
  console.log("Boardrobe installed");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  await chrome.sidePanel.open({ tabId: tab.id });
});

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
}

async function fetchImageAsDataUrl(url) {
  const response = await fetch(url, {
    credentials: "omit",
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Boardrobe installed");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "BOARDROBE_FETCH_PRODUCT_IMAGES") return;

  const imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];

  Promise.all(
    imageUrls.map(async (url) => {
      try {
        const dataUrl = await fetchImageAsDataUrl(url);
        return [url, dataUrl];
      } catch {
        return [url, ""];
      }
    })
  )
    .then((entries) => {
      sendResponse({
        ok: true,
        imagesByUrl: Object.fromEntries(entries)
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error?.message || "Could not fetch product images."
      });
    });

  return true;
});

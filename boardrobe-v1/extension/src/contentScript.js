import { extractProducts } from "./productScraper.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "BOARDROBE_SCAN_PRODUCTS") return;

  try {
    const products = extractProducts();
    sendResponse({ ok: true, products });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error?.message || "Failed to scan page",
      products: []
    });
  }

  return true;
});

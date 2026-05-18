function cleanText(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/Add to bag/gi, "")
    .replace(/Quick view/gi, "")
    .trim();
}

function isLikelyProductImage(img) {
  const src = img.currentSrc || img.src || "";

  if (!src) return false;
  if (src.startsWith("data:")) return false;

  const rect = img.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 80) return false;

  return true;
}

function findPrice(text) {
  const match = text.match(/(?:\$|CA\$|USD|CAD)\s?\d+(?:[.,]\d{2})?/i);
  return match ? match[0] : "";
}

function getBestName(card, link, img) {
  const aria = link?.getAttribute("aria-label");
  const alt = img?.getAttribute("alt");
  const title = link?.getAttribute("title");

  const candidates = [
    aria,
    title,
    alt,
    link?.innerText,
    card?.innerText
  ]
    .map(cleanText)
    .filter(Boolean)
    .filter((value) => value.length >= 3);

  const withoutHugeText = candidates.filter((value) => value.length <= 140);
  return withoutHugeText[0] || candidates[0]?.slice(0, 140) || "Untitled product";
}

function normalizeUrl(url) {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

function productKey(product) {
  return `${product.productUrl}|${product.imageUrl}`;
}

export function extractProducts() {
  const products = [];
  const seen = new Set();

  const images = Array.from(document.querySelectorAll("img")).filter(isLikelyProductImage);

  for (const img of images) {
    const link = img.closest("a[href]") || img.parentElement?.querySelector("a[href]");
    const card =
      img.closest("article") ||
      img.closest("li") ||
      img.closest("[data-testid]") ||
      img.closest("[class*='product' i]") ||
      img.closest("[class*='card' i]") ||
      img.closest("div");

    if (!link && !card) continue;

    const cardText = cleanText(card?.innerText || link?.innerText || "");
    const imageUrl = normalizeUrl(img.currentSrc || img.src);
    const productUrl = normalizeUrl(link?.href || window.location.href);
    const name = getBestName(card, link, img);
    const price = findPrice(cardText);

    const product = {
      name,
      price,
      imageUrl,
      productUrl,
      pageUrl: window.location.href,
      sourceHost: window.location.host
    };

    const key = productKey(product);
    if (seen.has(key)) continue;

    seen.add(key);
    products.push(product);
  }

  return products.slice(0, 80);
}

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

async function fetchImagesByUrl(imageUrls) {
  const entries = await Promise.all(
    imageUrls.map(async (url) => {
      try {
        const dataUrl = await fetchImageAsDataUrl(url);
        return [url, dataUrl];
      } catch {
        return [url, ""];
      }
    })
  );

  return Object.fromEntries(entries);
}

async function startPinterestAuth(backendUrl) {
  const redirectUri = chrome.identity.getRedirectURL("pinterest");

  const startResponse = await fetch(`${backendUrl}/auth/pinterest/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ redirectUri })
  });

  if (!startResponse.ok) {
    throw new Error(await startResponse.text());
  }

  const startPayload = await startResponse.json();
  const finalUrl = await chrome.identity.launchWebAuthFlow({
    url: startPayload.authorizeUrl,
    interactive: true
  });

  if (!finalUrl) {
    throw new Error("Pinterest auth was cancelled.");
  }

  const parsed = new URL(finalUrl);
  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");
  const authError = parsed.searchParams.get("error");

  if (authError) {
    throw new Error(`Pinterest auth error: ${authError}`);
  }

  if (!code) {
    throw new Error("Pinterest did not return an authorization code.");
  }

  if (state !== startPayload.state) {
    throw new Error("Pinterest auth state mismatch.");
  }

  const exchangeResponse = await fetch(`${backendUrl}/auth/pinterest/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code,
      redirectUri
    })
  });

  if (!exchangeResponse.ok) {
    throw new Error(await exchangeResponse.text());
  }

  const exchangePayload = await exchangeResponse.json();
  const tokens = exchangePayload.tokens || {};
  const profile = exchangePayload.profile || {};

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    refreshTokenExpiresIn: tokens.refresh_token_expires_in,
    scope: tokens.scope,
    profile
  };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Boardrobe installed");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "BOARDROBE_FETCH_REMOTE_IMAGES") {
    const imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];

    fetchImagesByUrl(imageUrls)
      .then((imagesByUrl) => {
        sendResponse({ ok: true, imagesByUrl });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || "Could not fetch remote images."
        });
      });

    return true;
  }

  if (message.type === "BOARDROBE_PINTEREST_AUTH") {
    startPinterestAuth(message.backendUrl)
      .then((session) => {
        sendResponse({ ok: true, session });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error?.message || "Pinterest auth failed."
        });
      });

    return true;
  }
});

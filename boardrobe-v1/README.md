# Boardrobe v1

Boardrobe is a Chrome extension MVP that matches a user's inspo images to products on the shopping page they are browsing.

## What v1 does

1. User uploads inspo images in the extension side panel.
2. User clicks **Scan this page** on a shopping site.
3. The content script extracts visible product cards from the page.
4. The extension sends inspo images + products to the backend.
5. The backend embeds uploaded inspo images with a local CLIP model.
6. The backend downloads each scanned product image, embeds it with CLIP, and ranks products by cosine similarity.

The current version uses a local Hugging Face CLIP model: `openai/clip-vit-base-patch32`.

## Project structure

```text
boardrobe-v1/
├── extension/
│   ├── manifest.json
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── background.js
│       ├── contentScript.js
│       ├── productScraper.js
│       └── sidepanel/
│           ├── App.jsx
│           ├── main.jsx
│           └── styles.css
│
└── backend/
    ├── main.py
    ├── requirements.txt
    └── services/
        ├── matching.py
        └── image_utils.py
```

## Backend setup

From the project root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The backend will run at:

```text
http://localhost:8000
```

Test it:

```bash
curl http://localhost:8000/health
```

### Important CLIP notes

- The first backend request can be slow because Hugging Face will download and load `openai/clip-vit-base-patch32`.
- Later requests are much faster because the model stays in memory and product-image embeddings are cached in memory by `imageUrl`.
- Product images are downloaded at match time from the `imageUrl` values scraped from the current page.
- If some product images fail to download or decode, the request still succeeds and those products simply get lower scores.

### Backend logging

Each `/match` request logs:

- number of inspo images embedded
- number of product images attempted
- number of product images embedded successfully
- total matching time

## Extension setup

In another terminal:

```bash
cd extension
npm install
npm run build
```

This creates:

```text
extension/dist/
```

Then load it in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. Pin Boardrobe to your toolbar
6. Open a shopping page
7. Click the Boardrobe icon
8. Upload inspo images
9. Click **Scan this page**
10. Click **Match products**

## Good sites to test first

Start on category/listing pages where many product cards are visible, such as:

- H&M category pages
- Zara category pages
- Uniqlo category pages
- IKEA category pages
- SSENSE listing pages

Some sites lazy-load images, so scroll a little before scanning.

## Current scope

Boardrobe currently compares:

```text
uploaded inspo images -> product images found on the current page
```

It does not yet:

- crawl full-site inventory
- use Pinterest auth or board import
- store catalog embeddings in a database

That keeps the current MVP focused on validating the core visual matching loop first.

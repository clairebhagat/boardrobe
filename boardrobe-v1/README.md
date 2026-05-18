# Boardrobe v1

Boardrobe is a Chrome extension MVP that matches a user's inspo images to products on the shopping page they are browsing.

## What v1 does

1. User uploads inspo images in the extension side panel.
2. User clicks **Scan this page** on a shopping site.
3. The content script extracts visible product cards from the page.
4. The extension sends inspo images + products to the backend.
5. The backend ranks products and returns match reasons.

This starter version uses a lightweight heuristic matcher so the whole app runs without paid AI APIs. Later, you can replace the matcher with real image embeddings or vision model calls.

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

---

## Backend setup

From the project root:

```bash
cd backend
python -m venv .venv
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

---

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

---

## Good sites to test first

Start on category/listing pages where many product cards are visible, such as:

- H&M category pages
- Zara category pages
- Uniqlo category pages
- IKEA category pages
- SSENSE listing pages

Some sites lazy-load images, so scroll a little before scanning.

---

## What to improve next

### 1. Better product scraping

The current scraper is generic. Eventually add site-specific adapters:

```text
hm.com
zara.com
uniqlo.com
ssense.com
ikea.com
```

### 2. Real AI matching

Replace the current heuristic backend with:

```text
image -> caption
caption -> text embedding
product -> image/text embedding
similarity search
```

or use direct image embeddings.

### 3. Pinterest sync

Once matching works, add Pinterest OAuth/API or a manual board import flow.

---

## V1 design principle

Do not start with perfect Pinterest integration.

Start with:

```text
Upload inspo images -> scan products -> rank matches
```

That proves the main product idea first.

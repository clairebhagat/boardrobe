import React, { useMemo, useState } from "react";
import { Search, Shirt, Upload, Sparkles, ExternalLink } from "lucide-react";

const BACKEND_URL = "http://localhost:8000";

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));

    reader.readAsDataURL(file);
  });
}

function shortHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function App() {
  const [inspoImages, setInspoImages] = useState([]);
  const [products, setProducts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("Upload a few inspo images to start.");
  const [loading, setLoading] = useState(false);

  const topMatches = useMemo(() => matches.slice(0, 20), [matches]);

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    const encoded = await Promise.all(files.map(fileToBase64));
    setInspoImages(encoded);
    setStatus(`${files.length} inspo image${files.length === 1 ? "" : "s"} loaded.`);
  }

  async function scanPage() {
    setLoading(true);
    setStatus("Scanning visible products on this page...");

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab?.id) throw new Error("No active tab found.");

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "BOARDROBE_SCAN_PRODUCTS"
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Could not scan this page.");
      }

      setProducts(response.products || []);
      setMatches([]);
      setStatus(`Found ${response.products?.length || 0} possible products.`);
    } catch (error) {
      setStatus(error.message || "Could not scan page. Try refreshing the tab.");
    } finally {
      setLoading(false);
    }
  }

  async function matchProducts() {
    if (inspoImages.length === 0) {
      setStatus("Upload at least one inspo image first.");
      return;
    }

    if (products.length === 0) {
      setStatus("Scan a shopping page first.");
      return;
    }

    setLoading(true);
    setStatus("Matching products to your inspo...");

    try {
      const response = await fetch(`${BACKEND_URL}/match`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inspoImages,
          products
        })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();
      setMatches(data.matches || []);
      setStatus(`Ranked ${data.matches?.length || 0} products.`);
    } catch (error) {
      setStatus(
        error.message ||
          "Could not match products. Make sure the backend is running on port 8000."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="logo">
          <Shirt size={24} />
        </div>
        <div>
          <h1>Boardrobe</h1>
          <p>Turn inspo into shoppable matches.</p>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <Upload size={18} />
          <h2>1. Upload inspo</h2>
        </div>

        <label className="upload-box">
          <input type="file" multiple accept="image/*" onChange={handleUpload} />
          <span>Choose inspo images</span>
          <small>Use 5–20 images with a clear vibe.</small>
        </label>

        {inspoImages.length > 0 && (
          <div className="image-grid">
            {inspoImages.slice(0, 8).map((src, index) => (
              <img key={index} src={src} alt={`Inspo ${index + 1}`} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <Search size={18} />
          <h2>2. Scan store page</h2>
        </div>

        <button disabled={loading} onClick={scanPage}>
          Scan this page
        </button>

        {products.length > 0 && (
          <p className="muted">
            {products.length} products found from {shortHost(products[0]?.pageUrl)}
          </p>
        )}
      </section>

      <section className="card">
        <div className="section-title">
          <Sparkles size={18} />
          <h2>3. Match products</h2>
        </div>

        <button disabled={loading} onClick={matchProducts} className="primary">
          Match products
        </button>

        <p className="status">{loading ? "Working..." : status}</p>
      </section>

      {topMatches.length > 0 && (
        <section className="results">
          <h2>Best matches</h2>

          {topMatches.map((match, index) => (
            <article className="match-card" key={`${match.productUrl}-${index}`}>
              <img src={match.imageUrl} alt={match.name} />

              <div className="match-info">
                <div className="match-heading">
                  <h3>{match.name}</h3>
                  <span>{Math.round(match.score * 100)}%</span>
                </div>

                {match.price && <p className="price">{match.price}</p>}

                <ul>
                  {(match.reasons || []).slice(0, 3).map((reason, reasonIndex) => (
                    <li key={reasonIndex}>{reason}</li>
                  ))}
                </ul>

                <a href={match.productUrl} target="_blank" rel="noreferrer">
                  Open product <ExternalLink size={14} />
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

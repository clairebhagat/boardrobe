import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  LogOut,
  Pin,
  RefreshCcw,
  Search,
  Shirt,
  Sparkles,
  Upload,
  WandSparkles,
  X
} from "lucide-react";

const BACKEND_URL = "http://localhost:8000";
const STORAGE_KEY = "boardrobe-sidepanel-state";
const MAX_PRODUCT_IMAGES = 24;

function getInitialState() {
  return {
    mode: "",
    inspoImages: [],
    products: [],
    matches: [],
    status: "Choose a source to start building your board.",
    pinterestSession: null,
    pinterestBoards: [],
    selectedBoardId: "",
    selectedBoardName: "",
    pinterestPins: [],
    selectedPinIds: []
  };
}

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

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export default function App() {
  const [mode, setMode] = useState("");
  const [inspoImages, setInspoImages] = useState([]);
  const [products, setProducts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("Choose a source to start building your board.");
  const [loading, setLoading] = useState(false);
  const [hydratingImages, setHydratingImages] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [importingPins, setImportingPins] = useState(false);
  const [pinterestSession, setPinterestSession] = useState(null);
  const [pinterestBoards, setPinterestBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [selectedBoardName, setSelectedBoardName] = useState("");
  const [pinterestPins, setPinterestPins] = useState([]);
  const [selectedPinIds, setSelectedPinIds] = useState([]);

  const topMatches = useMemo(() => matches.slice(0, 20), [matches]);
  const selectedPins = useMemo(
    () => pinterestPins.filter((pin) => selectedPinIds.includes(pin.id)),
    [pinterestPins, selectedPinIds]
  );
  const capturedProductImages = useMemo(
    () => products.filter((product) => product.productImageDataUrl).length,
    [products]
  );

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const saved = result?.[STORAGE_KEY];
      if (!saved) return;

      setMode(saved.mode || "");
      setInspoImages(saved.inspoImages || []);
      setProducts(saved.products || []);
      setMatches(saved.matches || []);
      setStatus(saved.status || "Welcome back to Boardrobe.");
      setPinterestSession(saved.pinterestSession || null);
      setPinterestBoards(saved.pinterestBoards || []);
      setSelectedBoardId(saved.selectedBoardId || "");
      setSelectedBoardName(saved.selectedBoardName || "");
      setPinterestPins(saved.pinterestPins || []);
      setSelectedPinIds(saved.selectedPinIds || []);
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.set({
      [STORAGE_KEY]: {
        mode,
        inspoImages,
        products,
        matches,
        status,
        pinterestSession,
        pinterestBoards,
        selectedBoardId,
        selectedBoardName,
        pinterestPins,
        selectedPinIds
      }
    });
  }, [
    mode,
    inspoImages,
    products,
    matches,
    status,
    pinterestSession,
    pinterestBoards,
    selectedBoardId,
    selectedBoardName,
    pinterestPins,
    selectedPinIds
  ]);

  function resetBoardrobe() {
    const initialState = getInitialState();
    setMode(initialState.mode);
    setInspoImages(initialState.inspoImages);
    setProducts(initialState.products);
    setMatches(initialState.matches);
    setStatus(initialState.status);
    setPinterestSession(initialState.pinterestSession);
    setPinterestBoards(initialState.pinterestBoards);
    setSelectedBoardId(initialState.selectedBoardId);
    setSelectedBoardName(initialState.selectedBoardName);
    setPinterestPins(initialState.pinterestPins);
    setSelectedPinIds(initialState.selectedPinIds);
    chrome.storage.local.remove(STORAGE_KEY);
  }

  function chooseMode(nextMode) {
    setMode(nextMode);
    setMatches([]);
    setProducts([]);
    setStatus(
      nextMode === "pinterest"
        ? "Connect Pinterest to pull boards and curate inspo from your saved Pins."
        : "Upload a few inspo images to start."
    );
  }

  async function callApi(path, payload) {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Backend error: ${response.status}`);
    }

    return response.json();
  }

  async function connectPinterest() {
    setAuthLoading(true);
    setStatus("Opening Pinterest sign-in...");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BOARDROBE_PINTEREST_AUTH",
        backendUrl: BACKEND_URL
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Pinterest sign-in failed.");
      }

      const session = response.session;
      setPinterestSession(session);
      setMode("pinterest");
      setStatus("Pinterest connected. Choose a board to import your vibe.");
      await loadPinterestBoards(session.accessToken);
    } catch (error) {
      setStatus(error.message || "Could not connect Pinterest.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadPinterestBoards(accessToken = pinterestSession?.accessToken) {
    if (!accessToken) return;

    setBoardsLoading(true);
    try {
      const data = await callApi("/pinterest/boards", { accessToken });
      setPinterestBoards(data.boards || []);
      setPinterestSession((current) =>
        current
          ? {
              ...current,
              profile: data.profile || current.profile
            }
          : current
      );
    } catch (error) {
      setStatus(error.message || "Could not load Pinterest boards.");
    } finally {
      setBoardsLoading(false);
    }
  }

  async function loadBoardPins(board) {
    if (!pinterestSession?.accessToken || !board?.id) return;

    setPinsLoading(true);
    setSelectedBoardId(board.id);
    setSelectedBoardName(board.name);
    setStatus(`Loading Pins from ${board.name}...`);

    try {
      const data = await callApi(`/pinterest/boards/${board.id}/pins`, {
        accessToken: pinterestSession.accessToken
      });
      const validPins = (data.pins || []).filter((pin) => pin.imageUrl);
      setPinterestPins(validPins);
      setSelectedPinIds(validPins.map((pin) => pin.id));
      setStatus(`Loaded ${validPins.length} Pins from ${board.name}.`);
    } catch (error) {
      setStatus(error.message || "Could not load Pins for that board.");
    } finally {
      setPinsLoading(false);
    }
  }

  function disconnectPinterest() {
    setPinterestSession(null);
    setPinterestBoards([]);
    setSelectedBoardId("");
    setSelectedBoardName("");
    setPinterestPins([]);
    setSelectedPinIds([]);
    setMode("");
    setStatus("Pinterest disconnected. Choose how you want to build your board.");
  }

  function togglePinSelection(pinId) {
    setSelectedPinIds((current) =>
      current.includes(pinId) ? current.filter((id) => id !== pinId) : [...current, pinId]
    );
  }

  function selectAllPins() {
    setSelectedPinIds(pinterestPins.map((pin) => pin.id));
  }

  function clearPinSelection() {
    setSelectedPinIds([]);
  }

  async function importSelectedPins() {
    if (selectedPins.length === 0) {
      setStatus("Choose at least one Pin to import.");
      return;
    }

    setImportingPins(true);
    setStatus(`Importing ${selectedPins.length} Pinterest images...`);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BOARDROBE_FETCH_REMOTE_IMAGES",
        imageUrls: selectedPins.map((pin) => pin.imageUrl)
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Could not import Pinterest images.");
      }

      const imagesByUrl = response.imagesByUrl || {};
      const imported = selectedPins
        .map((pin) => imagesByUrl[pin.imageUrl])
        .filter(Boolean);

      setInspoImages((current) => dedupe([...current, ...imported]));
      setStatus(`Imported ${imported.length} images from ${selectedBoardName || "Pinterest"}.`);
    } catch (error) {
      setStatus(error.message || "Could not import Pinterest images.");
    } finally {
      setImportingPins(false);
    }
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    const encoded = await Promise.all(files.map(fileToBase64));
    setInspoImages((current) => dedupe([...current, ...encoded]));
    setStatus(`${files.length} inspo image${files.length === 1 ? "" : "s"} loaded.`);
    event.target.value = "";
  }

  function removeInspoImage(indexToRemove) {
    setInspoImages((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function hydrateProductImages(scannedProducts) {
    const imageUrls = scannedProducts
      .map((product) => product.imageUrl)
      .filter(Boolean)
      .slice(0, MAX_PRODUCT_IMAGES);

    if (imageUrls.length === 0) {
      return scannedProducts;
    }

    setHydratingImages(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "BOARDROBE_FETCH_REMOTE_IMAGES",
        imageUrls
      });

      if (!response?.ok) {
        return scannedProducts;
      }

      const imagesByUrl = response.imagesByUrl || {};

      return scannedProducts.map((product) => ({
        ...product,
        productImageDataUrl: imagesByUrl[product.imageUrl] || ""
      }));
    } finally {
      setHydratingImages(false);
    }
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

      const hydratedProducts = await hydrateProductImages(response.products || []);

      setProducts(hydratedProducts);
      setMatches([]);
      setStatus(
        `Found ${hydratedProducts.length || 0} possible products. Captured ${hydratedProducts.filter((product) => product.productImageDataUrl).length} product images for visual matching.`
      );
    } catch (error) {
      setStatus(error.message || "Could not scan page. Try refreshing the tab.");
    } finally {
      setLoading(false);
    }
  }

  async function matchProducts() {
    if (inspoImages.length === 0) {
      setStatus("Add or import at least one inspo image first.");
      return;
    }

    if (products.length === 0) {
      setStatus("Scan a shopping page first.");
      return;
    }

    setLoading(true);
    setStatus("Matching products to your board...");

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

  const isBusy = loading || hydratingImages || authLoading || boardsLoading || pinsLoading;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-topline">Boardrobe</div>
        <div className="hero-row">
          <div className="hero-badge">
            <Shirt size={22} />
          </div>
          <button className="ghost-icon" onClick={resetBoardrobe} title="Reset session">
            <RefreshCcw size={16} />
          </button>
        </div>
        <h1>Turn saved taste into shoppable matches.</h1>
        <p>
          Connect Pinterest to pull boards, or stay lightweight and upload your own inspo
          images.
        </p>
      </section>

      {!mode && (
        <section className="auth-chooser">
          <button className="mode-card pinterest-card" onClick={connectPinterest} disabled={authLoading}>
            <div className="mode-icon">
              {authLoading ? <LoaderCircle size={18} className="spin" /> : <Pin size={18} />}
            </div>
            <div>
              <strong>Sign in with Pinterest</strong>
              <span>Sync boards, preview Pins, and import your vibe in one click.</span>
            </div>
          </button>

          <button className="mode-card manual-card" onClick={() => chooseMode("manual")}>
            <div className="mode-icon">
              <Upload size={18} />
            </div>
            <div>
              <strong>Use manual upload</strong>
              <span>Skip Pinterest and build a board from images on your machine.</span>
            </div>
          </button>
        </section>
      )}

      {mode && (
        <>
          <section className="toolbar-card">
            <button className="back-link" onClick={() => setMode("")}>
              <ArrowLeft size={15} />
              Change source
            </button>

            <div className="source-pill">
              {mode === "pinterest" ? "Pinterest mode" : "Manual upload mode"}
            </div>
          </section>

          {mode === "pinterest" && (
            <>
              <section className="panel-card">
                {!pinterestSession ? (
                  <div className="connect-state">
                    <div>
                      <h2>Connect your Pinterest</h2>
                      <p>
                        Boardrobe will pull your boards, let you choose the right one, and import
                        only the Pins you want to use as inspo.
                      </p>
                    </div>
                    <button className="primary-button" onClick={connectPinterest} disabled={authLoading}>
                      {authLoading ? "Connecting..." : "Connect Pinterest"}
                    </button>
                  </div>
                ) : (
                  <div className="account-strip">
                    <div>
                      <p className="eyebrow">Connected account</p>
                      <h2>{pinterestSession.profile?.username || "Pinterest user"}</h2>
                    </div>
                    <button className="secondary-button" onClick={disconnectPinterest}>
                      <LogOut size={14} />
                      Disconnect
                    </button>
                  </div>
                )}
              </section>

              {pinterestSession && (
                <>
                  <section className="panel-card">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Step 1</p>
                        <h2>Choose a board</h2>
                      </div>
                      <button className="mini-button" onClick={() => loadPinterestBoards()} disabled={boardsLoading}>
                        {boardsLoading ? "Refreshing..." : "Refresh boards"}
                      </button>
                    </div>

                    <div className="board-grid">
                      {pinterestBoards.map((board) => (
                        <button
                          key={board.id}
                          className={`board-card ${selectedBoardId === board.id ? "active" : ""}`}
                          onClick={() => loadBoardPins(board)}
                        >
                          {board.coverImageUrl ? (
                            <img src={board.coverImageUrl} alt={board.name} />
                          ) : (
                            <div className="board-placeholder">
                              <Pin size={18} />
                            </div>
                          )}
                          <div className="board-meta">
                            <strong>{board.name}</strong>
                            <span>{board.pinCount || 0} Pins</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  {selectedBoardId && (
                    <section className="panel-card">
                      <div className="section-head">
                        <div>
                          <p className="eyebrow">Step 2</p>
                          <h2>Curate imported Pins</h2>
                        </div>
                        <div className="action-row">
                          <button className="mini-button" onClick={selectAllPins}>
                            Select all
                          </button>
                          <button className="mini-button" onClick={clearPinSelection}>
                            Clear
                          </button>
                        </div>
                      </div>

                      <p className="helper-copy">
                        {pinsLoading
                          ? "Loading board images..."
                          : `${selectedPinIds.length} of ${pinterestPins.length} Pins selected from ${selectedBoardName}.`}
                      </p>

                      <div className="pin-grid">
                        {pinterestPins.map((pin) => {
                          const active = selectedPinIds.includes(pin.id);
                          return (
                            <button
                              key={pin.id}
                              className={`pin-card ${active ? "active" : ""}`}
                              onClick={() => togglePinSelection(pin.id)}
                            >
                              <img src={pin.imageUrl} alt={pin.title} />
                              <div className="pin-overlay">
                                <span>{active ? "Selected" : "Tap to add"}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        className="primary-button"
                        onClick={importSelectedPins}
                        disabled={importingPins || selectedPinIds.length === 0}
                      >
                        {importingPins ? "Importing..." : `Use ${selectedPinIds.length} selected Pins`}
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}

          {mode === "manual" && (
            <section className="panel-card">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Step 1</p>
                  <h2>Build your board manually</h2>
                </div>
              </div>

              <label className="upload-stage">
                <input type="file" multiple accept="image/*" onChange={handleUpload} />
                <div className="upload-copy">
                  <ImagePlus size={18} />
                  <strong>Add inspo images</strong>
                  <span>Use 5 to 20 screenshots, Pinterest saves, or moodboard images.</span>
                </div>
              </label>
            </section>
          )}

          <section className="panel-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Board</p>
                <h2>Your active inspo set</h2>
              </div>
              <div className="count-chip">{inspoImages.length} images</div>
            </div>

            {mode !== "manual" && (
              <label className="upload-inline">
                <input type="file" multiple accept="image/*" onChange={handleUpload} />
                <Upload size={15} />
                Add more images manually
              </label>
            )}

            {inspoImages.length > 0 ? (
              <div className="image-grid">
                {inspoImages.map((src, index) => (
                  <div className="image-tile" key={`${src.slice(0, 32)}-${index}`}>
                    <img src={src} alt={`Inspo ${index + 1}`} />
                    <button
                      className="remove-image"
                      onClick={() => removeInspoImage(index)}
                      title="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <WandSparkles size={18} />
                <span>No inspo images loaded yet.</span>
              </div>
            )}
          </section>

          <section className="panel-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Step 2</p>
                <h2>Scan this store page</h2>
              </div>
            </div>

            <button className="secondary-button" disabled={isBusy} onClick={scanPage}>
              <Search size={16} />
              {loading ? "Scanning..." : "Scan current page"}
            </button>

            {products.length > 0 && (
              <div className="stacked-note">
                <span>{products.length} products found from {shortHost(products[0]?.pageUrl)}</span>
                <span>
                  {hydratingImages
                    ? "Capturing product thumbnails for visual matching..."
                    : `${capturedProductImages} product images ready for scoring`}
                </span>
              </div>
            )}
          </section>

          <section className="panel-card accent-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Step 3</p>
                <h2>Rank the matches</h2>
              </div>
            </div>

            <button className="primary-button" disabled={isBusy} onClick={matchProducts}>
              <Sparkles size={16} />
              {loading ? "Matching..." : "Match products"}
            </button>

            <p className="status-line">{status}</p>
          </section>

          {topMatches.length > 0 && (
            <section className="results-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Results</p>
                  <h2>Best matches</h2>
                </div>
              </div>

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
        </>
      )}
    </main>
  );
}

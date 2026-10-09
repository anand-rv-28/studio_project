import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import "./App.css";

// Local Django: http://127.0.0.1:8000
// Vercel: set VITE_API_BASE_URL to the Render backend HTTPS URL.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const CONVERT_ENDPOINT = `${API_BASE_URL}/api/convert/`;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function App() {
  const [photos, setPhotos] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [formalType, setFormalType] = useState("boys");
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState("");
  const [failures, setFailures] = useState([]);

  const photosRef = useRef([]);
  const resultsRef = useRef([]);
  const controllerRef = useRef(null);
  const busyRef = useRef(false);

  // Revoke object URLs when this component is removed.
  useEffect(() => () => {
    controllerRef.current?.abort();
    photosRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    resultsRef.current.forEach((item) => URL.revokeObjectURL(item.resultUrl));
  }, []);

  const updatePhotos = (next) => {
    photosRef.current = next;
    setPhotos(next);
  };

  const clearResults = () => {
    resultsRef.current.forEach((item) => URL.revokeObjectURL(item.resultUrl));
    resultsRef.current = [];
    setResults([]);
    setFailures([]);
    setProgress({ done: 0, total: 0 });
  };

  const handleFileChange = (event) => {
    if (busyRef.current) return;
    const selected = Array.from(event.target.files || []);
    const valid = selected.filter((file) => ALLOWED_TYPES.has(file.type));
    event.target.value = "";
    if (!valid.length) {
      setMessage("Please select JPG, PNG, or WEBP photos.");
      return;
    }

    photosRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    clearResults();
    const prepared = valid.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      name: file.name,
      preview: URL.createObjectURL(file),
    }));
    updatePhotos(prepared);
    setSelectedIndex(0);
    setMessage(`${prepared.length} photo(s) selected. Click Create Formal Photos to convert.`);
  };

  const removePhoto = (index) => {
    if (busyRef.current) return;
    const next = photosRef.current.filter((_, i) => i !== index);
    URL.revokeObjectURL(photosRef.current[index].preview);
    updatePhotos(next);
    setSelectedIndex((old) => Math.min(old >= index && old > 0 ? old - 1 : old, Math.max(0, next.length - 1)));
    clearResults();
    setMessage("");
  };

  const clearAll = () => {
    if (busyRef.current) return;
    photosRef.current.forEach((item) => URL.revokeObjectURL(item.preview));
    updatePhotos([]);
    clearResults();
    setSelectedIndex(0);
    setMessage("");
  };

  // Django contract: POST /api/convert/ with multipart/form-data fields "image" and "dress_type" (boys/girls).
  // Successful response: the converted image as a JPEG/PNG/WEBP binary body.
  // No server-side storage or conversion logic is included in this frontend file.
  const convertOne = async (photo, signal) => {
    const form = new FormData();
    form.append("image", photo.file, photo.name);
    form.append("dress_type", formalType);
    const response = await fetch(CONVERT_ENDPOINT, {
      method: "POST",
      body: form,
      signal,
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        detail = data.error || data.detail || data.message || detail;
      } catch { /* Backend may respond with plain text. */ }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const type = response.headers.get("content-type") || "";
    if (!type.toLowerCase().startsWith("image/")) {
      throw new Error("Django must return the converted image as an image response.");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("The converted image is empty.");
    return { name: photo.name, originalPreview: photo.preview, blob, resultUrl: URL.createObjectURL(blob) };
  };

  const convertAll = async () => {
    if (busyRef.current || photosRef.current.length === 0) {
      if (!photosRef.current.length) setMessage("Please select photos.");
      return;
    }
    busyRef.current = true;
    setProcessing(true);
    clearResults();
    const items = [...photosRef.current];
    const controller = new AbortController();
    controllerRef.current = controller;
    const completed = [];
    const failed = [];
    setProgress({ done: 0, total: items.length });

    try {
      // One by one: more reliable for low-memory free Django hosting.
      for (let i = 0; i < items.length; i += 1) {
        setMessage(`Converting ${i + 1} of ${items.length}: ${items[i].name}`);
        try {
          const result = await convertOne(items[i], controller.signal);
          completed.push(result);
          resultsRef.current = [...completed];
          setResults([...completed]);
        } catch (error) {
          if (error.name === "AbortError") throw error;
          failed.push(`${items[i].name}: ${error.message}`);
        }
        setProgress({ done: i + 1, total: items.length });
      }
      setFailures(failed);
      setMessage(`${completed.length} photo(s) converted.${failed.length ? ` ${failed.length} failed.` : ""}`);
    } catch (error) {
      setMessage(error.name === "AbortError" ? "Conversion cancelled." : `Conversion failed: ${error.message}`);
    } finally {
      controllerRef.current = null;
      busyRef.current = false;
      setProcessing(false);
    }
  };

  const downloadImage = (item) => {
    const link = document.createElement("a");
    link.href = item.resultUrl;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadAll = async () => {
    if (!results.length) return;
    try {
      setMessage(`Creating ZIP file with ${results.length} photos...`);
      const zip = new JSZip();
      const folder = zip.folder("formal-photos");
      results.forEach((item, i) => folder.file(item.name || `formal-photo-${i + 1}.png`, item.blob));
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
        setMessage(`Creating ZIP... ${Math.round(meta.percent)}%`);
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "formal-photos.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage(`${results.length} formal photo(s) downloaded as ZIP.`);
    } catch (error) {
      setMessage(`ZIP download failed: ${error.message}`);
    }
  };

  const currentPhoto = photos[selectedIndex];
  const selectedResult = currentPhoto && results.find((item) => item.originalPreview === currentPhoto.preview);

  return (
    <div className="app">
      <header className="header">
        <h1>Formal Photo Converter</h1>
        <p>Upload normal photo and apply formal dress conversion</p>
      </header>

      <main className="container">
        <section className="upload-card">
          <h2>Upload Normal Photos</h2>
          <p className="description">Select JPG, PNG or WEBP passport/studio portrait photos.</p>
          <label className="upload-box">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={processing} onChange={handleFileChange} />
            <div className="upload-icon">+</div>
            <h3>Select Photos</h3>
            <span>Multiple photos supported</span>
          </label>
          <div className="summary">
            <span>Selected: <strong>{photos.length}</strong></span>
            {photos.length > 0 && <button type="button" className="clear-btn" disabled={processing} onClick={clearAll}>Clear All</button>}
          </div>
        </section>

        <div className="formal-type-selector" role="group" aria-label="Select formal dress type">
          <button
            type="button"
            className={`formal-type-btn${formalType === "boys" ? " selected" : ""}`}
            aria-pressed={formalType === "boys"}
            disabled={processing}
            onClick={() => { setFormalType("boys"); clearResults(); setMessage(""); }}
          >
            Boys Formal
          </button>
          <button
            type="button"
            className={`formal-type-btn${formalType === "girls" ? " selected" : ""}`}
            aria-pressed={formalType === "girls"}
            disabled={processing}
            onClick={() => { setFormalType("girls"); clearResults(); setMessage(""); }}
          >
            Girls Formal
          </button>
        </div>

        {photos.length > 0 && (
          <section className="photo-selector-section">
            <h2>Select Photo</h2>
            <div className="photo-selector-grid">
              {photos.map((photo, index) => (
                <div key={photo.id} className={selectedIndex === index ? "photo-thumb active" : "photo-thumb"}>
                  <button type="button" className="photo-thumb-select" disabled={processing} onClick={() => setSelectedIndex(index)}>
                    <img src={photo.preview} alt={photo.name} />
                    <span>{photo.name}</span>
                  </button>
                  <button type="button" className="thumb-remove-btn" disabled={processing} onClick={() => removePhoto(index)} aria-label={`Remove ${photo.name}`}>×</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {currentPhoto && (
          <section className="editor-section">
            <div className="editor-heading">
              <div>
                <h2>Formal Dress Conversion</h2>
                <p>{currentPhoto.name}</p>
              </div>
            </div>
            <div className="editor-layout">
              <div className="editor-preview">
                <h3>Original</h3>
                <div className="editor-image-box"><img src={currentPhoto.preview} alt="Original" /></div>
              </div>
              <div className="editor-preview">
                <h3>Formal Preview</h3>
                <div className="editor-image-box">
                  {selectedResult ? <img src={selectedResult.resultUrl} alt="Formal Preview" /> : <div className="preview-loading">{processing ? "Converting..." : "Converted photo appears here after processing."}</div>}
                </div>
              </div>
            </div>
            <div className="editor-actions">
              <button type="button" className="convert-btn" disabled={processing} onClick={convertAll}>
                {processing ? "Creating Formal Photos..." : `Create ${photos.length} Formal Photo(s)`}
              </button>
            </div>
          </section>
        )}

        {progress.total > 0 && (
          <div className="progress-card">
            <div className="progress-info"><span>Processing Photos</span><strong>{progress.done} / {progress.total}</strong></div>
            <div className="progress-track"><div className="progress-bar" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
          </div>
        )}
        {message && <div className="message" role="status">{message}</div>}
        {failures.length > 0 && <div className="failed-box">{failures.map((item, i) => <p key={i}>{item}</p>)}</div>}

        {results.length > 0 && (
          <section className="results-section">
            <div className="results-heading">
              <h2>Final Formal Photos</h2>
              <button type="button" className="download-all-btn" onClick={downloadAll}>Download All</button>
            </div>
            <div className="stored-grid">
              {results.map((item, index) => (
                <div className="stored-card" key={`${item.name}-${index}`}>
                  <h3>{item.name}</h3>
                  <div className="comparison">
                    <div><h4>Original</h4><img src={item.originalPreview} alt="Original" /></div>
                    <div><h4>Formal</h4><img src={item.resultUrl} alt="Formal" /></div>
                  </div>
                  <div className="stored-info">
                    <span>Output: <strong>{item.name}</strong></span>
                    <button type="button" className="download-btn" onClick={() => downloadImage(item)}>Download</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

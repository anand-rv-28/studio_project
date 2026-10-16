import { useEffect, useRef, useState } from "react";

import JSZip from "jszip";

import "./App.css";



// Kaggle CatVTON FastAPI temporary tunnel.

// Set VITE_API_BASE_URL in .env when the Kaggle tunnel URL changes.

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "https://extended-station-theaters-independently.trycloudflare.com").replace(/\/$/, "");

const CONVERT_ENDPOINT = `${API_BASE_URL}/api/convert/`;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);




// Canvas-only, edge-connected background replacement. No Python or npm package.
async function makeBackgroundWhite(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width: w, height: h } = image;
    const total = w * h;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    const corners = [0, w - 1, (h - 1) * w, total - 1];
    const samples = corners.map((p) => [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]]);
    // Pick the most mutually consistent corner color; protect against a corner containing hair/coat.
    const distance = (a, b) => Math.max(Math.abs(a[0]-b[0]), Math.abs(a[1]-b[1]), Math.abs(a[2]-b[2]));
    const reference = samples.reduce((best, sample) =>
      samples.filter((x) => distance(x, sample) < 48).length >
      samples.filter((x) => distance(x, best) < 48).length ? sample : best, samples[0]);
    // Conservative threshold limits accidental removal of clothes or skin.
    const tolerance = 42;
    const matches = (p) => {
      const i = p * 4;
      return Math.max(
        Math.abs(data[i] - reference[0]),
        Math.abs(data[i+1] - reference[1]),
        Math.abs(data[i+2] - reference[2])
      ) <= tolerance;
    };
    const enqueue = (p) => {
      if (!visited[p] && matches(p)) {
        visited[p] = 1;
        queue[tail++] = p;
      }
    };
    // Seed only from the image border: preserve same-colored interior details.
    for (let x = 0; x < w; x++) { enqueue(x); enqueue((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { enqueue(y * w); enqueue(y * w + w - 1); }
    while (head < tail) {
      const p = queue[head++];
      const x = p % w, y = (p / w) | 0;
      if (x > 0) enqueue(p - 1);
      if (x + 1 < w) enqueue(p + 1);
      if (y > 0) enqueue(p - w);
      if (y + 1 < h) enqueue(p + w);
    }
    for (let p = 0; p < total; p++) {
      if (visited[p]) {
        const i = p * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    const result = await new Promise((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG export failed.")), "image/png")
    );
    return result;
  } finally {
    bitmap.close();
  }
}


// Export-only: 2.44 cm x 3.05 cm at 300 DPI (288 x 360 px), JPEG.
// The API, original conversion result, preview, and UI are unchanged.
async function makePassportJpeg(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const width = 288;
    const height = 360;
    const targetRatio = width / height;
    const sourceRatio = bitmap.width / bitmap.height;
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;

    // Center-crop instead of stretching faces.
    if (sourceRatio > targetRatio) {
      sw = bitmap.height * targetRatio;
      sx = (bitmap.width - sw) / 2;
    } else {
      sh = bitmap.width / targetRatio;
      sy = (bitmap.height - sh) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

    const jpegBlob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("JPEG export failed.")),
        "image/jpeg",
        0.95
      )
    );

    // Set JFIF density units to inches and both densities to 300.
    const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
    let found = false;
    for (let i = 2; i + 17 < bytes.length;) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0xff) { i++; continue; }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      if (length < 2 || i + 2 + length > bytes.length) break;
      if (marker === 0xe0 &&
          bytes[i + 4] === 0x4a && bytes[i + 5] === 0x46 &&
          bytes[i + 6] === 0x49 && bytes[i + 7] === 0x46 &&
          bytes[i + 8] === 0x00 && length >= 16) {
        bytes[i + 11] = 1;       // Density unit: dots per inch
        bytes[i + 12] = 1;       // X density = 300 (0x012c)
        bytes[i + 13] = 44;
        bytes[i + 14] = 1;       // Y density = 300
        bytes[i + 15] = 44;
        found = true;
        break;
      }
      i += 2 + length;
    }
    if (!found) throw new Error("Unable to set JPEG 300 DPI metadata.");
    return new Blob([bytes], { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

function jpegFileName(name, index = 1) {
  const base = (name || `formal-photo-${index}`).replace(/\.[^.]+$/, "");
  return `${base}.jpg`;
}

function App() {

  const [photos, setPhotos] = useState([]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const [formalType, setFormalType] = useState("boys");

  const [results, setResults] = useState([]);

  const [processing, setProcessing] = useState(false);
  const [removingBackground, setRemovingBackground] = useState(false);

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

      dressType: "boys",

    }));

    updatePhotos(prepared);

    setSelectedIndex(0);

    setMessage(`${prepared.length} photo(s) selected. Click Create Formal Photos to convert.`);

  };



  const changePhotoDress = (photoId, dressType) => {

    if (busyRef.current) return;

    updatePhotos(photosRef.current.map((photo) =>

      photo.id === photoId ? { ...photo, dressType } : photo

    ));

    clearResults();

    setMessage("");

  };



  const changeAllDress = (dressType) => {

    if (busyRef.current) return;

    setFormalType(dressType);

    updatePhotos(photosRef.current.map((photo) => ({ ...photo, dressType })));

    clearResults();

    setMessage("");

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



  // Kaggle CatVTON API connector: POST /api/convert/ with image and dress_type (boys/girls).

  // Successful response: the converted image as a JPEG/PNG/WEBP binary body.

  // CatVTON conversion runs on the Kaggle GPU; this frontend only sends and receives images.

  const convertOne = async (photo, signal) => {

    const form = new FormData();

    form.append("image", photo.file, photo.name);

    form.append("dress_type", photo.dressType);

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

      throw new Error("CatVTON API must return the converted image as an image response.");

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



  const removeBackgroundAll = async () => {
    if (busyRef.current || !resultsRef.current.length) return;
    busyRef.current = true;
    setRemovingBackground(true);
    const originals = [...resultsRef.current];
    const updated = [];
    const newlyCreated = [];
    try {
      for (let i = 0; i < originals.length; i += 1) {
        setMessage(`Removing background ${i + 1} of ${originals.length}...`);
        const item = originals[i];
        const blob = await makeBackgroundWhite(item.blob);
        const resultUrl = URL.createObjectURL(blob);
        newlyCreated.push(resultUrl);
        updated.push({
          ...item,
          blob,
          resultUrl,
          name: item.name.replace(/\.[^.]+$/, "") + ".png"
        });
        // Yield to browser so the UI can repaint.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      resultsRef.current = updated;
      setResults(updated);
      originals.forEach((item) => URL.revokeObjectURL(item.resultUrl));
      setMessage(`${updated.length} converted photo(s) now have a white background.`);
    } catch (error) {
      newlyCreated.forEach((url) => URL.revokeObjectURL(url));
      setMessage(`Background removal failed: ${error.message}. Original results kept.`);
    } finally {
      busyRef.current = false;
      setRemovingBackground(false);
    }
  };

  const downloadImage = async (item) => {
    try {
      const jpeg = await makePassportJpeg(item.blob);
      const url = URL.createObjectURL(jpeg);
      const link = document.createElement("a");
      link.href = url;
      link.download = jpegFileName(item.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      setMessage(`JPEG download failed: ${error.message}`);
    }
  };



  const downloadAll = async () => {

    if (!results.length) return;

    try {

      setMessage(`Creating ZIP file with ${results.length} photos...`);

      const zip = new JSZip();

      const folder = zip.folder("formal-photos");

      for (let i = 0; i < results.length; i += 1) {
        const item = results[i];
        const jpeg = await makePassportJpeg(item.blob);
        folder.file(jpegFileName(item.name, i + 1), jpeg);
      }

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

      setMessage(`${results.length} formal photo(s) downloaded as JPEG (288 x 360 px, 300 DPI) in ZIP.`);

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



        <div className="formal-type-selector" role="group" aria-label="Apply formal dress type to all photos">

          <button

            type="button"

            className={`formal-type-btn${formalType === "boys" ? " selected" : ""}`}

            aria-pressed={formalType === "boys"}

            disabled={processing}

            onClick={() => changeAllDress("boys")}

          >

            Boys Formal (All)

          </button>

          <button

            type="button"

            className={`formal-type-btn${formalType === "girls" ? " selected" : ""}`}

            aria-pressed={formalType === "girls"}

            disabled={processing}

            onClick={() => changeAllDress("girls")}

          >

            Girls Formal (All)

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

                  <button

                    type="button"

                    role="switch"

                    aria-label={`Formal dress for ${photo.name}: ${photo.dressType === "boys" ? "Male" : "Female"}`}

                    aria-checked={photo.dressType === "girls"}

                    disabled={processing}

                    onClick={() => changePhotoDress(photo.id, photo.dressType === "boys" ? "girls" : "boys")}

                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%", marginTop: 6, padding: "5px 2px", background: "transparent", border: "none", cursor: processing ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 600, color: "#334155" }}

                  >

                    <span>{photo.dressType === "boys" ? "Male" : "Female"}</span>

                    <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", width: 34, height: 19, padding: 2, borderRadius: 15, background: photo.dressType === "boys" ? "#2563eb" : "#db2777", transition: "background 0.2s" }}>

                      <span style={{ display: "block", width: 15, height: 15, borderRadius: "50%", background: "#ffffff", transform: photo.dressType === "boys" ? "translateX(0)" : "translateX(15px)", transition: "transform 0.2s" }} />

                    </span>

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

              <button type="button" className="download-all-btn" disabled={removingBackground} onClick={downloadAll}>Download All</button>
                <button
                  type="button"
                  className="download-all-btn"
                  disabled={processing || removingBackground}
                  onClick={removeBackgroundAll}
                  style={{ marginLeft: 10 }}
                >
                  {removingBackground ? "Removing Background..." : "Remove Background"}
                </button>

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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "./App.css";


const DEFAULT_SETTINGS = {
  width: 125,
  height: 100,
  top: 37,
  left: 0,
};


function App() {

  const [photos, setPhotos] =
    useState([]);

  const [selectedIndex, setSelectedIndex] =
    useState(0);

  const [results, setResults] =
    useState([]);

  const [livePreview, setLivePreview] =
    useState("");

  const [processing, setProcessing] =
    useState(false);

  const [message, setMessage] =
    useState("");


  const previewUrlsRef =
    useRef([]);

  const resultUrlsRef =
    useRef([]);

  const livePreviewRef =
    useRef("");


  // =====================================================
  // LOAD IMAGE
  // =====================================================

  const loadImage =
    useCallback(
      (source) => {

        return new Promise(
          (
            resolve,
            reject
          ) => {

            const image =
              new Image();


            image.onload =
              () => {

                resolve(
                  image
                );

              };


            image.onerror =
              () => {

                reject(
                  new Error(
                    "Unable to load image."
                  )
                );

              };


            image.src =
              source;

          }
        );

      },
      []
    );


  // =====================================================
  // CLEAN URLS
  // =====================================================

  const clearCurrentUrls =
    useCallback(
      () => {

        previewUrlsRef.current.forEach(
          (url) => {

            URL.revokeObjectURL(
              url
            );

          }
        );


        resultUrlsRef.current.forEach(
          (url) => {

            URL.revokeObjectURL(
              url
            );

          }
        );


        previewUrlsRef.current = [];

        resultUrlsRef.current = [];


        if (
          livePreviewRef.current
        ) {

          URL.revokeObjectURL(
            livePreviewRef.current
          );


          livePreviewRef.current =
            "";

        }

      },
      []
    );


  // =====================================================
  // CLEANUP ON UNMOUNT
  // =====================================================

  useEffect(() => {

    return () => {

      clearCurrentUrls();

    };

  }, [
    clearCurrentUrls,
  ]);


  // =====================================================
  // SELECT PHOTOS
  // =====================================================

  const handleFileChange =
    (event) => {

      const selectedFiles =
        Array.from(
          event.target.files || []
        );


      const validFiles =
        selectedFiles.filter(
          (file) => {

            return (
              file.type ===
                "image/jpeg"
              ||
              file.type ===
                "image/png"
              ||
              file.type ===
                "image/webp"
            );

          }
        );


      clearCurrentUrls();


      const prepared =
        validFiles.map(
          (file) => {

            const preview =
              URL.createObjectURL(
                file
              );


            return {

              file,

              name:
                file.name,

              preview,

              settings: {
                ...DEFAULT_SETTINGS,
              },

            };

          }
        );


      previewUrlsRef.current =
        prepared.map(
          (item) =>
            item.preview
        );


      setPhotos(
        prepared
      );

      setSelectedIndex(
        0
      );

      setResults([]);

      setLivePreview("");

      setMessage("");


      event.target.value =
        "";

    };


  // =====================================================
  // CREATE FORMAL IMAGE
  // =====================================================

  const createFormalImage =
    useCallback(
      async (
        photo,
        template
      ) => {

        const original =
          await loadImage(
            photo.preview
          );


        const canvas =
          document.createElement(
            "canvas"
          );


        const ctx =
          canvas.getContext(
            "2d"
          );


        if (!ctx) {

          throw new Error(
            "Canvas is not supported."
          );

        }


        const imageWidth =
          original.naturalWidth;

        const imageHeight =
          original.naturalHeight;


        canvas.width =
          imageWidth;

        canvas.height =
          imageHeight;


        // ===============================================
        // ORIGINAL IMAGE
        // ===============================================

        ctx.drawImage(
          original,
          0,
          0,
          imageWidth,
          imageHeight
        );


        const settings =
          photo.settings;


        // ===============================================
        // FORMAL TEMPLATE WIDTH
        // ===============================================

        const formalWidth =
          imageWidth
          *
          (
            settings.width /
            100
          );


        const scale =
          formalWidth
          /
          template.naturalWidth;


        // ===============================================
        // HEIGHT
        // ===============================================

        let formalHeight =
          template.naturalHeight
          *
          scale;


        formalHeight =
          formalHeight
          *
          (
            settings.height /
            100
          );


        // ===============================================
        // LEFT / RIGHT
        // ===============================================

        let formalX =
          (
            imageWidth
            -
            formalWidth
          )
          /
          2;


        formalX +=
          imageWidth
          *
          (
            settings.left /
            100
          );


        // ===============================================
        // UP / DOWN
        // ===============================================

        const formalY =
          imageHeight
          *
          (
            settings.top /
            100
          );


        // ===============================================
        // DRAW FORMAL.PNG
        // ===============================================

        ctx.drawImage(
          template,
          formalX,
          formalY,
          formalWidth,
          formalHeight
        );


        // ===============================================
        // OUTPUT TYPE
        // ===============================================

        let outputType =
          photo.file.type;


        if (
          outputType !==
            "image/jpeg"
          &&
          outputType !==
            "image/png"
          &&
          outputType !==
            "image/webp"
        ) {

          outputType =
            "image/jpeg";

        }


        const quality =
          outputType ===
            "image/png"

            ?

          undefined

            :

          0.96;


        const blob =
          await new Promise(
            (resolve) => {

              canvas.toBlob(
                resolve,
                outputType,
                quality
              );

            }
          );


        if (!blob) {

          throw new Error(
            "Unable to create formal photo."
          );

        }


        const resultUrl =
          URL.createObjectURL(
            blob
          );


        return {

          blob,

          resultUrl,

        };

      },
      [
        loadImage,
      ]
    );


  // =====================================================
  // LIVE PREVIEW
  // =====================================================

  useEffect(() => {

    let cancelled =
      false;


    const updatePreview =
      async () => {

        if (
          photos.length === 0
          ||
          !photos[selectedIndex]
        ) {

          setLivePreview("");

          return;

        }


        try {

          const template =
            await loadImage(
              "/formal.png"
            );


          const result =
            await createFormalImage(
              photos[selectedIndex],
              template
            );


          if (cancelled) {

            URL.revokeObjectURL(
              result.resultUrl
            );

            return;

          }


          if (
            livePreviewRef.current
          ) {

            URL.revokeObjectURL(
              livePreviewRef.current
            );

          }


          livePreviewRef.current =
            result.resultUrl;


          setLivePreview(
            result.resultUrl
          );


        } catch (error) {

          console.error(
            "Preview error:",
            error
          );


          setMessage(
            "Preview failed. Check public/formal.png"
          );

        }

      };


    updatePreview();


    return () => {

      cancelled =
        true;

    };

  }, [
    photos,
    selectedIndex,
    loadImage,
    createFormalImage,
  ]);


  // =====================================================
  // UPDATE CURRENT PHOTO SETTING
  // =====================================================

  const updateSetting =
    (
      key,
      value
    ) => {

      setPhotos(
        (previous) =>

          previous.map(
            (
              photo,
              index
            ) => {

              if (
                index !==
                selectedIndex
              ) {

                return photo;

              }


              return {

                ...photo,

                settings: {

                  ...photo.settings,

                  [key]:
                    Number(
                      value
                    ),

                },

              };

            }
          )
      );

    };


  // =====================================================
  // APPLY CURRENT POSITION TO ALL PHOTOS
  // =====================================================

  const applyCurrentToAll =
    () => {

      if (
        photos.length ===
        0
      ) {

        return;

      }


      const settings = {
        ...photos[selectedIndex]
          .settings,
      };


      setPhotos(
        (previous) =>

          previous.map(
            (photo) => ({

              ...photo,

              settings: {
                ...settings,
              },

            }))
      );


      setMessage(
        "Current dress position applied to all photos."
      );

    };


  // =====================================================
  // RESET CURRENT PHOTO
  // =====================================================

  const resetCurrent =
    () => {

      setPhotos(
        (previous) =>

          previous.map(
            (
              photo,
              index
            ) => {

              if (
                index !==
                selectedIndex
              ) {

                return photo;

              }


              return {

                ...photo,

                settings: {
                  ...DEFAULT_SETTINGS,
                },

              };

            }
          )
      );

    };


  // =====================================================
  // REMOVE PHOTO
  // =====================================================

  const removePhoto =
    (index) => {

      setPhotos(
        (previous) => {

          const copy = [
            ...previous,
          ];


          const removed =
            copy[index];


          if (
            removed?.preview
          ) {

            URL.revokeObjectURL(
              removed.preview
            );

          }


          copy.splice(
            index,
            1
          );


          previewUrlsRef.current =
            copy.map(
              (item) =>
                item.preview
            );


          return copy;

        }
      );


      setSelectedIndex(
        0
      );


      resultUrlsRef.current.forEach(
        (url) => {

          URL.revokeObjectURL(
            url
          );

        }
      );


      resultUrlsRef.current =
        [];


      setResults([]);

    };


  // =====================================================
  // CREATE ALL FINAL PHOTOS
  // =====================================================

  const convertAll =
    async () => {

      if (
        photos.length ===
        0
      ) {

        setMessage(
          "Please select photos."
        );

        return;

      }


      try {

        setProcessing(
          true
        );


        setMessage(
          "Creating formal photos..."
        );


        resultUrlsRef.current.forEach(
          (url) => {

            URL.revokeObjectURL(
              url
            );

          }
        );


        resultUrlsRef.current =
          [];


        const template =
          await loadImage(
            "/formal.png"
          );


        const converted =
          [];


        for (
          const photo
          of photos
        ) {

          const result =
            await createFormalImage(
              photo,
              template
            );


          converted.push({

            name:
              photo.name,

            originalPreview:
              photo.preview,

            resultUrl:
              result.resultUrl,

            blob:
              result.blob,

          });

        }


        resultUrlsRef.current =
          converted.map(
            (item) =>
              item.resultUrl
          );


        setResults(
          converted
        );


        setMessage(
          `${converted.length} formal photo(s) created successfully.`
        );


      } catch (error) {

        console.error(
          error
        );


        setMessage(
          "Conversion failed: "
          +
          error.message
        );


      } finally {

        setProcessing(
          false
        );

      }

    };


  // =====================================================
  // DOWNLOAD ONE
  // SAME FILE NAME
  // =====================================================

  const downloadImage =
    (item) => {

      const link =
        document.createElement(
          "a"
        );


      link.href =
        item.resultUrl;


      link.download =
        item.name;


      document.body.appendChild(
        link
      );


      link.click();


      document.body.removeChild(
        link
      );

    };


  // =====================================================
  // DOWNLOAD ALL
  // =====================================================

  const downloadAll =
    async () => {

      for (
        const item
        of results
      ) {

        downloadImage(
          item
        );


        await new Promise(
          (resolve) => {

            setTimeout(
              resolve,
              250
            );

          }
        );

      }

    };


  // =====================================================
  // CLEAR ALL
  // =====================================================

  const clearAll =
    () => {

      clearCurrentUrls();


      setPhotos([]);

      setResults([]);

      setLivePreview("");

      setSelectedIndex(
        0
      );

      setMessage("");

    };


  const currentPhoto =
    photos[selectedIndex];


  // =====================================================
  // UI
  // =====================================================

  return (

    <div className="app">

      {/* ================================================= */}
      {/* HEADER */}
      {/* ================================================= */}

      <header className="header">

        <h1>
          Formal Photo Converter
        </h1>


        <p>
          Upload normal photo and
          apply formal dress template
        </p>


        <div className="header-badge">

          No AI • No API • No Backend

        </div>

      </header>


      <main className="container">

        {/* ================================================= */}
        {/* UPLOAD */}
        {/* ================================================= */}

        <section className="upload-card">

          <h2>
            Upload Normal Photos
          </h2>


          <p className="description">

            Select JPG, PNG or WEBP
            passport/studio portrait photos.

          </p>


          <label className="upload-box">

            <input
              type="file"

              accept=
                "image/jpeg,image/png,image/webp"

              multiple

              disabled={
                processing
              }

              onChange={
                handleFileChange
              }
            />


            <div className="upload-icon">
              +
            </div>


            <h3>
              Select Photos
            </h3>


            <span>
              Multiple photos supported
            </span>

          </label>


          <div className="summary">

            <span>

              Selected:{" "}

              <strong>
                {
                  photos.length
                }
              </strong>

            </span>


            {
              photos.length >
              0 && (

                <button
                  type="button"

                  className="clear-btn"

                  disabled={
                    processing
                  }

                  onClick={
                    clearAll
                  }
                >
                  Clear All
                </button>

              )
            }

          </div>

        </section>


        {/* ================================================= */}
        {/* PHOTO SELECTOR */}
        {/* ================================================= */}

        {
          photos.length >
          0 && (

            <section
              className="photo-selector-section"
            >

              <h2>
                Select Photo to Adjust
              </h2>


              <div
                className="photo-selector-grid"
              >

                {
                  photos.map(
                    (
                      photo,
                      index
                    ) => (

                      <div
                        key={
                          `${photo.name}-${index}`
                        }

                        className={
                          selectedIndex ===
                          index

                            ?

                          "photo-thumb active"

                            :

                          "photo-thumb"
                        }
                      >

                        <button
                          type="button"

                          className="photo-thumb-select"

                          onClick={
                            () =>
                              setSelectedIndex(
                                index
                              )
                          }
                        >

                          <img
                            src={
                              photo.preview
                            }

                            alt={
                              photo.name
                            }
                          />


                          <span>
                            {
                              photo.name
                            }
                          </span>

                        </button>


                        <button
                          type="button"

                          className="thumb-remove-btn"

                          onClick={
                            () =>
                              removePhoto(
                                index
                              )
                          }
                        >
                          ×
                        </button>

                      </div>

                    )
                  )
                }

              </div>

            </section>

          )
        }


        {/* ================================================= */}
        {/* EDITOR */}
        {/* ================================================= */}

        {
          currentPhoto && (

            <section className="editor-section">

              <div className="editor-heading">

                <div>

                  <h2>
                    Formal Dress Adjustment
                  </h2>


                  <p>
                    {
                      currentPhoto.name
                    }
                  </p>

                </div>


                <div
                  className="editor-heading-actions"
                >

                  <button
                    type="button"

                    className="secondary-btn"

                    onClick={
                      resetCurrent
                    }
                  >
                    Reset
                  </button>


                  <button
                    type="button"

                    className="apply-all-btn"

                    onClick={
                      applyCurrentToAll
                    }
                  >
                    Apply Position to All
                  </button>

                </div>

              </div>


              <div className="editor-layout">

                {/* ORIGINAL */}

                <div className="editor-preview">

                  <h3>
                    Original
                  </h3>


                  <div className="editor-image-box">

                    <img
                      src={
                        currentPhoto.preview
                      }

                      alt="Original"
                    />

                  </div>

                </div>


                {/* FORMAL PREVIEW */}

                <div className="editor-preview">

                  <h3>
                    Live Formal Preview
                  </h3>


                  <div className="editor-image-box">

                    {
                      livePreview

                        ?

                      <img
                        src={
                          livePreview
                        }

                        alt="Formal Preview"
                      />

                        :

                      <div className="preview-loading">
                        Loading...
                      </div>
                    }

                  </div>

                </div>


                {/* CONTROLS */}

                <div className="controls-panel">

                  <h3>
                    Adjust Dress
                  </h3>


                  {/* WIDTH */}

                  <div className="control-group">

                    <div className="control-label">

                      <span>
                        Coat Width
                      </span>


                      <strong>
                        {
                          currentPhoto
                            .settings
                            .width
                        }%
                      </strong>

                    </div>


                    <input
                      type="range"

                      min="80"

                      max="170"

                      step="1"

                      value={
                        currentPhoto
                          .settings
                          .width
                      }

                      onChange={
                        (event) =>
                          updateSetting(
                            "width",
                            event.target.value
                          )
                      }
                    />

                  </div>


                  {/* HEIGHT */}

                  <div className="control-group">

                    <div className="control-label">

                      <span>
                        Coat Height
                      </span>


                      <strong>
                        {
                          currentPhoto
                            .settings
                            .height
                        }%
                      </strong>

                    </div>


                    <input
                      type="range"

                      min="70"

                      max="150"

                      step="1"

                      value={
                        currentPhoto
                          .settings
                          .height
                      }

                      onChange={
                        (event) =>
                          updateSetting(
                            "height",
                            event.target.value
                          )
                      }
                    />

                  </div>


                  {/* UP / DOWN */}

                  <div className="control-group">

                    <div className="control-label">

                      <span>
                        Up / Down
                      </span>


                      <strong>
                        {
                          currentPhoto
                            .settings
                            .top
                        }%
                      </strong>

                    </div>


                    <input
                      type="range"

                      min="20"

                      max="65"

                      step="0.5"

                      value={
                        currentPhoto
                          .settings
                          .top
                      }

                      onChange={
                        (event) =>
                          updateSetting(
                            "top",
                            event.target.value
                          )
                      }
                    />

                  </div>


                  {/* LEFT / RIGHT */}

                  <div className="control-group">

                    <div className="control-label">

                      <span>
                        Left / Right
                      </span>


                      <strong>
                        {
                          currentPhoto
                            .settings
                            .left
                        }%
                      </strong>

                    </div>


                    <input
                      type="range"

                      min="-30"

                      max="30"

                      step="0.5"

                      value={
                        currentPhoto
                          .settings
                          .left
                      }

                      onChange={
                        (event) =>
                          updateSetting(
                            "left",
                            event.target.value
                          )
                      }
                    />

                  </div>


                  <div className="control-help">

                    <strong>
                      Adjustment guide
                    </strong>


                    <p>
                      Red shirt shoulder visible:
                      increase Coat Width.
                    </p>


                    <p>
                      Coat too low:
                      reduce Up / Down value.
                    </p>


                    <p>
                      Coat too high:
                      increase Up / Down value.
                    </p>

                  </div>

                </div>

              </div>


              <div className="editor-actions">

                <button
                  type="button"

                  className="convert-btn"

                  disabled={
                    processing
                  }

                  onClick={
                    convertAll
                  }
                >

                  {
                    processing

                      ?

                    "Creating Formal Photos..."

                      :

                    `Create ${photos.length} Formal Photo(s)`
                  }

                </button>

              </div>

            </section>

          )
        }


        {/* ================================================= */}
        {/* MESSAGE */}
        {/* ================================================= */}

        {
          message && (

            <div className="message">
              {
                message
              }
            </div>

          )
        }


        {/* ================================================= */}
        {/* FINAL RESULTS */}
        {/* ================================================= */}

        {
          results.length >
          0 && (

            <section className="results-section">

              <div className="results-heading">

                <h2>
                  Final Formal Photos
                </h2>


                <button
                  type="button"

                  className="download-all-btn"

                  onClick={
                    downloadAll
                  }
                >
                  Download All
                </button>

              </div>


              <div className="stored-grid">

                {
                  results.map(
                    (
                      item,
                      index
                    ) => (

                      <div
                        className="stored-card"

                        key={
                          `${item.name}-${index}`
                        }
                      >

                        <h3>
                          {
                            item.name
                          }
                        </h3>


                        <div className="comparison">

                          <div>

                            <h4>
                              Original
                            </h4>


                            <img
                              src={
                                item.originalPreview
                              }

                              alt="Original"
                            />

                          </div>


                          <div>

                            <h4>
                              Formal
                            </h4>


                            <img
                              src={
                                item.resultUrl
                              }

                              alt="Formal"
                            />

                          </div>

                        </div>


                        <div className="stored-info">

                          <span>

                            Output:{" "}

                            <strong>
                              {
                                item.name
                              }
                            </strong>

                          </span>


                          <button
                            type="button"

                            className="download-btn"

                            onClick={
                              () =>
                                downloadImage(
                                  item
                                )
                            }
                          >
                            Download
                          </button>

                        </div>

                      </div>

                    )
                  )
                }

              </div>

            </section>

          )
        }

      </main>

    </div>

  );

}


export default App;
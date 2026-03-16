import { useEffect, useRef, useState } from 'react';
import UploadZone from './components/UploadZone';
import EffectControls from './components/EffectControls';
import PhotoCard from './components/PhotoCard';
import DownloadBar from './components/DownloadBar';
import { loadModels, detectFaces } from './utils/faceDetection';
import { applyBlur, applyPixelate, applyEmoji, applyImageSticker } from './utils/imageEffects';
import './index.css';

const DEFAULT_EFFECT = {
  type: 'blur',
  intensity: 30,
  coverage: 1.0,
  pixelSize: 12,
  stickerType: 'emoji',
  emoji: '😀',
  stickerSrc: null,
};

let nextId = 1;

export default function App() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [effect, setEffect] = useState(DEFAULT_EFFECT);
  const [processing, setProcessing] = useState(false);
  const stickerImgRef = useRef(null);
  const debounceRef = useRef(null);
  const didMountRef = useRef(false);
  const processAllRef = useRef(null);

  useEffect(() => {
    loadModels()
      .then(() => setModelsLoaded(true))
      .catch((err) => console.error('Failed to load models', err));
  }, []);

  useEffect(() => {
    if (effect.stickerType === 'image' && effect.stickerSrc) {
      const img = new Image();
      img.src = effect.stickerSrc;
      img.onload = () => { stickerImgRef.current = img; };
    }
  }, [effect.stickerSrc, effect.stickerType]);

  function updateEffect(patch) {
    setEffect((prev) => ({ ...prev, ...patch }));
  }

  async function runDetection(photo, model) {
    setPhotos((prev) =>
      prev.map((p) => p.id === photo.id
        ? { ...p, status: 'detecting', detectionModel: model, faces: null, processedCanvas: null }
        : p
      )
    );
    try {
      const img = new Image();
      img.src = photo.originalUrl;
      await new Promise((res) => { img.onload = res; });
      const faces = await detectFaces(img, model);
      setPhotos((prev) =>
        prev.map((p) => p.id === photo.id
          ? { ...p, faces, status: faces.length === 0 ? 'no-faces' : 'ready', detectionModel: model }
          : p
        )
      );
    } catch {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, status: 'error' } : p))
      );
    }
  }

  async function handleFiles(files) {
    const newPhotos = files.map((file) => ({
      id: nextId++,
      file,
      originalUrl: URL.createObjectURL(file),
      faces: null,
      processedCanvas: null,
      status: 'detecting',
      detectionModel: 'both',
    }));

    setPhotos((prev) => [...prev, ...newPhotos]);

    for (const photo of newPhotos) {
      await runDetection(photo, 'both');
    }
  }

  async function processAll() {
    if (processing) return;
    setProcessing(true);

    const eligible = photos.filter((p) => p.status === 'ready' || p.status === 'done');

    for (const photo of eligible) {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, status: 'processing' } : p))
      );
      try {
        const img = new Image();
        img.src = photo.originalUrl;
        await new Promise((res) => { img.onload = res; });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        for (const box of photo.faces) {
          if (effect.type === 'blur') {
            applyBlur(ctx, img, box, effect.intensity, effect.coverage);
          } else if (effect.type === 'pixelate') {
            applyPixelate(ctx, img, box, effect.pixelSize, effect.coverage);
          } else if (effect.type === 'sticker') {
            if (effect.stickerType === 'emoji') {
              applyEmoji(ctx, box, effect.emoji);
            } else if (effect.stickerType === 'image' && stickerImgRef.current) {
              applyImageSticker(ctx, box, stickerImgRef.current);
            }
          }
        }

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, processedCanvas: canvas, status: 'done' } : p
          )
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: 'error' } : p))
        );
      }
    }

    setProcessing(false);
  }

  // Keep ref up-to-date so the debounced effect always calls the latest version
  processAllRef.current = processAll;

  // Auto-reprocess already-processed photos when effect settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const hasDone = photos.some((p) => p.status === 'done');
    if (!hasDone) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => processAllRef.current?.(), 250);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect.type, effect.intensity, effect.coverage, effect.pixelSize, effect.emoji, effect.stickerSrc, effect.stickerType]);

  function removePhoto(id) {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id);
      if (photo) URL.revokeObjectURL(photo.originalUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearAll() {
    photos.forEach((p) => URL.revokeObjectURL(p.originalUrl));
    setPhotos([]);
  }

  const hasPhotos = photos.length > 0;
  const hasReady = photos.some((p) => p.status === 'ready' || p.status === 'done');

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">🔒 Privacy Photo</h1>
        <p className="app-subtitle">Blur faces in your photos — 100% in your browser, nothing uploaded</p>
        {!modelsLoaded && (
          <div className="model-loading">
            <span className="spinner-inline" /> Loading face detection model…
          </div>
        )}
      </header>

      <main className="app-main">
        <div className="app-sidebar">
          <EffectControls
            effect={effect}
            onChange={updateEffect}
            onProcess={processAll}
            processing={processing}
            hasPhotos={hasReady}
          />
          {hasPhotos && (
            <button className="btn btn--ghost clear-btn" onClick={clearAll}>
              Clear all photos
            </button>
          )}
        </div>

        <div className="app-content">
          {!hasPhotos ? (
            <UploadZone onFiles={handleFiles} />
          ) : (
            <>
              <UploadZone onFiles={handleFiles} compact />
              <div className="photo-grid">
                {photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    onRemove={removePhoto}
                    onRedetect={(model) => runDetection(photo, model)}
                  />
                ))}
              </div>
              <DownloadBar photos={photos} />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

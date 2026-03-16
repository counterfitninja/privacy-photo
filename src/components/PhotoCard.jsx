import { useEffect, useRef } from 'react';

const MODELS = [
  { id: 'both',  label: 'Auto',     title: 'Run both detectors (default)' },
  { id: 'ssd',   label: 'Groups',   title: 'SSD MobileNet — better for group/distant faces' },
  { id: 'tiny',  label: 'Portrait', title: 'TinyFaceDetector — better for single close-up portraits' },
];

export default function PhotoCard({ photo, onRemove, onRedetect }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (photo.processedCanvas && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = photo.processedCanvas.width;
      canvasRef.current.height = photo.processedCanvas.height;
      ctx.drawImage(photo.processedCanvas, 0, 0);
    }
  }, [photo.processedCanvas]);

  const isDone = photo.status === 'done';
  const isWorking = photo.status === 'detecting' || photo.status === 'processing';
  const showRedetect = !isWorking && photo.status !== 'idle';

  function downloadPhoto() {
    if (!photo.processedCanvas) return;
    photo.processedCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `privacy_${photo.file.name}`;
      a.click();
    }, 'image/jpeg', 0.92);
  }

  return (
    <div className={`photo-card ${isDone ? 'photo-card--done' : ''}`}>
      <button className="photo-card__remove" onClick={() => onRemove(photo.id)} title="Remove">✕</button>

      {photo.faces != null && (
        <span className={`face-badge ${photo.faces.length === 0 ? 'face-badge--zero' : ''}`}>
          {photo.faces.length === 0 ? 'No faces' : `${photo.faces.length} face${photo.faces.length !== 1 ? 's' : ''}`}
        </span>
      )}

      <div className={`photo-card__images ${isDone ? 'photo-card__images--split' : ''}`}>
        <div className="photo-card__panel">
          {isDone && <span className="photo-card__panel-label">Original</span>}
          <img src={photo.originalUrl} alt={photo.file.name} className="photo-card__img" />
        </div>
        {isDone && (
          <div className="photo-card__panel">
            <span className="photo-card__panel-label">Processed</span>
            <canvas ref={canvasRef} className="photo-card__img" />
          </div>
        )}
      </div>

      {/* Per-photo re-detect controls */}
      {showRedetect && (
        <div className="photo-card__redetect">
          <span className="photo-card__redetect-label">Detector:</span>
          {MODELS.map((m) => (
            <button
              key={m.id}
              title={m.title}
              className={`redetect-btn ${photo.detectionModel === m.id ? 'redetect-btn--active' : ''}`}
              onClick={() => onRedetect(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="photo-card__footer">
        <span className="photo-card__name" title={photo.file.name}>{photo.file.name}</span>
        {isWorking && (
          <span className="photo-card__status spinner">
            {photo.status === 'detecting' ? 'Detecting…' : 'Applying effect…'}
          </span>
        )}
        {photo.status === 'error' && <span className="photo-card__status photo-card__status--error">Error</span>}
        {photo.status === 'no-faces' && <span className="photo-card__status photo-card__status--warn">No faces found</span>}
        {isDone && (
          <button className="btn btn--small" onClick={downloadPhoto}>⬇ Download</button>
        )}
      </div>
    </div>
  );
}

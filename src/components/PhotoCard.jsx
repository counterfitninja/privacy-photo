import { useEffect, useRef, useState } from 'react';

const MODELS = [
  { id: 'both',  label: 'Auto',     title: 'Run both detectors (default)' },
  { id: 'ssd',   label: 'Groups',   title: 'SSD MobileNet — better for group/distant faces' },
  { id: 'tiny',  label: 'Portrait', title: 'TinyFaceDetector — better for single close-up portraits' },
];

export default function PhotoCard({ photo, onRemove, onRedetect, onAddManualFace, onUpdateManualFace, onRemoveManualFace }) {
  const canvasRef = useRef(null);
  const origImgRef = useRef(null);
  const [addFaceMode, setAddFaceMode] = useState(false);
  const [imgNatural, setImgNatural] = useState(null);

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
  const manualFaces = photo.manualFaces || [];

  function downloadPhoto() {
    if (!photo.processedCanvas) return;
    photo.processedCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `privacy_${photo.file.name}`;
      a.click();
    }, 'image/jpeg', 0.92);
  }

  function clientToImageCoords(clientX, clientY) {
    const img = origImgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      scaleX,
      scaleY,
    };
  }

  function handleImageClick(e) {
    if (!addFaceMode) return;
    const coords = clientToImageCoords(e.clientX, e.clientY);
    if (!coords) return;
    const img = origImgRef.current;
    const size = img.naturalWidth * 0.15;
    onAddManualFace(photo.id, {
      id: Date.now(),
      x: coords.x - size / 2,
      y: coords.y - size * 0.55,
      width: size,
      height: size * 1.2,
    });
  }

  function startResize(e, face) {
    e.stopPropagation();
    e.preventDefault();
    const img = origImgRef.current;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = face.width;
    const startH = face.height;
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;

    function onMove(me) {
      const dx = (me.clientX - startX) * scaleX;
      const dy = (me.clientY - startY) * scaleY;
      const origDist = Math.sqrt((startW / 2) ** 2 + (startH / 2) ** 2);
      const newDist = Math.sqrt((startW / 2 + dx) ** 2 + (startH / 2 + dy) ** 2);
      const factor = Math.max(0.1, newDist / origDist);
      const newW = Math.max(20, startW * factor);
      const newH = Math.max(20, startH * factor);
      onUpdateManualFace(photo.id, face.id, {
        x: cx - newW / 2,
        y: cy - newH / 2,
        width: newW,
        height: newH,
      });
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div className={`photo-card ${isDone ? 'photo-card--done' : ''}`}>
      <button className="photo-card__remove" onClick={() => onRemove(photo.id)} title="Remove">✕</button>

      {photo.faces != null && (
        <span className={`face-badge ${photo.faces.length === 0 ? 'face-badge--zero' : ''}`}>
          {photo.faces.length === 0 ? 'No faces' : `${photo.faces.length} face${photo.faces.length !== 1 ? 's' : ''}`}
          {manualFaces.length > 0 && ` +${manualFaces.length}`}
        </span>
      )}

      <div className={`photo-card__images ${isDone ? 'photo-card__images--split' : ''}`}>
        <div className="photo-card__panel">
          {isDone && <span className="photo-card__panel-label">Original</span>}
          <div
            className="photo-card__img-wrapper"
            onClick={handleImageClick}
            style={{ cursor: addFaceMode ? 'crosshair' : 'default' }}
          >
            <img
              ref={origImgRef}
              src={photo.originalUrl}
              alt={photo.file.name}
              className="photo-card__img"
              onLoad={(e) => setImgNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            />
            {imgNatural && (addFaceMode || manualFaces.length > 0) && (
              <svg
                className="face-overlay"
                viewBox={`0 0 ${imgNatural.w} ${imgNatural.h}`}
                style={{ pointerEvents: 'none' }}
              >
                {manualFaces.map((face) => {
                  const cx = face.x + face.width / 2;
                  const cy = face.y + face.height / 2;
                  const rx = face.width / 2;
                  const ry = face.height / 2;
                  const hr = Math.max(10, face.width * 0.07);
                  const sw = Math.max(2, face.width * 0.018);
                  const fs = hr * 1.3;
                  return (
                    <g key={face.id}>
                      <ellipse
                        cx={cx} cy={cy} rx={rx} ry={ry}
                        fill="rgba(251,146,60,0.2)"
                        stroke="#f97316"
                        strokeWidth={sw}
                        strokeDasharray={`${face.width * 0.05} ${face.width * 0.025}`}
                      />
                      {/* Resize handle — bottom-right corner */}
                      <circle
                        cx={face.x + face.width} cy={face.y + face.height} r={hr}
                        fill="#f97316"
                        style={{ pointerEvents: 'all', cursor: 'se-resize' }}
                        onMouseDown={(e) => startResize(e, face)}
                      />
                      <text
                        x={face.x + face.width} y={face.y + face.height}
                        textAnchor="middle" dominantBaseline="central"
                        fill="white" fontSize={fs}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >↔</text>
                      {/* Delete button — top-right corner */}
                      <circle
                        cx={face.x + face.width} cy={face.y} r={hr}
                        fill="#ef4444"
                        style={{ pointerEvents: 'all', cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); onRemoveManualFace(photo.id, face.id); }}
                      />
                      <text
                        x={face.x + face.width} y={face.y}
                        textAnchor="middle" dominantBaseline="central"
                        fill="white" fontSize={fs}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >✕</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
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
          <button
            title="Click the image to manually place a face blur area"
            className={`redetect-btn ${addFaceMode ? 'redetect-btn--active' : ''}`}
            onClick={() => setAddFaceMode((f) => !f)}
          >
            {addFaceMode ? '✕ Cancel' : '+ Add face'}
          </button>
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

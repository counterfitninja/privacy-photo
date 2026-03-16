import { useRef, useState } from 'react';

export default function UploadZone({ onFiles, compact }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length) onFiles(images);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={`upload-zone ${compact ? 'upload-zone--compact' : ''} ${dragging ? 'upload-zone--active' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
    >
      {!compact && <div className="upload-zone__icon">📷</div>}
      <p className="upload-zone__text">
        {compact ? '+ Add more photos' : <>Drop photos here or <span className="upload-zone__link">browse</span></>}
      </p>
      {!compact && <p className="upload-zone__hint">Supports JPG, PNG, WebP — single or batch</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

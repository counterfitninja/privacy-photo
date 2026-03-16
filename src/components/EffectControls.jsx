import { useRef } from 'react';

const EMOJIS = ['😀', '🙂', '😎', '🤡', '👽', '🐶', '🐱', '🌟', '🔵', '⬛'];

export default function EffectControls({ effect, onChange, onProcess, processing, hasPhotos }) {
  const stickerInputRef = useRef(null);

  function handleStickerUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onChange({ stickerType: 'image', stickerSrc: url });
  }

  return (
    <div className="effect-controls">
      <div className="effect-controls__section">
        <label className="effect-controls__label">Effect</label>
        <div className="effect-controls__radios">
          {['blur', 'pixelate', 'sticker'].map((type) => (
            <label key={type} className={`radio-btn ${effect.type === type ? 'radio-btn--active' : ''}`}>
              <input
                type="radio"
                name="effect"
                value={type}
                checked={effect.type === type}
                onChange={() => onChange({ type })}
              />
              {type === 'blur' && '🌫 Blur'}
              {type === 'pixelate' && '🔲 Pixelate'}
              {type === 'sticker' && '😀 Sticker'}
            </label>
          ))}
        </div>
      </div>

      {effect.type === 'blur' && (
        <>
          <div className="effect-controls__section">
            <label className="effect-controls__label">Blur strength</label>
            <div className="slider-row">
              <input
                type="range" min="4" max="200" step="1"
                value={effect.intensity}
                onChange={(e) => onChange({ intensity: Number(e.target.value) })}
                className="slider"
              />
              <input
                type="number" min="1" max="999"
                value={effect.intensity}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(999, Number(e.target.value) || 1));
                  onChange({ intensity: v });
                }}
                className="slider-input"
              />
            </div>
          </div>
          <div className="effect-controls__section">
            <label className="effect-controls__label">
              Coverage — {effect.coverage <= 1.0 ? 'face only' : effect.coverage >= 2.0 ? 'full head' : 'head'}
            </label>
            <div className="slider-row">
              <input
                type="range" min="0.8" max="2.5" step="0.05"
                value={effect.coverage}
                onChange={(e) => onChange({ coverage: Number(e.target.value) })}
                className="slider"
              />
              <span className="slider-input" style={{ textAlign: 'center' }}>
                {effect.coverage.toFixed(1)}×
              </span>
            </div>
          </div>
        </>
      )}

      {effect.type === 'pixelate' && (
        <>
          <div className="effect-controls__section">
            <label className="effect-controls__label">Pixel size</label>
            <div className="slider-row">
              <input
                type="range" min="2" max="100" step="1"
                value={effect.pixelSize}
                onChange={(e) => onChange({ pixelSize: Number(e.target.value) })}
                className="slider"
              />
              <input
                type="number" min="1" max="999"
                value={effect.pixelSize}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(999, Number(e.target.value) || 1));
                  onChange({ pixelSize: v });
                }}
                className="slider-input"
              />
            </div>
          </div>
          <div className="effect-controls__section">
            <label className="effect-controls__label">
              Coverage — {effect.coverage <= 1.0 ? 'face only' : effect.coverage >= 2.0 ? 'full head' : 'head'}
            </label>
            <div className="slider-row">
              <input
                type="range" min="0.8" max="2.5" step="0.05"
                value={effect.coverage}
                onChange={(e) => onChange({ coverage: Number(e.target.value) })}
                className="slider"
              />
              <span className="slider-input" style={{ textAlign: 'center' }}>
                {effect.coverage.toFixed(1)}×
              </span>
            </div>
          </div>
        </>
      )}

      {effect.type === 'sticker' && (
        <div className="effect-controls__section">
          <label className="effect-controls__label">Choose sticker</label>
          <div className="emoji-grid">
            {EMOJIS.map((em) => (
              <button
                key={em}
                className={`emoji-btn ${effect.stickerType === 'emoji' && effect.emoji === em ? 'emoji-btn--active' : ''}`}
                onClick={() => onChange({ stickerType: 'emoji', emoji: em })}
              >
                {em}
              </button>
            ))}
          </div>
          <button className="btn btn--secondary" style={{ marginTop: 8 }} onClick={() => stickerInputRef.current.click()}>
            Upload custom image
          </button>
          {effect.stickerType === 'image' && effect.stickerSrc && (
            <img src={effect.stickerSrc} alt="sticker" className="sticker-preview" />
          )}
          <input ref={stickerInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleStickerUpload} />
        </div>
      )}

      <button
        className="btn btn--primary process-btn"
        onClick={onProcess}
        disabled={!hasPhotos || processing}
      >
        {processing ? 'Processing…' : 'Process All Photos'}
      </button>
    </div>
  );
}

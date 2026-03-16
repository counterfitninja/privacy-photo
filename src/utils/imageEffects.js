/**
 * Box blur via direct pixel manipulation — sharp edges, no CSS filter bleed.
 * The blur is computed on the full rectangular region, then stamped back through
 * an ellipse clip so only the face shape is covered (not a square patch).
 */
export function applyBlur(ctx, _img, box, radius, coverageScale = 1.0) {
  // Increase pad proportionally so the blurred rect always fully covers the ellipse
  const basePad = Math.round(box.width * 0.15);
  const extra = Math.max(0, coverageScale - 1);
  const pad = Math.round(basePad + box.width * 0.5 * extra);
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const rx = Math.max(0, Math.floor(box.x - pad));
  const ry = Math.max(0, Math.floor(box.y - pad));
  const rw = Math.min(W - rx, Math.ceil(box.width + pad * 2));
  const rh = Math.min(H - ry, Math.ceil(box.height + pad * 2));

  // --- Step 1: box-blur the rectangular region into a separate canvas ---
  const imageData = ctx.getImageData(0, 0, W, H);
  const p = imageData.data;

  // 7 passes: approximates a very strong Gaussian (sigma ≈ √7 × radius)
  for (let i = 0; i < 7; i++) {
    _boxH(p, W, H, rx, ry, rw, rh, radius);
    _boxV(p, W, H, rx, ry, rw, rh, radius);
  }

  // Write the blurred pixels to a scratch canvas (original ctx is untouched)
  const blurred = document.createElement('canvas');
  blurred.width = W;
  blurred.height = H;
  blurred.getContext('2d').putImageData(imageData, 0, 0);

  // --- Step 2: stamp the blurred region back through an ellipse clip ---
  // Ellipse is sized to the face bounding box, slightly extended vertically
  // to cover forehead/chin.
  const cx = box.x + box.width / 2;
  // Shift center upward as coverage grows — hair/forehead sits above the detected face box
  const cyOffset = (coverageScale - 1) * box.height * 0.15;
  const cy = box.y + box.height / 2 - cyOffset;
  const ex = (box.width / 2) * 1.05 * coverageScale;
  const ey = (box.height / 2) * 1.1 * coverageScale;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(blurred, 0, 0);
  ctx.restore();
}

/** Horizontal box-blur pass — reads & writes full-image pixel array */
function _boxH(p, W, H, rx, ry, rw, rh, r) {
  const buf = new Uint8ClampedArray(rw * rh * 3);
  const d = r * 2 + 1;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      let R = 0, G = 0, B = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.max(0, Math.min(W - 1, x + dx));
        const i = (y * W + nx) * 4;
        R += p[i]; G += p[i + 1]; B += p[i + 2];
      }
      const bi = ((y - ry) * rw + (x - rx)) * 3;
      buf[bi] = R / d; buf[bi + 1] = G / d; buf[bi + 2] = B / d;
    }
  }
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const bi = ((y - ry) * rw + (x - rx)) * 3;
      const i = (y * W + x) * 4;
      p[i] = buf[bi]; p[i + 1] = buf[bi + 1]; p[i + 2] = buf[bi + 2];
    }
  }
}

/** Vertical box-blur pass — reads & writes full-image pixel array */
function _boxV(p, W, H, rx, ry, rw, rh, r) {
  const buf = new Uint8ClampedArray(rw * rh * 3);
  const d = r * 2 + 1;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      let R = 0, G = 0, B = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.max(0, Math.min(H - 1, y + dy));
        const i = (ny * W + x) * 4;
        R += p[i]; G += p[i + 1]; B += p[i + 2];
      }
      const bi = ((y - ry) * rw + (x - rx)) * 3;
      buf[bi] = R / d; buf[bi + 1] = G / d; buf[bi + 2] = B / d;
    }
  }
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const bi = ((y - ry) * rw + (x - rx)) * 3;
      const i = (y * W + x) * 4;
      p[i] = buf[bi]; p[i + 1] = buf[bi + 1]; p[i + 2] = buf[bi + 2];
    }
  }
}

/**
 * Pixelation — downscale / upscale with no smoothing, clipped to face ellipse.
 */
export function applyPixelate(ctx, img, box, pixelSize, coverageScale = 1.0) {
  const basePad = Math.round(box.width * 0.15);
  const extra = Math.max(0, coverageScale - 1);
  const pad = Math.round(basePad + box.width * 0.5 * extra);
  const rx = Math.max(0, Math.floor(box.x - pad));
  const ry = Math.max(0, Math.floor(box.y - pad));
  const rw = Math.min(img.naturalWidth - rx, Math.ceil(box.width + pad * 2));
  const rh = Math.min(img.naturalHeight - ry, Math.ceil(box.height + pad * 2));

  const scale = Math.max(1, pixelSize);
  const w = Math.max(1, Math.ceil(rw / scale));
  const h = Math.max(1, Math.ceil(rh / scale));

  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.imageSmoothingEnabled = false;
  tc.drawImage(img, rx, ry, rw, rh, 0, 0, w, h);

  const cx = box.x + box.width / 2;
  const cyOffset = (coverageScale - 1) * box.height * 0.15;
  const cy = box.y + box.height / 2 - cyOffset;
  const ex = (box.width / 2) * 1.05 * coverageScale;
  const ey = (box.height / 2) * 1.1 * coverageScale;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, w, h, rx, ry, rw, rh);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
}

/** Emoji sticker centered over the face */
export function applyEmoji(ctx, box, emoji) {
  const size = Math.round(Math.max(box.width, box.height) * 1.15);
  ctx.font = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, box.x + box.width / 2, box.y + box.height / 2);
}

/** Custom image sticker over the face */
export function applyImageSticker(ctx, box, stickerImg) {
  const pad = Math.round(box.width * 0.1);
  ctx.drawImage(stickerImg, box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2);
}

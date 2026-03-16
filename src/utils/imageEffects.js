/**
 * GPU-accelerated blur via the Canvas 2D filter API.
 * Chrome routes ctx.filter through the GPU compositor (Skia/GL), making this
 * orders of magnitude faster than the previous JS pixel-loop approach.
 * The blurred image is stamped back through an ellipse clip so only the face
 * shape is covered.
 */
export function applyBlur(ctx, _img, box, radius, coverageScale = 1.0) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  // Map the intensity slider (4–200) to a CSS blur radius in pixels.
  // CSS blur(Xpx) is a Gaussian with σ=X, so a modest value produces a strong effect.
  const blurPx = Math.max(1, Math.round(radius / 5));

  // Render the current canvas state through the GPU blur filter into a temp canvas
  const tmp = document.createElement('canvas');
  tmp.width = W;
  tmp.height = H;
  const tc = tmp.getContext('2d');
  tc.filter = `blur(${blurPx}px)`;
  tc.drawImage(ctx.canvas, 0, 0);

  // Ellipse sized to the face bounding box
  const cx = box.x + box.width / 2;
  const cyOffset = (coverageScale - 1) * box.height * 0.15;
  const cy = box.y + box.height / 2 - cyOffset;
  const ex = (box.width / 2) * 1.05 * coverageScale;
  const ey = (box.height / 2) * 1.1 * coverageScale;

  // Stamp the blurred version back through the ellipse clip
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, ex, ey, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
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

/**
 * Draw googly eyes over the face region.
 * Each eye has a white sclera, dark iris outline, and a randomly-offset pupil.
 */
export function drawGooglyEyes(ctx, box) {
  const eyeR = box.width * 0.18;
  const pupilR = eyeR * 0.45;
  const eyeY = box.y + box.height * 0.38;
  const leftEyeX  = box.x + box.width * 0.32;
  const rightEyeX = box.x + box.width * 0.68;

  function drawOneEye(x, y) {
    // Sclera
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(1, eyeR * 0.1);
    ctx.stroke();
    ctx.restore();

    // Googly pupil — random offset within sclera
    const maxOff = (eyeR - pupilR) * 0.8;
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * maxOff;
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;

    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.restore();

    // Specular highlight
    ctx.save();
    ctx.beginPath();
    ctx.arc(px - pupilR * 0.28, py - pupilR * 0.28, pupilR * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
    ctx.restore();
  }

  drawOneEye(leftEyeX, eyeY);
  drawOneEye(rightEyeX, eyeY);

  // Smiley mouth — arc centered below the eyes
  const mouthCX = box.x + box.width / 2;
  const mouthCY = box.y + box.height * 0.68;
  const mouthR  = box.width * 0.22;
  const mouthLineW = Math.max(2, box.width * 0.04);

  ctx.save();
  ctx.beginPath();
  ctx.arc(mouthCX, mouthCY, mouthR, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = mouthLineW;
  ctx.lineCap = 'round';
  ctx.stroke();
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

"""
privacy-photo: Flask web application for face detection and anonymisation.

Supported modes:
- blur  : Gaussian blur applied through an elliptical mask that follows the
          face oval (not just a rectangle or circle).
- icon  : Replace detected faces with a privacy-silhouette icon.
"""

import io
import os
import uuid
import zipfile
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, jsonify, render_template, request, send_file
from PIL import Image

# ---------------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------------

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB total upload limit

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}

# ---------------------------------------------------------------------------
# Face detector (loaded once at startup)
# ---------------------------------------------------------------------------

_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_face_cascade = cv2.CascadeClassifier(_CASCADE_PATH)

# Also try profile faces for better coverage
_PROFILE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_profileface.xml"
_profile_cascade = cv2.CascadeClassifier(_PROFILE_CASCADE_PATH)

# ---------------------------------------------------------------------------
# Icon (generated once at startup)
# ---------------------------------------------------------------------------

def _build_icon(size: int) -> np.ndarray:
    """Build a simple privacy-silhouette icon as an RGBA numpy array."""
    img = np.zeros((size, size, 4), dtype=np.uint8)
    cx, cy = size // 2, size // 2

    # Background circle
    cv2.circle(img, (cx, cy), size // 2, (80, 80, 80, 230), -1)

    # Head circle
    head_r = size // 5
    head_cy = int(cy * 0.6)
    cv2.circle(img, (cx, head_cy), head_r, (200, 200, 200, 255), -1)

    # Shoulders (half-ellipse at bottom)
    axes = (int(size * 0.38), int(size * 0.35))
    cv2.ellipse(img, (cx, size), axes, 0, 180, 360, (200, 200, 200, 255), -1)

    return img


_ICON_BASE_SIZE = 256
_icon_base = _build_icon(_ICON_BASE_SIZE)


def _get_icon(width: int, height: int) -> np.ndarray:
    """Return the icon resized to (width, height)."""
    return cv2.resize(_icon_base, (width, height), interpolation=cv2.INTER_AREA)


# ---------------------------------------------------------------------------
# Image processing helpers
# ---------------------------------------------------------------------------

def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _detect_faces(gray: np.ndarray):
    """Detect faces using frontal + profile cascades and return merged list."""
    scale = 1.1
    min_n = 4

    frontal = _face_cascade.detectMultiScale(
        gray,
        scaleFactor=scale,
        minNeighbors=min_n,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )
    profile = _profile_cascade.detectMultiScale(
        gray,
        scaleFactor=scale,
        minNeighbors=min_n,
        minSize=(30, 30),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    faces = list(frontal) if len(frontal) else []
    if len(profile):
        faces += list(profile)

    # Deduplicate overlapping boxes (simple IoU > 0.3 suppression)
    return _nms(faces)


def _iou(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(ax, bx)
    iy = max(ay, by)
    iw = max(0, min(ax + aw, bx + bw) - ix)
    ih = max(0, min(ay + ah, by + bh) - iy)
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _nms(faces: list, threshold: float = 0.3) -> list:
    if not faces:
        return []
    kept = []
    for face in faces:
        if not any(_iou(face, k) > threshold for k in kept):
            kept.append(face)
    return kept


def _apply_blur(image: np.ndarray, faces: list) -> np.ndarray:
    """
    Apply Gaussian blur through an elliptical mask so only the face oval
    is blurred, not the rectangular bounding box.
    """
    result = image.copy()
    h_img, w_img = image.shape[:2]

    for (x, y, w, h) in faces:
        # Build a feathered elliptical mask
        mask = np.zeros((h_img, w_img), dtype=np.float32)
        cx, cy = x + w // 2, y + h // 2
        axes = (int(w * 0.52), int(h * 0.60))  # slight padding so edges are covered
        cv2.ellipse(mask, (cx, cy), axes, 0, 0, 360, 1.0, -1)

        # Feather (soften) mask edges with a Gaussian blur
        mask = cv2.GaussianBlur(mask, (31, 31), 0)

        # Blur the face region
        blurred = cv2.GaussianBlur(
            image[max(0, y - 10):min(h_img, y + h + 10),
                  max(0, x - 10):min(w_img, x + w + 10)],
            (99, 99),
            30,
        )
        # Paste blurred region back into a full-size buffer
        blurred_full = image.copy()
        blurred_full[
            max(0, y - 10):min(h_img, y + h + 10),
            max(0, x - 10):min(w_img, x + w + 10),
        ] = blurred

        # Blend using mask
        for c in range(3):
            result[:, :, c] = (
                mask * blurred_full[:, :, c] + (1 - mask) * result[:, :, c]
            ).astype(np.uint8)

    return result


def _apply_icon(image: np.ndarray, faces: list) -> np.ndarray:
    """Replace each detected face with the privacy silhouette icon."""
    result = image.copy()
    h_img, w_img = image.shape[:2]

    for (x, y, w, h) in faces:
        icon = _get_icon(w, h)  # RGBA

        # Clip region to image bounds
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(w_img, x + w), min(h_img, y + h)
        iw, ih = x2 - x1, y2 - y1
        if iw <= 0 or ih <= 0:
            continue

        icon_crop = icon[:ih, :iw]
        alpha = icon_crop[:, :, 3:4].astype(np.float32) / 255.0
        icon_rgb = icon_crop[:, :, :3].astype(np.float32)
        bg = result[y1:y2, x1:x2].astype(np.float32)

        result[y1:y2, x1:x2] = (
            alpha * icon_rgb + (1 - alpha) * bg
        ).astype(np.uint8)

    return result


def _process_image(pil_image: Image.Image, mode: str) -> tuple[Image.Image, int]:
    """
    Detect faces and anonymise them.

    Returns (processed PIL image, number of faces found).
    """
    # Convert to RGB numpy array
    rgb = np.array(pil_image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)

    faces = _detect_faces(gray)

    if not faces:
        return pil_image, 0

    if mode == "icon":
        result_bgr = _apply_icon(bgr, faces)
    else:
        result_bgr = _apply_blur(bgr, faces)

    result_rgb = cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(result_rgb), len(faces)


def _pil_to_bytes(image: Image.Image, fmt: str = "JPEG") -> bytes:
    buf = io.BytesIO()
    save_fmt = "PNG" if fmt.upper() == "PNG" else "JPEG"
    image.save(buf, format=save_fmt, quality=90)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/process", methods=["POST"])
def process():
    """
    Accept one or more image files plus a ``mode`` field.

    Single file  → return the processed image directly.
    Multiple files → return a ZIP archive.
    """
    mode = request.form.get("mode", "blur")
    if mode not in ("blur", "icon"):
        mode = "blur"

    files = request.files.getlist("photos")
    if not files or all(f.filename == "" for f in files):
        return jsonify({"error": "No files uploaded"}), 400

    valid_files = [f for f in files if f.filename and _allowed_file(f.filename)]
    if not valid_files:
        return jsonify({"error": "No supported image files found"}), 400

    results: list[tuple[str, bytes, int]] = []
    errors: list[str] = []

    for upload in valid_files:
        try:
            pil_img = Image.open(upload.stream)
            processed, face_count = _process_image(pil_img, mode)

            ext = upload.filename.rsplit(".", 1)[1].lower()
            fmt = "PNG" if ext == "png" else "JPEG"
            output_ext = ext if ext in ("png", "jpg", "jpeg") else "jpg"

            data = _pil_to_bytes(processed, fmt)
            stem = Path(upload.filename).stem
            out_name = f"{stem}_anonymised.{output_ext}"
            results.append((out_name, data, face_count))
        except Exception as exc:  # pragma: no cover
            errors.append(f"{upload.filename}: {exc}")

    if not results:
        return jsonify({"error": "Processing failed", "details": errors}), 500

    if len(results) == 1:
        name, data, face_count = results[0]
        mime = "image/png" if name.endswith(".png") else "image/jpeg"
        resp = send_file(
            io.BytesIO(data),
            mimetype=mime,
            as_attachment=True,
            download_name=name,
        )
        resp.headers["X-Face-Count"] = str(face_count)
        return resp

    # Multiple files → ZIP
    zip_buf = io.BytesIO()
    total_faces = 0
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data, face_count in results:
            zf.writestr(name, data)
            total_faces += face_count
    zip_buf.seek(0)
    resp = send_file(
        zip_buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name="anonymised_photos.zip",
    )
    resp.headers["X-Face-Count"] = str(total_faces)
    resp.headers["X-File-Count"] = str(len(results))
    return resp


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=5000)

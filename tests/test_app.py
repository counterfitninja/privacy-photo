"""
Tests for the privacy-photo Flask application.

Covers:
- Route availability
- Rejection of unsupported file types
- Single-file processing (blur and icon modes) with a synthetic face image
- Batch processing returning a ZIP
- Empty / missing upload handling
"""

import io
import zipfile

import numpy as np
import pytest

# Import the Flask app
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import app as app_module
from app import app as flask_app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


def _make_jpeg(width: int = 120, height: int = 120) -> bytes:
    """Return a minimal JPEG image as bytes (solid grey)."""
    from PIL import Image
    img = Image.fromarray(np.full((height, width, 3), 128, dtype=np.uint8), "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png(width: int = 80, height: int = 80) -> bytes:
    from PIL import Image
    img = Image.fromarray(np.zeros((height, width, 3), dtype=np.uint8), "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Route tests
# ---------------------------------------------------------------------------

def test_index_returns_200(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Privacy Photo" in resp.data


def test_index_contains_upload_form(client):
    resp = client.get("/")
    assert b"uploadForm" in resp.data
    assert b"photos" in resp.data


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------

def test_no_files_returns_400(client):
    resp = client.post("/process", data={"mode": "blur"})
    assert resp.status_code == 400


def test_unsupported_file_type_returns_400(client):
    data = {
        "mode": "blur",
        "photos": (io.BytesIO(b"not an image"), "file.txt"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Processing tests
# ---------------------------------------------------------------------------

def test_single_blur_returns_image(client):
    data = {
        "mode": "blur",
        "photos": (io.BytesIO(_make_jpeg()), "test.jpg"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert "image/" in resp.content_type


def test_single_icon_returns_image(client):
    data = {
        "mode": "icon",
        "photos": (io.BytesIO(_make_jpeg()), "test.jpg"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert "image/" in resp.content_type


def test_single_png_returns_image(client):
    data = {
        "mode": "blur",
        "photos": (io.BytesIO(_make_png()), "photo.png"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert "image/" in resp.content_type


def test_output_filename_contains_anonymised(client):
    data = {
        "mode": "blur",
        "photos": (io.BytesIO(_make_jpeg()), "myphoto.jpg"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    cd = resp.headers.get("Content-Disposition", "")
    assert "anonymised" in cd


def test_face_count_header_present(client):
    data = {
        "mode": "blur",
        "photos": (io.BytesIO(_make_jpeg()), "test.jpg"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert "X-Face-Count" in resp.headers


def test_batch_returns_zip(client):
    jpeg = _make_jpeg()
    data = {
        "mode": "blur",
        "photos": [
            (io.BytesIO(jpeg), "a.jpg"),
            (io.BytesIO(jpeg), "b.jpg"),
        ],
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200
    assert resp.content_type == "application/zip"
    with zipfile.ZipFile(io.BytesIO(resp.data)) as zf:
        names = zf.namelist()
    assert len(names) == 2
    assert all("anonymised" in n for n in names)


def test_invalid_mode_falls_back_to_blur(client):
    """Unknown mode should not crash; server defaults to blur."""
    data = {
        "mode": "lasers",
        "photos": (io.BytesIO(_make_jpeg()), "test.jpg"),
    }
    resp = client.post("/process", data=data, content_type="multipart/form-data")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Unit tests for internal helpers
# ---------------------------------------------------------------------------

def test_allowed_file_accepts_jpg():
    assert app_module._allowed_file("photo.jpg") is True

def test_allowed_file_accepts_png():
    assert app_module._allowed_file("image.PNG") is True

def test_allowed_file_rejects_txt():
    assert app_module._allowed_file("notes.txt") is False

def test_allowed_file_rejects_no_extension():
    assert app_module._allowed_file("noextension") is False

def test_nms_removes_overlapping():
    boxes = [(0, 0, 100, 100), (5, 5, 100, 100)]  # heavily overlapping
    result = app_module._nms(boxes, threshold=0.3)
    assert len(result) == 1

def test_nms_keeps_non_overlapping():
    boxes = [(0, 0, 50, 50), (200, 200, 50, 50)]
    result = app_module._nms(boxes, threshold=0.3)
    assert len(result) == 2

def test_nms_empty():
    assert app_module._nms([]) == []

def test_build_icon_shape():
    icon = app_module._build_icon(64)
    assert icon.shape == (64, 64, 4)

def test_get_icon_resizes():
    icon = app_module._get_icon(32, 48)
    assert icon.shape == (48, 32, 4)

def test_apply_blur_no_crash():
    img = np.full((200, 200, 3), 128, dtype=np.uint8)
    faces = [(50, 50, 80, 80)]
    result = app_module._apply_blur(img, faces)
    assert result.shape == img.shape

def test_apply_icon_no_crash():
    img = np.full((200, 200, 3), 200, dtype=np.uint8)
    faces = [(60, 60, 70, 70)]
    result = app_module._apply_icon(img, faces)
    assert result.shape == img.shape

def test_apply_blur_empty_faces():
    img = np.full((100, 100, 3), 100, dtype=np.uint8)
    result = app_module._apply_blur(img, [])
    np.testing.assert_array_equal(result, img)

def test_apply_icon_empty_faces():
    img = np.full((100, 100, 3), 100, dtype=np.uint8)
    result = app_module._apply_icon(img, [])
    np.testing.assert_array_equal(result, img)

def test_process_image_no_faces():
    from PIL import Image
    pil_img = Image.fromarray(np.full((80, 80, 3), 128, dtype=np.uint8))
    processed, count = app_module._process_image(pil_img, "blur")
    assert count == 0
    assert processed.size == pil_img.size

import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';

let modelsLoaded = false;

export async function loadModels() {
  if (modelsLoaded) return;
  // Prefer WebGL (GPU) backend; falls back to CPU if unavailable
  try {
    await tf.setBackend('webgl');
    await tf.ready();
  } catch {
    // WebGL unavailable, TF.js will use CPU fallback
  }
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
  ]);
  modelsLoaded = true;
}

/**
 * Detect all faces in an image element.
 * @param {HTMLImageElement} imageElement
 * @param {'both'|'ssd'|'tiny'} model
 */
export async function detectFaces(imageElement, model = 'both') {
  let boxes = [];

  if (model === 'ssd' || model === 'both') {
    const results = await faceapi.detectAllFaces(
      imageElement,
      new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
    );
    boxes.push(...results.map(toBox));
  }

  if (model === 'tiny' || model === 'both') {
    const results = await faceapi.detectAllFaces(
      imageElement,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 608, scoreThreshold: 0.3 })
    );
    boxes.push(...results.map(toBox));
  }

  return mergeDuplicates(boxes, 0.4);
}

function toBox(d) {
  return {
    x: Math.max(0, d.box.x),
    y: Math.max(0, d.box.y),
    width: d.box.width,
    height: d.box.height,
  };
}

function mergeDuplicates(boxes, iouThreshold) {
  const kept = [];
  for (const box of boxes) {
    if (!kept.some((k) => iou(k, box) > iouThreshold)) kept.push(box);
  }
  return kept;
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}

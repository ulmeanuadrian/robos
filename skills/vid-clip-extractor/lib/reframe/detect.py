"""OpenCV DNN face detector (ResNet-10 SSD Caffe model)."""

from pathlib import Path

import cv2
import numpy as np

_MODELS_DIR = Path(__file__).resolve().parent / "models"
_PROTOTXT = str(_MODELS_DIR / "deploy.prototxt")
_CAFFEMODEL = str(_MODELS_DIR / "res10_300x300_ssd_iter_140000.caffemodel")
_MEAN_VALUES = (104.0, 177.0, 123.0)


def init_detector():
    """Load the ResNet-10 SSD Caffe model and return the cv2.dnn.Net."""
    if not _MODELS_DIR.exists():
        raise FileNotFoundError(
            f"Models directory not found: {_MODELS_DIR}\n"
            "Download deploy.prototxt and res10_300x300_ssd_iter_140000.caffemodel "
            "into tools/reframe/models/"
        )
    return cv2.dnn.readNetFromCaffe(_PROTOTXT, _CAFFEMODEL)


def detect_face(frame_bgr, net, min_conf=0.5):
    """Detect the largest face in a BGR frame.

    Returns (cx_norm, cy_norm, face_w_norm, face_h_norm, conf) or None.
    """
    blob = cv2.dnn.blobFromImage(frame_bgr, 1.0, (300, 300), _MEAN_VALUES)
    net.setInput(blob)
    detections = net.forward()

    best = None
    best_area = 0

    for i in range(detections.shape[2]):
        conf = float(detections[0, 0, i, 2])
        if conf < min_conf:
            continue

        x1 = max(0.0, min(1.0, float(detections[0, 0, i, 3])))
        y1 = max(0.0, min(1.0, float(detections[0, 0, i, 4])))
        x2 = max(0.0, min(1.0, float(detections[0, 0, i, 5])))
        y2 = max(0.0, min(1.0, float(detections[0, 0, i, 6])))

        area = (x2 - x1) * (y2 - y1)
        if area > best_area:
            best_area = area
            best = ((x1 + x2) / 2, (y1 + y2) / 2, x2 - x1, y2 - y1, conf)

    return best

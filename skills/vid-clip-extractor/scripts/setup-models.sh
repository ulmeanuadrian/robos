#!/bin/bash
# setup-models.sh — download OpenCV DNN + MediaPipe models pentru vid-clip-* skill-uri.
#
# Modelele NU sunt shipped in tarball (~35MB total). Le descarcam la prima rulare a
# tier-ului video-producer.
#
# Usage: bash skills/vid-clip-extractor/scripts/setup-models.sh
#
# Idempotent: skip download daca modelele exista deja la dimensiunea corecta.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="$SKILL_DIR/lib/clip_extractor/models"
REFRAME_MODELS_DIR="$SKILL_DIR/lib/reframe/models"

ok() { printf "\033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$1"; }
info() { printf "\033[36m→\033[0m %s\n" "$1"; }

mkdir -p "$MODELS_DIR" "$REFRAME_MODELS_DIR"

# Helper: download daca lipseste sau dimensiunea e gresita
download_if_missing() {
  local url="$1"
  local dest="$2"
  local expected_size="$3"

  if [ -f "$dest" ]; then
    local actual_size=$(stat -c%s "$dest" 2>/dev/null || stat -f%z "$dest" 2>/dev/null || echo 0)
    if [ "$actual_size" -eq "$expected_size" ]; then
      ok "$(basename "$dest") (deja prezent, ${actual_size} bytes)"
      return 0
    fi
    info "$(basename "$dest") size mismatch (${actual_size} vs ${expected_size}) — re-download"
  fi

  info "Download $(basename "$dest")..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest" || { fail "curl fail pentru $url"; return 1; }
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest" || { fail "wget fail pentru $url"; return 1; }
  else
    fail "curl si wget lipsesc. Install unul si re-ruleaza."
    return 1
  fi
  ok "$(basename "$dest") descarcat ($(stat -c%s "$dest" 2>/dev/null || stat -f%z "$dest" 2>/dev/null) bytes)"
}

# OpenCV DNN face detection (ResNet-10 SSD)
download_if_missing \
  "https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel" \
  "$MODELS_DIR/res10_300x300_ssd_iter_140000.caffemodel" \
  10666211

# Replicate la reframe/ models (pentru vid-clip-extractor pipeline)
if [ ! -f "$REFRAME_MODELS_DIR/res10_300x300_ssd_iter_140000.caffemodel" ]; then
  cp "$MODELS_DIR/res10_300x300_ssd_iter_140000.caffemodel" "$REFRAME_MODELS_DIR/"
  ok "res10_300x300 copy to reframe/models/"
fi

# MediaPipe models (Google Cloud Storage)
download_if_missing \
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" \
  "$MODELS_DIR/face_landmarker.task" \
  3758596

download_if_missing \
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task" \
  "$MODELS_DIR/pose_landmarker_lite.task" \
  5777746

download_if_missing \
  "https://storage.googleapis.com/mediapipe-assets/face_detection_full_range.tflite" \
  "$MODELS_DIR/face_detection_full_range.tflite" \
  1083786

download_if_missing \
  "https://storage.googleapis.com/mediapipe-assets/blaze_face_short_range.tflite" \
  "$MODELS_DIR/blaze_face_short_range.tflite" \
  229746

# OpenCV YuNet
download_if_missing \
  "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
  "$MODELS_DIR/face_detection_yunet_2023mar.onnx" \
  232589

# Sync to vid-clip-selection (acelasi clip_extractor module)
SELECTION_DIR="$(cd "$SKILL_DIR/../vid-clip-selection/lib/clip_extractor/models" 2>/dev/null && pwd || echo "")"
if [ -n "$SELECTION_DIR" ]; then
  info "Sync models to vid-clip-selection..."
  for model in "$MODELS_DIR"/*.{caffemodel,task,tflite,onnx}; do
    [ -f "$model" ] || continue
    target="$SELECTION_DIR/$(basename "$model")"
    if [ ! -f "$target" ] || [ "$(stat -c%s "$model" 2>/dev/null || stat -f%z "$model" 2>/dev/null)" -ne "$(stat -c%s "$target" 2>/dev/null || stat -f%z "$target" 2>/dev/null || echo 0)" ]; then
      cp "$model" "$target"
    fi
  done
  ok "vid-clip-selection synced"
fi

echo
ok "Toate modelele necesare pentru vid-clip-* sunt prezente"
echo "Total ~22MB (caffemodel 10MB + MediaPipe ~12MB)"

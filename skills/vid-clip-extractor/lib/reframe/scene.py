"""Scene detection via HSV histogram difference and video metadata."""

import subprocess
import json

import cv2
import numpy as np


def get_video_info(path):
    """Return {width, height, fps, total_frames} via ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    data = json.loads(out)
    vs = next(s for s in data["streams"] if s["codec_type"] == "video")
    num, den = vs["r_frame_rate"].split("/")
    fps = int(num) / int(den)
    return {
        "width": int(vs["width"]),
        "height": int(vs["height"]),
        "fps": fps,
        "total_frames": int(vs.get("nb_frames", int(float(data["format"]["duration"]) * fps))),
    }


def detect_scenes(video_path, threshold=0.4):
    """Detect scene boundaries by comparing HSV histograms every 10th frame.

    Returns list of (start_frame, end_frame) tuples.
    """
    info = get_video_info(video_path)
    w, h, total = info["width"], info["height"], info["total_frames"]

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", f"select=not(mod(n\\,10)),scale=320:-1",
        "-vsync", "vfr", "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    scale_w = 320
    scale_h = int(h * 320 / w)
    frame_size = scale_w * scale_h * 3

    prev_hist = None
    cuts = []
    frame_idx = 0

    while True:
        raw = proc.stdout.read(frame_size)
        if len(raw) < frame_size:
            break

        frame = np.frombuffer(raw, dtype=np.uint8).reshape(scale_h, scale_w, 3)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
        cv2.normalize(hist, hist)

        if prev_hist is not None:
            diff = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
            if diff > threshold:
                cuts.append(frame_idx * 10)

        prev_hist = hist
        frame_idx += 1

    proc.wait()

    if not cuts:
        return [(0, total - 1)]

    scenes = []
    prev = 0
    for c in cuts:
        if c > prev:
            scenes.append((prev, c - 1))
        prev = c
    scenes.append((prev, total - 1))
    return scenes

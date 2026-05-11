"""Face-track layout: simple 9:16 crop that follows the speaker's face.

Uses motion-classified smoothing (stationary/panning/tracking) per scene.
"""

import subprocess
import numpy as np
from .detect import init_detector, detect_face
from .scene import detect_scenes, get_video_info
from .render import render_reframed

CROP_W = 810
CROP_H = 1440


def _detect_faces_all(video_path, info, net):
    """Detect faces on every frame."""
    w, h, total = info["width"], info["height"], info["total_frames"]
    frame_bytes = w * h * 3

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    cx_list = []
    idx = 0

    while True:
        raw = proc.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            break
        frame = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3)
        result = detect_face(frame, net)
        cx_list.append(result[0] if result else np.nan)
        idx += 1
        if idx % 300 == 0:
            print(f"  [face-track] Detecting: frame {idx}")

    proc.wait()
    raw_cx = np.array(cx_list)

    nans = np.isnan(raw_cx)
    if nans.all():
        return np.full(len(raw_cx), 0.5)
    valid = ~nans
    indices = np.arange(len(raw_cx))
    raw_cx[nans] = np.interp(indices[nans], indices[valid], raw_cx[valid])
    return raw_cx


def _classify_and_smooth(cx_segment, fps):
    """Classify motion type and apply appropriate smoothing."""
    n = len(cx_segment)
    if n < 2:
        return cx_segment

    cx_range = np.max(cx_segment) - np.min(cx_segment)
    velocity = np.diff(cx_segment)

    if cx_range < 0.12:
        return np.full(n, np.mean(cx_segment))

    abs_vel = np.abs(velocity)
    mean_vel = np.mean(abs_vel)
    vel_std = np.std(abs_vel)
    if mean_vel > 0.001 and vel_std < mean_vel * 0.8:
        return np.linspace(cx_segment[0], cx_segment[-1], n)

    # Stage 3: complex — deadzone EMA
    deadzone = 0.04
    alpha = 0.02
    smoothed = np.empty(n)
    smoothed[0] = cx_segment[0]
    for i in range(1, n):
        delta = cx_segment[i] - smoothed[i - 1]
        if abs(delta) < deadzone:
            smoothed[i] = smoothed[i - 1]
        else:
            smoothed[i] = smoothed[i - 1] + alpha * delta
    return smoothed


def reframe(video_path, output_path):
    """9:16 face-tracking crop with motion-classified smoothing."""
    print("[face-track] Motion-classified face tracking")
    net = init_detector()
    info = get_video_info(video_path)
    w, h, fps = info["width"], info["height"], info["fps"]

    raw_cx = _detect_faces_all(video_path, info, net)
    total = len(raw_cx)

    scenes = detect_scenes(video_path)
    scenes = [(s, min(e, total - 1)) for s, e in scenes if s < total]
    print(f"  [face-track] {len(scenes)} scenes, {total} frames")

    smoothed = np.empty(total)
    for s_start, s_end in scenes:
        seg = raw_cx[s_start:s_end + 1]
        smoothed[s_start:s_end + 1] = _classify_and_smooth(seg, fps)

    max_x = w - CROP_W
    crop_positions = [(int(np.clip(cx * w - CROP_W / 2, 0, max_x)), 0) for cx in smoothed]

    render_reframed(video_path, output_path, crop_positions, CROP_W, CROP_H, w, h, fps)
    print("[face-track] Done.")

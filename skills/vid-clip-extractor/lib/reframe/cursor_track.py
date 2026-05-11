"""Cursor-track layout: wide screen view for screen-share, tight face crop for talking-head.

Screen-share scenes get a single wide 9:8 crop of the screen area (opposite side to face),
centered vertically in the 9:16 output. Talking-head scenes get a tight 9:16 face crop.
"""

import subprocess
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter1d

import cv2

from .detect import init_detector, detect_face
from .scene import detect_scenes, get_video_info

OUT_W, OUT_H = 1080, 1920

# Talking-head mode: tight 9:16 crop
FACE_CROP_W = 810
FACE_CROP_H = 1440

# Screen-share mode: wide 9:8 crop
SCREEN_ASPECT = 9 / 8  # 1.125
FW_THRESHOLD = 0.10


def _detect_faces_all(video_path, info, net):
    """Detect faces on every frame. Returns (cx_array, fw_array)."""
    w, h, total = info["width"], info["height"], info["total_frames"]
    frame_bytes = w * h * 3

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    cx_list = []
    fw_list = []
    idx = 0

    while True:
        raw = proc.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            break
        frame = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3)
        result = detect_face(frame, net)
        if result:
            cx_list.append(result[0])
            fw_list.append(result[2])
        else:
            cx_list.append(np.nan)
            fw_list.append(np.nan)
        idx += 1
        if idx % 300 == 0:
            print(f"  [cursor-track] Detecting: frame {idx}")

    proc.wait()
    raw_cx = np.array(cx_list)
    raw_fw = np.array(fw_list)

    nans = np.isnan(raw_cx)
    if nans.all():
        return np.full(len(raw_cx), 0.5), np.full(len(raw_fw), 0.0)
    valid = ~nans
    indices = np.arange(len(raw_cx))
    raw_cx[nans] = np.interp(indices[nans], indices[valid], raw_cx[valid])
    raw_fw[nans] = np.interp(indices[nans], indices[valid], raw_fw[valid])
    return raw_cx, raw_fw


def _classify_and_smooth(cx_segment, fps):
    """Motion-classified smoothing."""
    n = len(cx_segment)
    if n < 2:
        return cx_segment

    cx_range = np.max(cx_segment) - np.min(cx_segment)
    velocity = np.diff(cx_segment)

    if cx_range < 0.03:
        return np.full(n, np.mean(cx_segment))

    abs_vel = np.abs(velocity)
    mean_vel = np.mean(abs_vel)
    vel_std = np.std(abs_vel)
    if mean_vel > 0.001 and vel_std < mean_vel * 0.8:
        return np.linspace(cx_segment[0], cx_segment[-1], n)

    step = max(1, int(fps))
    cp_indices = list(range(0, n, step))
    if cp_indices[-1] != n - 1:
        cp_indices.append(n - 1)
    cp_values = cx_segment[cp_indices]

    if len(cp_indices) < 4:
        return gaussian_filter1d(cx_segment, sigma=10)

    spline = CubicSpline(cp_indices, cp_values)
    splined = spline(np.arange(n))
    return gaussian_filter1d(splined, sigma=10)


def _render_cursor(video_path, output_path, smoothed_cx, mode_per_frame, screen_x_per_frame,
                   src_w, src_h, fps, total):
    """Custom renderer: wide screen crop or tight face crop depending on mode."""
    frame_bytes = src_w * src_h * 3

    screen_crop_h = src_h
    screen_crop_w = int(screen_crop_h * SCREEN_ASPECT)
    screen_crop_w = min(screen_crop_w, src_w)
    screen_scaled_h = int(OUT_W * screen_crop_h / screen_crop_w)  # 960

    dec_cmd = [
        "ffmpeg", "-i", str(video_path),
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    dec = subprocess.Popen(dec_cmd, stdout=subprocess.PIPE)

    enc_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{OUT_W}x{OUT_H}", "-r", str(fps),
        "-i", "pipe:0",
        "-i", str(video_path),
        "-map", "0:v", "-map", "1:a?",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "20",
        "-movflags", "+faststart",
        "-c:a", "copy",
        "-shortest",
        "-v", "quiet",
        str(output_path),
    ]
    enc = subprocess.Popen(enc_cmd, stdin=subprocess.PIPE)

    frame_idx = 0
    output_frame = np.zeros((OUT_H, OUT_W, 3), dtype=np.uint8)

    while True:
        raw = dec.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            break

        frame = np.frombuffer(raw, dtype=np.uint8).reshape(src_h, src_w, 3)
        i = min(frame_idx, total - 1)
        mode = mode_per_frame[i]
        cx = smoothed_cx[i]

        if mode == 0:
            # SCREEN-SHARE: wide crop opposite to face, centered vertically
            output_frame[:] = 0
            sx = int(screen_x_per_frame[i])
            sx = max(0, min(src_w - screen_crop_w, sx))
            screen_crop = frame[0:screen_crop_h, sx:sx + screen_crop_w]
            scaled = cv2.resize(screen_crop, (OUT_W, screen_scaled_h), interpolation=cv2.INTER_AREA)
            y_offset = (OUT_H - screen_scaled_h) // 2
            output_frame[y_offset:y_offset + screen_scaled_h] = scaled
        else:
            # TALKING-HEAD: tight 9:16 face crop, fills full output
            face_x = int(cx * src_w - FACE_CROP_W / 2)
            face_x = max(0, min(src_w - FACE_CROP_W, face_x))
            face_crop = frame[0:FACE_CROP_H, face_x:face_x + FACE_CROP_W]
            output_frame[:] = cv2.resize(face_crop, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)

        enc.stdin.write(output_frame.tobytes())
        frame_idx += 1

    enc.stdin.close()
    dec.wait()
    enc.wait()
    print(f"  [cursor-track] Rendered {frame_idx} frames -> {output_path}")


def reframe(video_path, output_path):
    """Content-aware: wide screen view (screen-share) or tight face crop (talking-head)."""
    print("[cursor-track] Content-aware — wide screen / face track")
    net = init_detector()
    info = get_video_info(video_path)
    w, h, fps = info["width"], info["height"], info["fps"]

    raw_cx, raw_fw = _detect_faces_all(video_path, info, net)
    total = len(raw_cx)

    scenes = detect_scenes(video_path)
    scenes = [(s, min(e, total - 1)) for s, e in scenes if s < total]
    print(f"  [cursor-track] {len(scenes)} scenes, {total} frames")

    smoothed = np.empty(total)
    mode_per_frame = np.zeros(total, dtype=np.int8)  # 0=screen, 1=talking-head
    screen_x_per_frame = np.zeros(total)

    screen_crop_w = int(h * SCREEN_ASPECT)
    screen_crop_w = min(screen_crop_w, w)

    for s_start, s_end in scenes:
        seg_fw = raw_fw[s_start:s_end + 1]
        seg_cx = raw_cx[s_start:s_end + 1]
        avg_fw = np.nanmean(seg_fw)
        avg_cx = np.nanmean(seg_cx)

        if avg_fw > FW_THRESHOLD:
            mode = "talking-head"
            side = "-"
            smoothed[s_start:s_end + 1] = _classify_and_smooth(seg_cx, fps)
            mode_per_frame[s_start:s_end + 1] = 1
        else:
            mode = "screen-share"
            smoothed[s_start:s_end + 1] = 0.0
            mode_per_frame[s_start:s_end + 1] = 0

            if avg_cx > 0.5:
                screen_x_per_frame[s_start:s_end + 1] = 0
                side = "left"
            else:
                screen_x_per_frame[s_start:s_end + 1] = w - screen_crop_w
                side = "right"

        print(f"  [cursor-track] Scene: frames {s_start}-{s_end}, "
              f"avg_fw={avg_fw:.3f}, avg_cx={avg_cx:.2f}, mode={mode}"
              + (f", screen={side}" if mode == "screen-share" else ""))

    _render_cursor(video_path, output_path, smoothed, mode_per_frame, screen_x_per_frame,
                   w, h, fps, total)
    print("[cursor-track] Done.")

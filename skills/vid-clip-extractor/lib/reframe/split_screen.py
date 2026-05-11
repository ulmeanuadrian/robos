"""Split-screen layout: top = screen content, bottom = face closeup.

Screen-share scenes get a split layout (top 50% wide screen crop, bottom 50% face zoom).
Talking-head scenes get a single full-frame 9:16 face crop.
"""

import subprocess
import numpy as np
from .detect import init_detector, detect_face
from .scene import detect_scenes, get_video_info

import cv2

OUT_W, OUT_H = 1080, 1920
PANEL_H = OUT_H // 2  # 960px each panel
PANEL_ASPECT = OUT_W / PANEL_H  # 9:8 = 1.125

# Top panel: wide screen crop (9:8 aspect from source)
SCREEN_ASPECT = PANEL_ASPECT

# Talking-head single crop (9:16) — computed dynamically from source dims
# These are fallback defaults; reframe() overrides them per-video.
FACE_SINGLE_W = 608
FACE_SINGLE_H = 1080

# Split-screen bottom panel: face zoom — crop sized relative to face, 9:8 aspect
FACE_ZOOM_MULT = 3.5
FACE_CROP_MIN_W = 200

FW_THRESHOLD = 0.10  # face_w > 10% = talking-head


def _detect_faces_all(video_path, info, net):
    """Detect faces on every frame. Returns (cx, cy, fw arrays)."""
    w, h, total = info["width"], info["height"], info["total_frames"]
    frame_bytes = w * h * 3

    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)

    cx_list, cy_list, fw_list = [], [], []
    idx = 0

    while True:
        raw = proc.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            break
        frame = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3)
        result = detect_face(frame, net)
        if result:
            cx_list.append(result[0])
            cy_list.append(result[1])
            fw_list.append(result[2])
        else:
            cx_list.append(np.nan)
            cy_list.append(np.nan)
            fw_list.append(np.nan)
        idx += 1
        if idx % 300 == 0:
            print(f"  [split-screen] Detecting: frame {idx}")

    proc.wait()
    raw_cx = np.array(cx_list)
    raw_cy = np.array(cy_list)
    raw_fw = np.array(fw_list)

    nans = np.isnan(raw_cx)
    if nans.all():
        return (np.full(len(raw_cx), 0.5),
                np.full(len(raw_cy), 0.5),
                np.full(len(raw_fw), 0.05))
    valid = ~nans
    indices = np.arange(len(raw_cx))
    raw_cx[nans] = np.interp(indices[nans], indices[valid], raw_cx[valid])
    raw_cy[nans] = np.interp(indices[nans], indices[valid], raw_cy[valid])
    raw_fw[nans] = np.interp(indices[nans], indices[valid], raw_fw[valid])
    return raw_cx, raw_cy, raw_fw


def _classify_and_smooth(segment, fps, heavy=False):
    """Motion-classified smoothing. heavy=True for tighter crops that amplify movement."""
    n = len(segment)
    if n < 2:
        return segment

    seg_range = np.max(segment) - np.min(segment)
    velocity = np.diff(segment)

    stationary_thresh = 0.20 if heavy else 0.12

    if seg_range < stationary_thresh:
        return np.full(n, np.mean(segment))

    abs_vel = np.abs(velocity)
    mean_vel = np.mean(abs_vel)
    vel_std = np.std(abs_vel)
    if mean_vel > 0.001 and vel_std < mean_vel * 0.8:
        return np.linspace(segment[0], segment[-1], n)

    # Stage 3: complex — deadzone EMA
    deadzone = 0.06 if heavy else 0.04
    alpha = 0.01 if heavy else 0.02
    smoothed = np.empty(n)
    smoothed[0] = segment[0]
    for i in range(1, n):
        delta = segment[i] - smoothed[i - 1]
        if abs(delta) < deadzone:
            smoothed[i] = smoothed[i - 1]
        else:
            smoothed[i] = smoothed[i - 1] + alpha * delta
    return smoothed


def _sharpen(img, strength=1.0):
    """Unsharp mask: sharpen upscaled frames to restore perceived detail."""
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    return cv2.addWeighted(img, 1.0 + strength, blurred, -strength, 0)


def _render_adaptive(video_path, output_path, face_cx_smooth, face_cy_smooth,
                     mode_per_frame, scene_face_crop_w, screen_x_per_frame,
                     scenes, src_w, src_h, fps, total):
    """Render: split-screen for screen-share, single face crop for talking-head."""
    frame_bytes = src_w * src_h * 3

    screen_crop_h = src_h
    screen_crop_w = int(screen_crop_h * SCREEN_ASPECT)
    screen_crop_w = min(screen_crop_w, src_w)

    # Compute talking-head crop from actual source dimensions (9:16 aspect)
    th_crop_h = src_h
    th_crop_w = int(src_h * 9 / 16)
    if th_crop_w > src_w:
        th_crop_w = src_w
        th_crop_h = int(src_w * 16 / 9)

    face_crop_w_per_frame = np.empty(total)
    for (s_start, s_end), crop_w in zip(scenes, scene_face_crop_w):
        face_crop_w_per_frame[s_start:s_end + 1] = crop_w

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
        cx = face_cx_smooth[i]
        cy = face_cy_smooth[i]
        mode = mode_per_frame[i]

        if mode == 1:
            # TALKING-HEAD: 9:16 crop centered on face, using full source height
            face_x = int(cx * src_w - th_crop_w / 2)
            face_x = max(0, min(src_w - th_crop_w, face_x))
            face_y = int(cy * src_h - th_crop_h / 2)
            face_y = max(0, min(src_h - th_crop_h, face_y))
            face_crop = frame[face_y:face_y + th_crop_h, face_x:face_x + th_crop_w]
            resized = cv2.resize(face_crop, (OUT_W, OUT_H), interpolation=cv2.INTER_LANCZOS4)
            output_frame[:] = _sharpen(resized)
        else:
            # SCREEN-SHARE: split-screen
            # Top: wide screen, aligned opposite to face
            sx = int(screen_x_per_frame[i])
            sx = max(0, min(src_w - screen_crop_w, sx))
            screen_crop = frame[0:screen_crop_h, sx:sx + screen_crop_w]
            top_panel = cv2.resize(screen_crop, (OUT_W, PANEL_H), interpolation=cv2.INTER_LANCZOS4)
            top_panel = _sharpen(top_panel)

            # Bottom: tight face zoom (9:8 aspect, centered on face)
            fcw = max(100, int(face_crop_w_per_frame[i]))
            fch = max(100, int(fcw / PANEL_ASPECT))
            fcw = min(fcw, src_w)
            fch = min(fch, src_h)

            fx = int(cx * src_w - fcw / 2)
            fy = int(cy * src_h - fch / 2)
            fx = max(0, min(src_w - fcw, fx))
            fy = max(0, min(src_h - fch, fy))

            face_crop = frame[fy:fy + fch, fx:fx + fcw]
            if face_crop.size == 0:
                bottom_panel = np.zeros((PANEL_H, OUT_W, 3), dtype=np.uint8)
            else:
                bottom_panel = cv2.resize(face_crop, (OUT_W, PANEL_H), interpolation=cv2.INTER_LANCZOS4)
                bottom_panel = _sharpen(bottom_panel, strength=1.5)

            output_frame[0:PANEL_H] = top_panel
            output_frame[PANEL_H:OUT_H] = bottom_panel

        enc.stdin.write(output_frame.tobytes())
        frame_idx += 1

    enc.stdin.close()
    dec.wait()
    enc.wait()
    print(f"  [split-screen] Rendered {frame_idx} frames -> {output_path}")


def reframe(video_path, output_path):
    """Split-screen for screen-share scenes, single face crop for talking-head scenes."""
    print("[split-screen] Adaptive — split (screen-share) / single crop (talking-head)")
    net = init_detector()
    info = get_video_info(video_path)
    w, h, fps = info["width"], info["height"], info["fps"]

    raw_cx, raw_cy, raw_fw = _detect_faces_all(video_path, info, net)
    total = len(raw_cx)

    scenes = detect_scenes(video_path)
    scenes = [(s, min(e, total - 1)) for s, e in scenes if s < total]
    print(f"  [split-screen] {len(scenes)} scenes, {total} frames")

    face_cx_smooth = np.empty(total)
    face_cy_smooth = np.empty(total)
    screen_x_per_frame = np.zeros(total)
    mode_per_frame = np.zeros(total, dtype=np.int8)  # 0=screen-share (split), 1=talking-head
    scene_face_crop_w = []

    screen_crop_w = int(h * SCREEN_ASPECT)
    screen_crop_w = min(screen_crop_w, w)

    # First pass: classify each scene
    MIN_MODE_FRAMES = int(fps * 3.0)  # 3 seconds minimum before allowing mode switch
    scene_modes = []  # raw mode per scene: 0=screen-share, 1=talking-head
    scene_meta = []   # (avg_fw, avg_fw_px, avg_cx) per scene

    for s_start, s_end in scenes:
        seg_fw = raw_fw[s_start:s_end + 1]
        avg_fw = np.nanmean(seg_fw)
        avg_fw_px = avg_fw * w
        avg_cx = np.nanmean(raw_cx[s_start:s_end + 1])
        raw_mode = 1 if avg_fw > FW_THRESHOLD else 0
        scene_modes.append(raw_mode)
        scene_meta.append((avg_fw, avg_fw_px, avg_cx))

    # Second pass: global majority vote — if one mode dominates (>75% of frames),
    # force the entire clip to that mode to prevent spurious flips
    total_th_frames = sum(
        (s_end - s_start + 1) for (s_start, s_end), m in zip(scenes, scene_modes) if m == 1
    )
    majority_ratio = total_th_frames / total if total > 0 else 0.5
    if majority_ratio > 0.75:
        dominant_mode = 1
        print(f"  [split-screen] Majority vote: {majority_ratio:.0%} talking-head → forcing all scenes to talking-head")
        stable_modes = [1] * len(scene_modes)
    elif majority_ratio < 0.25:
        dominant_mode = 0
        print(f"  [split-screen] Majority vote: {1-majority_ratio:.0%} screen-share → forcing all scenes to screen-share")
        stable_modes = [0] * len(scene_modes)
    else:
        # Third pass: suppress short mode flips — short scenes inherit neighbor mode
        dominant_mode = None
        stable_modes = list(scene_modes)
        for idx in range(len(scenes)):
            s_start, s_end = scenes[idx]
            scene_len = s_end - s_start + 1
            if scene_len < MIN_MODE_FRAMES:
                if idx > 0:
                    stable_modes[idx] = stable_modes[idx - 1]
                elif idx + 1 < len(scenes):
                    stable_modes[idx] = scene_modes[idx + 1]

    # Final pass: apply stabilized modes
    for idx, (s_start, s_end) in enumerate(scenes):
        seg_cx = raw_cx[s_start:s_end + 1]
        seg_cy = raw_cy[s_start:s_end + 1]
        seg_fw = raw_fw[s_start:s_end + 1]
        avg_fw, avg_fw_px, avg_cx = scene_meta[idx]
        mode_val = stable_modes[idx]

        if mode_val == 1:
            mode = "talking-head"
            side = "-"
            mode_per_frame[s_start:s_end + 1] = 1
            crop_w = FACE_SINGLE_W
            face_cx_smooth[s_start:s_end + 1] = _classify_and_smooth(seg_cx, fps)
            face_cy_smooth[s_start:s_end + 1] = _classify_and_smooth(seg_cy, fps)
        else:
            mode = "screen-share"
            mode_per_frame[s_start:s_end + 1] = 0
            crop_w = max(FACE_CROP_MIN_W, int(avg_fw_px * FACE_ZOOM_MULT))
            crop_w = min(crop_w, w)
            face_cx_smooth[s_start:s_end + 1] = _classify_and_smooth(seg_cx, fps, heavy=True)
            face_cy_smooth[s_start:s_end + 1] = _classify_and_smooth(seg_cy, fps, heavy=True)

            if avg_cx > 0.5:
                screen_x_per_frame[s_start:s_end + 1] = 0
                side = "left"
            else:
                screen_x_per_frame[s_start:s_end + 1] = w - screen_crop_w
                side = "right"

        suppressed = " (suppressed)" if stable_modes[idx] != scene_modes[idx] else ""
        scene_face_crop_w.append(crop_w)
        print(f"  [split-screen] Scene {len(scene_face_crop_w)}: frames {s_start}-{s_end}, "
              f"avg_fw={avg_fw:.3f}, avg_cx={avg_cx:.2f}, mode={mode}{suppressed}"
              + (f", screen={side}" if mode == "screen-share" else ""))

    _render_adaptive(video_path, output_path, face_cx_smooth, face_cy_smooth,
                     mode_per_frame, scene_face_crop_w, screen_x_per_frame,
                     scenes, w, h, fps, total)
    print("[split-screen] Done.")

"""Cursor detection for screen recordings via motion analysis.

Detects cursor position by finding small, cursor-sized moving elements
between consecutive frames. Works on any screen recording without needing
to know the cursor style (arrow, hand, I-beam, etc.).

Face-aware mode: when face keyframes indicate a face is visible, cursor
detection is suppressed to avoid tracking hand gestures as cursors.

When the cursor is stationary, holds the last known position.
Uses exponential smoothing for stable, jitter-free tracking.
"""

import cv2
import numpy as np
from dataclasses import dataclass


@dataclass
class CursorPosition:
    """Detected cursor position for a single frame."""
    frame: int
    x: int  # Pixel x in source frame
    y: int  # Pixel y in source frame
    confidence: float  # 0-1
    detected: bool  # Whether cursor motion was actually detected this frame
    is_holding: bool = False  # Whether position is being held (cursor stationary)
    face_visible: bool = False  # Whether a face was detected this frame


def _find_cursor_candidates(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    min_area: int = 4,
    max_area: int = 3000,
    diff_threshold: int = 25,
) -> list[tuple[int, int, int, float]]:
    """Find small moving objects between two grayscale frames.

    Returns list of (x, y, area, score) candidates sorted by likelihood
    of being a cursor.
    """
    diff = cv2.absdiff(prev_gray, curr_gray)
    _, thresh = cv2.threshold(diff, diff_threshold, 255, cv2.THRESH_BINARY)

    # Dilate to connect nearby changed pixels (cursor + its shadow)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    thresh = cv2.dilate(thresh, kernel, iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if min_area <= area <= max_area:
            M = cv2.moments(c)
            if M["m00"] > 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
                # Score: prefer smaller, more compact shapes (cursor-like)
                x, y, w, h = cv2.boundingRect(c)
                aspect = min(w, h) / max(w, h) if max(w, h) > 0 else 0
                compactness = area / (w * h) if w * h > 0 else 0
                # Cursor is small and roughly square/compact
                score = aspect * compactness * (1.0 - area / max_area)
                candidates.append((cx, cy, area, score))

    candidates.sort(key=lambda c: c[3], reverse=True)
    return candidates


def _pick_best_candidate(
    candidates: list[tuple[int, int, int, float]],
    last_x: int | None,
    last_y: int | None,
    max_jump: int = 800,
) -> tuple[int, int, float] | None:
    """Pick the best cursor candidate, preferring proximity to last position."""
    if not candidates:
        return None

    if last_x is None or last_y is None:
        # No prior position — take highest-scored candidate
        cx, cy, _, score = candidates[0]
        return cx, cy, min(score * 2, 1.0)

    # Score candidates by shape quality + proximity to last position
    best = None
    best_combined = -1.0

    for cx, cy, area, shape_score in candidates:
        dist = np.sqrt((cx - last_x) ** 2 + (cy - last_y) ** 2)
        if dist > max_jump:
            continue  # Skip implausible jumps
        # Proximity score: closer = better, decays with distance
        proximity = np.exp(-dist / 300.0)
        combined = shape_score * 0.3 + proximity * 0.7
        if combined > best_combined:
            best_combined = combined
            best = (cx, cy, min(combined * 1.5, 1.0))

    return best


def _build_face_visibility_map(
    face_keyframes: list,
    total_frames: int,
    sample_rate: int,
    fps: float = 30.0,
) -> list[bool]:
    """Build per-frame face visibility from sampled keyframes.

    Uses a two-pass approach:
    1. Mark each face-detected keyframe with a wide window (±0.5s)
    2. Fill gaps shorter than 1.5s between face segments (face doesn't
       actually disappear that fast — it's just detection misses)

    This creates stable, contiguous face blocks that last long enough
    for smooth transitions to letterbox.
    """
    face_map = [False] * total_frames

    if not face_keyframes:
        return face_map

    # Pass 1: Mark wide windows around each face detection
    window = int(fps * 0.5)  # ±0.5s per detection
    for kf in face_keyframes:
        if kf.face_detected and kf.face_confidence > 0.4:
            start = max(0, kf.frame - window)
            end = min(total_frames, kf.frame + window + 1)
            for i in range(start, end):
                face_map[i] = True

    # Pass 2: Fill short gaps between face segments
    # If two face blocks are within 1.5s, merge them
    gap_fill = int(fps * 1.5)
    in_gap = False
    gap_start = 0
    for i in range(total_frames):
        if face_map[i]:
            if in_gap and (i - gap_start) <= gap_fill:
                for j in range(gap_start, i):
                    face_map[j] = True
            in_gap = False
        else:
            if not in_gap:
                gap_start = i
                in_gap = True

    # Pass 3: Enforce minimum segment duration (2 seconds).
    # Remove any face or non-face segment shorter than min_segment.
    # Short face segments get removed (set to False).
    # Short non-face gaps get filled (set to True).
    min_segment = int(fps * 2.0)

    # Remove short face segments
    seg_start = 0
    in_face = face_map[0]
    for i in range(1, total_frames):
        if face_map[i] != in_face:
            seg_len = i - seg_start
            if in_face and seg_len < min_segment:
                # Too short face segment — remove it
                for j in range(seg_start, i):
                    face_map[j] = False
            elif not in_face and seg_len < min_segment:
                # Too short gap — fill it
                for j in range(seg_start, i):
                    face_map[j] = True
            seg_start = i
            in_face = face_map[i]
    # Handle last segment
    seg_len = total_frames - seg_start
    if in_face and seg_len < min_segment:
        for j in range(seg_start, total_frames):
            face_map[j] = False
    elif not in_face and seg_len < min_segment:
        for j in range(seg_start, total_frames):
            face_map[j] = True

    return face_map


def detect_cursor_positions(
    video_path: str,
    sample_interval: int = 1,
    diff_threshold: int = 25,
    min_area: int = 4,
    max_area: int = 3000,
    hold_frames: int = 30,
    face_keyframes: list | None = None,
    face_sample_rate: int = 3,
    fps: float = 30.0,
) -> list[CursorPosition]:
    """Detect cursor position across all frames of a video.

    Uses frame differencing to find small moving objects (the cursor).
    When a face is visible (from face_keyframes), suppresses cursor
    detection to avoid tracking hand gestures.
    When no motion is detected, holds the last known position.

    Args:
        video_path: Path to the video file.
        sample_interval: Process every Nth frame (1 = every frame).
        diff_threshold: Pixel difference threshold for motion detection.
        min_area: Minimum contour area for cursor candidates.
        max_area: Maximum contour area for cursor candidates.
        hold_frames: How many frames to hold position after cursor stops moving.
        face_keyframes: CropKeyframe list from analyze(). When provided,
            cursor detection is suppressed during face-visible segments.
        face_sample_rate: Sample rate used for face detection keyframes.
        fps: Video FPS for face visibility window calculation.

    Returns:
        List of CursorPosition for every frame.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Build face visibility map from keyframes
    face_map = _build_face_visibility_map(
        face_keyframes or [], total, face_sample_rate, fps=fps,
    )
    face_frames = sum(face_map)
    if face_keyframes:
        print(f"  Face visible in {face_frames}/{total} frames "
              f"— cursor detection suppressed during face segments")

    positions: list[CursorPosition] = []
    prev_gray = None
    last_x: int | None = None
    last_y: int | None = None
    frames_since_detection = 0
    detections = 0

    # Scale down for faster processing if source is very large
    process_scale = 1.0
    if src_w > 1920:
        process_scale = 1920.0 / src_w

    print(f"  Cursor detection: {src_w}x{src_h}, {total} frames")
    if process_scale < 1.0:
        print(f"  Processing at {process_scale:.2f}x scale for speed")

    for frame_idx in range(total):
        ret, frame = cap.read()
        if not ret:
            for i in range(frame_idx, total):
                positions.append(CursorPosition(
                    frame=i,
                    x=last_x or src_w // 2,
                    y=last_y or src_h // 2,
                    confidence=0.0,
                    detected=False,
                    face_visible=face_map[i] if i < len(face_map) else False,
                ))
            break

        if frame_idx % sample_interval != 0 and sample_interval > 1:
            positions.append(CursorPosition(
                frame=frame_idx,
                x=last_x or src_w // 2,
                y=last_y or src_h // 2,
                confidence=0.0,
                detected=False,
                face_visible=face_map[frame_idx],
            ))
            continue

        # Downscale for processing
        if process_scale < 1.0:
            small = cv2.resize(frame, None, fx=process_scale, fy=process_scale,
                               interpolation=cv2.INTER_AREA)
        else:
            small = frame

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

        detected = False
        conf = 0.0
        is_face = face_map[frame_idx]

        # Only detect cursor when face is NOT visible
        if prev_gray is not None and not is_face:
            candidates = _find_cursor_candidates(
                prev_gray, gray,
                min_area=int(min_area * process_scale ** 2),
                max_area=int(max_area * process_scale ** 2),
                diff_threshold=diff_threshold,
            )

            scaled_last_x = int(last_x * process_scale) if last_x else None
            scaled_last_y = int(last_y * process_scale) if last_y else None

            result = _pick_best_candidate(
                candidates, scaled_last_x, scaled_last_y,
                max_jump=int(800 * process_scale),
            )

            if result is not None:
                cx, cy, conf = result
                last_x = int(cx / process_scale)
                last_y = int(cy / process_scale)
                detected = True
                detections += 1
                frames_since_detection = 0

        prev_gray = gray

        if not detected:
            frames_since_detection += 1

        pos_x = last_x if last_x is not None else src_w // 2
        pos_y = last_y if last_y is not None else src_h // 2

        if not detected and frames_since_detection > hold_frames:
            conf = 0.0

        positions.append(CursorPosition(
            frame=frame_idx,
            x=pos_x,
            y=pos_y,
            confidence=conf,
            detected=detected,
            face_visible=is_face,
        ))

        if frame_idx % max(1, total // 20) == 0 and frame_idx > 0:
            pct = int(frame_idx / total * 100)
            print(f"  Cursor detection: {pct}% ({frame_idx}/{total})", flush=True)

    cap.release()

    det_pct = (detections / total * 100) if total > 0 else 0
    print(f"  Cursor detected in {detections}/{total} frames ({det_pct:.1f}%)")

    return positions


def smooth_cursor_positions(
    positions: list[CursorPosition],
    alpha: float = 0.08,
    hold_threshold: int = 15,
    hold_radius: int = 40,
) -> list[CursorPosition]:
    """Smooth cursor positions with exponential moving average.

    Also applies hold behavior: when cursor hasn't moved much
    (within hold_radius) for hold_threshold frames, lock position
    to prevent jitter. Face-visible frames always hold position.

    Args:
        positions: Raw cursor positions.
        alpha: EMA smoothing factor (0-1, lower = smoother).
        hold_threshold: Frames of small movement before locking.
        hold_radius: Pixel radius considered "not moving".

    Returns:
        New list of smoothed CursorPosition objects.
    """
    if not positions:
        return []

    smoothed = []
    sx = float(positions[0].x)
    sy = float(positions[0].y)
    hold_count = 0
    hold_x, hold_y = positions[0].x, positions[0].y
    is_holding = False

    for pos in positions:
        # During face-visible segments, freeze position completely
        if pos.face_visible:
            hold_count += 1
            is_holding = True
            smoothed.append(CursorPosition(
                frame=pos.frame,
                x=hold_x,
                y=hold_y,
                confidence=0.0,
                detected=False,
                is_holding=True,
                face_visible=True,
            ))
            continue

        # EMA smoothing
        sx = alpha * pos.x + (1 - alpha) * sx
        sy = alpha * pos.y + (1 - alpha) * sy

        # Check if cursor is within hold radius
        dist = np.sqrt((sx - hold_x) ** 2 + (sy - hold_y) ** 2)
        if dist < hold_radius:
            hold_count += 1
        else:
            hold_count = 0
            hold_x, hold_y = int(sx), int(sy)

        if hold_count >= hold_threshold:
            is_holding = True
        elif dist > hold_radius * 2:
            is_holding = False
            hold_count = 0
            hold_x, hold_y = int(sx), int(sy)

        if is_holding:
            out_x, out_y = hold_x, hold_y
        else:
            out_x, out_y = int(sx), int(sy)

        smoothed.append(CursorPosition(
            frame=pos.frame,
            x=out_x,
            y=out_y,
            confidence=pos.confidence,
            detected=pos.detected,
            is_holding=is_holding,
            face_visible=False,
        ))

    return smoothed

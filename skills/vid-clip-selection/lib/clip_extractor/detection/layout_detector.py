"""Detect layout type per frame and group into segments for dynamic podcast reframing.

Classifies each analyzed frame as SPLIT_SCREEN (gallery/Zoom: 2+ small faces far apart)
or CLOSE_UP (studio: 1-2 large faces near center) based on face size and spatial spread.
Groups consecutive same-type frames into LayoutSegments.

Uses the `all_faces` DNN detection data already stored in CropKeyframe during analyze() —
no extra video scan required.
"""

import json
from collections import Counter
from dataclasses import dataclass
from enum import Enum

from ..crop.crop_path_io import CropKeyframe


class LayoutType(Enum):
    SPLIT_SCREEN = "split_screen"
    CLOSE_UP = "close_up"
    CONTENT_FOCUS = "content_focus"
    FACE_TRACK = "face_track"  # Used by hybrid mode: face-only segments get standard crop


@dataclass
class LayoutSegment:
    layout: LayoutType
    start_frame: int
    end_frame: int
    start_sec: float
    end_sec: float


def classify_frame(
    faces: list[dict],
    face_size_threshold: float = 0.06,
    spatial_spread_threshold: float = 0.15,
) -> LayoutType | None:
    """Classify a single frame's layout based on detected faces.

    Args:
        faces: List of face dicts with keys "x", "y", "w", "h", "conf".
        face_size_threshold: Faces below this normalized width = gallery/split.
        spatial_spread_threshold: Min horizontal distance between faces for split.

    Returns:
        LayoutType or None if insufficient data.
    """
    if not faces or len(faces) < 2:
        return None  # Can't classify with fewer than 2 faces

    # Filter low-confidence detections
    good_faces = [f for f in faces if f.get("conf", 0) > 0.3]
    if len(good_faces) < 2:
        return None

    # Primary signal: median face width
    widths = sorted([f["w"] for f in good_faces])
    median_width = widths[len(widths) // 2]

    # Secondary signal: max horizontal distance between face centers
    xs = [f["x"] for f in good_faces]
    max_h_distance = max(xs) - min(xs)

    # Classification
    if median_width < face_size_threshold and max_h_distance > spatial_spread_threshold:
        return LayoutType.SPLIT_SCREEN
    elif median_width >= face_size_threshold * 0.67 and max_h_distance < spatial_spread_threshold * 0.8:
        return LayoutType.CLOSE_UP
    else:
        # Scoring tiebreak: weight face size more heavily
        split_score = (1.0 if median_width < face_size_threshold else 0.0) * 0.5 + \
                      (1.0 if max_h_distance > spatial_spread_threshold else 0.0) * 0.3 + \
                      (1.0 if len(good_faces) >= 2 else 0.0) * 0.2
        return LayoutType.SPLIT_SCREEN if split_score > 0.5 else LayoutType.CLOSE_UP


def classify_frame_extended(
    faces: list[dict],
    keyframe,
    content_focus_cfg: dict,
    face_size_threshold: float = 0.06,
    spatial_spread_threshold: float = 0.15,
) -> LayoutType | None:
    """Extended classifier that adds CONTENT_FOCUS detection.

    CONTENT_FOCUS triggers when a face is present but small and the saliency
    point diverges significantly from the face position — indicating that
    screen content is the primary visual subject, not the speaker.

    Args:
        faces: List of face dicts with keys "x", "y", "w", "h", "conf".
        keyframe: CropKeyframe with saliency data.
        content_focus_cfg: Config dict for content_focus.
        face_size_threshold: Threshold for split-screen classification.
        spatial_spread_threshold: Threshold for split-screen classification.

    Returns:
        LayoutType or None if insufficient data.
    """
    import math

    face_max_width = content_focus_cfg.get("face_max_width", 0.15)
    divergence_threshold = content_focus_cfg.get("divergence_threshold", 0.20)

    # Check for content-focus: face present but small + saliency diverging
    if faces and keyframe.saliency_detected:
        good_faces = [f for f in faces if f.get("conf", 0) > 0.3]
        if good_faces:
            largest_face_w = max(f["w"] for f in good_faces)
            if largest_face_w < face_max_width:
                # Face is small — check saliency divergence
                face_cx = good_faces[0]["x"]
                face_cy = good_faces[0]["y"]
                dist = math.hypot(
                    face_cx - keyframe.saliency_center_x,
                    face_cy - keyframe.saliency_center_y,
                )
                if dist >= divergence_threshold:
                    return LayoutType.CONTENT_FOCUS

    # Fall back to standard classification
    return classify_frame(faces, face_size_threshold, spatial_spread_threshold)


def classify_frame_hybrid(
    keyframe,
    content_focus_cfg: dict,
) -> LayoutType:
    """Classify a frame for hybrid mode: FACE_TRACK or SPLIT_SCREEN.

    Hybrid mode switches between face-tracking (when the speaker is the focus)
    and split-screen (when screen content is the focus). Uses saliency divergence
    from face position to detect screen-share segments.

    Args:
        keyframe: CropKeyframe with face and saliency data.
        content_focus_cfg: Config dict for thresholds.

    Returns:
        FACE_TRACK or SPLIT_SCREEN.
    """
    import math

    divergence_threshold = content_focus_cfg.get("divergence_threshold", 0.20)
    face_max_width = content_focus_cfg.get("face_max_width", 0.15)

    # If saliency is detected and diverges from face, it's a screen-share segment
    if keyframe.face_detected and keyframe.saliency_detected:
        dist = math.hypot(
            keyframe.face_center_x - keyframe.saliency_center_x,
            keyframe.face_center_y - keyframe.saliency_center_y,
        )
        if dist >= divergence_threshold:
            return LayoutType.SPLIT_SCREEN

    # If face is detected but very small, likely screen-share with webcam overlay
    if keyframe.face_detected:
        # Use all_faces if available for width check
        if keyframe.all_faces:
            try:
                import json
                faces = json.loads(keyframe.all_faces)
                if faces:
                    largest_w = max(f["w"] for f in faces)
                    if largest_w < face_max_width:
                        return LayoutType.SPLIT_SCREEN
            except (json.JSONDecodeError, TypeError):
                pass

    return LayoutType.FACE_TRACK


def detect_hybrid_segments(
    keyframes: list,
    fps: float,
    config: dict | None = None,
    content_focus_cfg: dict | None = None,
) -> list[LayoutSegment]:
    """Detect layout segments for hybrid mode.

    Returns segments classified as either FACE_TRACK or SPLIT_SCREEN.
    Face-track segments get standard crop rendering, split-screen segments
    get the split layout with content on top and face on bottom.

    Args:
        keyframes: List of CropKeyframe from analyze().
        fps: Source video FPS.
        config: Optional dynamic_layout config dict.
        content_focus_cfg: Content focus thresholds.

    Returns:
        List of LayoutSegment.
    """
    if config is None:
        config = {}
    if content_focus_cfg is None:
        content_focus_cfg = {}

    min_segment_duration = content_focus_cfg.get("min_segment_duration", 3.0)
    smoothing_window = config.get("smoothing_window", 25)

    # Step 1: Classify each keyframe
    classifications: list[LayoutType | None] = []
    for kf in keyframes:
        layout = classify_frame_hybrid(kf, content_focus_cfg)
        classifications.append(layout)

    # Step 2: Hysteresis to prevent oscillation
    hysteresis_cfg = config.get("hysteresis", {})
    if hysteresis_cfg.get("enabled", True):
        enter_streak = hysteresis_cfg.get("enter_streak", 5)
        classifications = _hysteresis_filter(classifications, enter_streak)

    # Step 3: Majority-vote smoothing
    smoothed = _majority_vote_smooth(classifications, smoothing_window)

    # Step 4: Group into segments
    raw_segments: list[LayoutSegment] = []
    current_layout = None
    seg_start_idx = 0

    for i, layout in enumerate(smoothed):
        if layout is None:
            continue
        if current_layout is None:
            current_layout = layout
            seg_start_idx = i
        if layout != current_layout:
            raw_segments.append(LayoutSegment(
                layout=current_layout,
                start_frame=keyframes[seg_start_idx].frame,
                end_frame=keyframes[i - 1].frame,
                start_sec=keyframes[seg_start_idx].time_sec,
                end_sec=keyframes[i - 1].time_sec,
            ))
            current_layout = layout
            seg_start_idx = i

    if current_layout is not None and keyframes:
        raw_segments.append(LayoutSegment(
            layout=current_layout,
            start_frame=keyframes[seg_start_idx].frame,
            end_frame=keyframes[-1].frame,
            start_sec=keyframes[seg_start_idx].time_sec,
            end_sec=keyframes[-1].time_sec,
        ))

    if not raw_segments:
        return []

    # Step 5: Merge short segments
    min_frames = int(min_segment_duration * fps)
    merged: list[LayoutSegment] = [raw_segments[0]]
    for seg in raw_segments[1:]:
        duration_frames = seg.end_frame - seg.start_frame
        if duration_frames < min_frames:
            merged[-1] = LayoutSegment(
                layout=merged[-1].layout,
                start_frame=merged[-1].start_frame,
                end_frame=seg.end_frame,
                start_sec=merged[-1].start_sec,
                end_sec=seg.end_sec,
            )
        else:
            merged.append(seg)

    return merged


def _hysteresis_filter(
    classifications: list[LayoutType | None],
    enter_streak: int = 5,
) -> list[LayoutType | None]:
    """Apply hysteresis to prevent oscillation at layout boundaries.

    Once in a layout state, require `enter_streak` consecutive frames of the
    opposite classification before switching. This eliminates rapid toggling
    when the detector is uncertain at transition points.
    """
    if not classifications:
        return classifications

    filtered = list(classifications)
    current_state: LayoutType | None = None
    streak = 0
    pending: LayoutType | None = None

    for i, cls in enumerate(classifications):
        if cls is None:
            filtered[i] = current_state
            continue

        if current_state is None:
            current_state = cls
            filtered[i] = cls
            continue

        if cls == current_state:
            streak = 0
            pending = None
            filtered[i] = current_state
        else:
            if pending == cls:
                streak += 1
            else:
                pending = cls
                streak = 1

            if streak >= enter_streak:
                current_state = cls
                filtered[i] = cls
                streak = 0
                pending = None
            else:
                filtered[i] = current_state

    return filtered


def _majority_vote_smooth(
    classifications: list[LayoutType | None],
    window: int = 15,
) -> list[LayoutType | None]:
    """Apply majority-vote smoothing to eliminate single-frame classification noise."""
    n = len(classifications)
    smoothed = list(classifications)
    half = window // 2

    for i in range(n):
        start = max(0, i - half)
        end = min(n, i + half + 1)
        votes = [c for c in classifications[start:end] if c is not None]
        if votes:
            counter = Counter(votes)
            smoothed[i] = counter.most_common(1)[0][0]

    return smoothed


def detect_segments(
    keyframes: list[CropKeyframe],
    fps: float,
    config: dict | None = None,
    content_focus_cfg: dict | None = None,
) -> list[LayoutSegment]:
    """Detect layout segments from analyzed keyframes.

    Args:
        keyframes: List of CropKeyframe from analyze().
        fps: Source video FPS.
        config: Optional dynamic_layout config dict.
        content_focus_cfg: Optional content_focus config dict.

    Returns:
        List of LayoutSegment sorted by start_frame.
    """
    if config is None:
        config = {}

    face_size_threshold = config.get("face_size_threshold", 0.06)
    spatial_spread_threshold = config.get("spatial_spread_threshold", 0.15)
    min_segment_duration = config.get("min_segment_duration", 1.0)
    smoothing_window = config.get("smoothing_window", 15)

    use_content_focus = (
        content_focus_cfg is not None
        and content_focus_cfg.get("enabled", False)
    )
    # Override min_segment_duration for content-focus if configured
    if use_content_focus:
        cf_min_dur = content_focus_cfg.get("min_segment_duration", 3.0)
        min_segment_duration = max(min_segment_duration, cf_min_dur)

    # Step 1: Classify each keyframe
    classifications: list[LayoutType | None] = []
    for kf in keyframes:
        if not kf.all_faces:
            classifications.append(None)
            continue
        try:
            faces = json.loads(kf.all_faces)
        except (json.JSONDecodeError, TypeError):
            classifications.append(None)
            continue

        if use_content_focus:
            layout = classify_frame_extended(
                faces, kf, content_focus_cfg,
                face_size_threshold, spatial_spread_threshold,
            )
        else:
            layout = classify_frame(faces, face_size_threshold, spatial_spread_threshold)
        classifications.append(layout)

    # Step 1.5: Hysteresis filter (before smoothing to eliminate oscillation)
    hysteresis_cfg = config.get("hysteresis", {})
    if hysteresis_cfg.get("enabled", True):
        enter_streak = hysteresis_cfg.get("enter_streak", 5)
        classifications = _hysteresis_filter(classifications, enter_streak)

    # Step 2: Majority-vote smoothing
    smoothed = _majority_vote_smooth(classifications, smoothing_window)

    # Step 3: Group consecutive same-type frames into segments
    raw_segments: list[LayoutSegment] = []
    current_layout = None
    seg_start_idx = 0

    for i, layout in enumerate(smoothed):
        if layout is None:
            continue

        if current_layout is None:
            current_layout = layout
            seg_start_idx = i

        if layout != current_layout:
            # Close current segment
            raw_segments.append(LayoutSegment(
                layout=current_layout,
                start_frame=keyframes[seg_start_idx].frame,
                end_frame=keyframes[i - 1].frame,
                start_sec=keyframes[seg_start_idx].time_sec,
                end_sec=keyframes[i - 1].time_sec,
            ))
            current_layout = layout
            seg_start_idx = i

    # Close final segment
    if current_layout is not None and keyframes:
        raw_segments.append(LayoutSegment(
            layout=current_layout,
            start_frame=keyframes[seg_start_idx].frame,
            end_frame=keyframes[-1].frame,
            start_sec=keyframes[seg_start_idx].time_sec,
            end_sec=keyframes[-1].time_sec,
        ))

    if not raw_segments:
        return []

    # Step 4: Merge short segments into neighbors
    min_frames = int(min_segment_duration * fps)
    merged: list[LayoutSegment] = [raw_segments[0]]

    for seg in raw_segments[1:]:
        duration_frames = seg.end_frame - seg.start_frame
        if duration_frames < min_frames:
            # Merge into previous segment
            merged[-1] = LayoutSegment(
                layout=merged[-1].layout,
                start_frame=merged[-1].start_frame,
                end_frame=seg.end_frame,
                start_sec=merged[-1].start_sec,
                end_sec=seg.end_sec,
            )
        else:
            merged.append(seg)

    return merged

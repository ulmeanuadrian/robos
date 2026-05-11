"""Signal fusion — weighted merge of face, pose, and saliency detections.

Combines multiple detection signals into a single (x, y) crop target.
Gracefully handles missing signals by re-normalizing weights.

SignalFuser adds stateful content-priority: when the face is stable and
saliency diverges, it smoothly ramps saliency weight up so the crop
follows screen content instead of the speaker's head.
"""

import math
from collections import deque
from typing import Optional

from .detector_base import BoundingBox


def fuse_signals(
    face: Optional[BoundingBox],
    pose: Optional[BoundingBox],
    saliency: Optional[BoundingBox],
    weights: dict,
    last_known: tuple[float, float] = (0.5, 0.5),
) -> tuple[float, float, float]:
    """Fuse multiple detection signals into a single crop target.

    Uses weighted average of available signals. Re-normalizes weights when
    some detectors return None.

    Args:
        face: Face detection result (highest priority).
        pose: Pose estimation result (body center).
        saliency: Saliency detection result (visual focus point).
        weights: Config dict with face_weight, pose_weight, saliency_weight.
        last_known: Fallback (x, y) if all detectors return None.

    Returns:
        Tuple of (x, y, confidence) where x, y are normalized 0-1.
    """
    face_w = weights.get("face_weight", 0.6)
    pose_w = weights.get("pose_weight", 0.25)
    saliency_w = weights.get("saliency_weight", 0.15)

    # Collect available signals with their weights
    signals: list[tuple[float, float, float, float]] = []  # (x, y, confidence, weight)

    if face is not None:
        signals.append((face.x_center, face.y_center, face.confidence, face_w))
    if pose is not None:
        signals.append((pose.x_center, pose.y_center, pose.confidence, pose_w))
    if saliency is not None:
        signals.append((saliency.x_center, saliency.y_center, saliency.confidence, saliency_w))

    if not signals:
        return last_known[0], last_known[1], 0.0

    # Re-normalize weights so they sum to 1.0
    total_weight = sum(s[3] for s in signals)

    fused_x = sum(s[0] * s[3] for s in signals) / total_weight
    fused_y = sum(s[1] * s[3] for s in signals) / total_weight
    fused_conf = sum(s[2] * s[3] for s in signals) / total_weight

    return fused_x, fused_y, fused_conf


class SignalFuser:
    """Stateful signal fuser with content-priority weight shifting.

    When content_priority is enabled, detects when the face is stable
    (not moving) while saliency diverges from it, and smoothly ramps
    saliency weight up so the crop follows the screen content.
    """

    def __init__(self, weights: dict, content_priority: dict):
        self._base_face_w = weights.get("face_weight", 0.6)
        self._base_pose_w = weights.get("pose_weight", 0.25)
        self._base_saliency_w = weights.get("saliency_weight", 0.15)

        self._enabled = content_priority.get("enabled", False)
        self._stability_window = content_priority.get("face_stability_window", 15)
        self._stability_threshold = content_priority.get("face_stability_threshold", 0.03)
        self._divergence_threshold = content_priority.get("divergence_threshold", 0.15)
        self._max_saliency_w = content_priority.get("max_saliency_weight", 0.55)
        self._ramp_frames = content_priority.get("ramp_frames", 10)

        # State
        self._face_history: deque[tuple[float, float]] = deque(maxlen=self._stability_window)
        self._divergence_streak: int = 0
        self.content_priority_active: bool = False

    def reset(self):
        """Reset state on scene changes."""
        self._face_history.clear()
        self._divergence_streak = 0
        self.content_priority_active = False

    def fuse(
        self,
        face: Optional[BoundingBox],
        pose: Optional[BoundingBox],
        saliency: Optional[BoundingBox],
        last_known: tuple[float, float] = (0.5, 0.5),
    ) -> tuple[float, float, float]:
        """Fuse signals with optional content-priority weight shifting."""
        if not self._enabled:
            return fuse_signals(
                face, pose, saliency,
                {"face_weight": self._base_face_w, "pose_weight": self._base_pose_w,
                 "saliency_weight": self._base_saliency_w},
                last_known,
            )

        # Track face position history
        if face is not None:
            self._face_history.append((face.x_center, face.y_center))

        # Determine if face is stable
        face_stable = self._is_face_stable()

        # Determine if saliency diverges from face
        diverging = False
        if face is not None and saliency is not None:
            dist = math.hypot(
                face.x_center - saliency.x_center,
                face.y_center - saliency.y_center,
            )
            diverging = dist >= self._divergence_threshold

        # Update divergence streak
        if face_stable and diverging:
            self._divergence_streak = min(self._divergence_streak + 1, self._ramp_frames)
        else:
            self._divergence_streak = max(self._divergence_streak - 1, 0)

        # Compute ramp factor (0.0 to 1.0)
        ramp = self._divergence_streak / self._ramp_frames if self._ramp_frames > 0 else 0.0
        self.content_priority_active = ramp > 0.0

        # Shift weights: increase saliency, decrease face proportionally
        saliency_w = self._base_saliency_w + ramp * (self._max_saliency_w - self._base_saliency_w)
        weight_shift = saliency_w - self._base_saliency_w
        face_w = max(0.05, self._base_face_w - weight_shift)

        return fuse_signals(
            face, pose, saliency,
            {"face_weight": face_w, "pose_weight": self._base_pose_w,
             "saliency_weight": saliency_w},
            last_known,
        )

    def _is_face_stable(self) -> bool:
        """Check if face position has been stable over the history window."""
        if len(self._face_history) < max(2, self._stability_window // 2):
            return False

        positions = list(self._face_history)
        xs = [p[0] for p in positions]
        ys = [p[1] for p in positions]

        x_range = max(xs) - min(xs)
        y_range = max(ys) - min(ys)

        return x_range <= self._stability_threshold and y_range <= self._stability_threshold

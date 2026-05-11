"""FFmpeg pipe-based renderer: decode -> crop -> encode with audio."""

import subprocess
import numpy as np
import cv2


def render_reframed(video_path, output_path, crop_positions, crop_w, crop_h, src_w, src_h, fps):
    """Render a reframed video by cropping each frame at the given positions.

    Args:
        video_path: Source video path.
        output_path: Output MP4 path.
        crop_positions: List of (x, y) pixel positions per frame (top-left corner of crop).
        crop_w: Crop width in pixels.
        crop_h: Crop height in pixels.
        src_w: Source video width.
        src_h: Source video height.
        fps: Frame rate.
    """
    out_w, out_h = 1080, 1920
    frame_bytes = src_w * src_h * 3

    dec_cmd = [
        "ffmpeg", "-i", str(video_path),
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-v", "quiet", "-"
    ]
    dec = subprocess.Popen(dec_cmd, stdout=subprocess.PIPE)

    enc_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24",
        "-s", f"{out_w}x{out_h}", "-r", str(fps),
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
    total = len(crop_positions)

    while True:
        raw = dec.stdout.read(frame_bytes)
        if len(raw) < frame_bytes:
            break

        if frame_idx >= total:
            x, y = crop_positions[-1]
        else:
            x, y = crop_positions[frame_idx]

        x = max(0, min(src_w - crop_w, int(x)))
        y = max(0, min(src_h - crop_h, int(y)))

        frame = np.frombuffer(raw, dtype=np.uint8).reshape(src_h, src_w, 3)
        cropped = frame[y:y + crop_h, x:x + crop_w]
        resized = cv2.resize(cropped, (out_w, out_h), interpolation=cv2.INTER_AREA)
        enc.stdin.write(resized.tobytes())
        frame_idx += 1

    enc.stdin.close()
    dec.wait()
    enc.wait()
    print(f"  Rendered {frame_idx} frames -> {output_path}")

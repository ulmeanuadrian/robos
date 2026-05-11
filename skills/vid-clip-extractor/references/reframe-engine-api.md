# Reframe Engine API Reference

## Package: `.claude/skills/00-longform-to-shortform/skill-pack/tools/reframe/`

FFmpeg pipe-based reframing. Each layout module exposes a single `reframe(video_path, output_path)` function.

### CLI (`__main__.py`)

```bash
SYS_DIR=".claude/skills/00-longform-to-shortform/skill-pack"
PYTHONPATH="$SYS_DIR" python -m tools.reframe \
  --video INPUT.mp4 \
  --output OUTPUT.mp4 \
  --layout split-screen|cursor-track|face-track \
  [--start SEC] [--end SEC]
```

When `--start` and `--end` are provided, a stream-copy extract is performed first (saved as `raw.mp4` next to output), then the extracted clip is reframed.

### Split-Screen (`split_screen.py`)

```python
import sys; sys.path.insert(0, ".claude/skills/00-longform-to-shortform/skill-pack")
from tools.reframe.split_screen import reframe

reframe(video_path: str, output_path: str) -> None
```

Per-scene adaptive layout:
- **Screen-share scenes** (face_width <= 10%): top 50% = wide 9:8 screen crop (opposite side to face), bottom 50% = tight face zoom (3x face width, 9:8 aspect)
- **Talking-head scenes** (face_width > 10%): single 9:16 crop (810x1440), face-centered

Key parameters:
- `FW_THRESHOLD = 0.10` — face width threshold for scene classification
- `FACE_ZOOM_MULT = 3.5` — multiplier for bottom panel face crop width
- `FACE_CROP_MIN_W = 200` — minimum face crop width (pixels)
- `FACE_SINGLE_W/H` — talking-head crop computed dynamically from source dims (9:16 aspect, full height)

### Cursor-Track (`cursor_track.py`)

```python
from tools.reframe.cursor_track import reframe  # after sys.path insert above

reframe(video_path: str, output_path: str) -> None
```

Per-scene mode switching:
- **Screen-share scenes**: wide 9:8 crop centered vertically in 1080x1920 output (black bars top/bottom)
- **Talking-head scenes**: tight 9:16 crop (810x1440), face-centered

Key parameters:
- `FW_THRESHOLD = 0.10` — face width threshold
- `FACE_CROP_W = 810, FACE_CROP_H = 1440` — talking-head crop
- `SCREEN_ASPECT = 9/8` — screen crop aspect ratio

### Face-Track (`face_track.py`)

```python
from tools.reframe.face_track import reframe  # after sys.path insert above

reframe(video_path: str, output_path: str) -> None
```

Simple 9:16 crop (810x1440) that follows the face with motion-classified smoothing per scene.

### Face Detection (`detect.py`)

```python
from tools.reframe.detect import init_detector, detect_face  # after sys.path insert above

net = init_detector()  # Returns cv2.dnn.Net (ResNet-10 SSD Caffe)

result = detect_face(frame_bgr, net, min_conf=0.5)
# Returns (cx_norm, cy_norm, face_w_norm, face_h_norm, conf) or None
```

Model files in `.claude/skills/00-longform-to-shortform/skill-pack/tools/reframe/models/`:
- `deploy.prototxt`
- `res10_300x300_ssd_iter_140000.caffemodel`

### Scene Detection (`scene.py`)

```python
from tools.reframe.scene import detect_scenes, get_video_info  # after sys.path insert above

info = get_video_info(video_path)
# Returns {"width": int, "height": int, "fps": float, "total_frames": int}

scenes = detect_scenes(video_path, threshold=0.4)
# Returns [(start_frame, end_frame), ...] via HSV histogram comparison every 10th frame
```

### Smoothing (internal to each layout)

Motion-classified per scene:
1. **Stationary** (range < 0.05): snap all frames to mean
2. **Panning** (consistent velocity): linear interpolation
3. **Tracking** (variable): cubic spline at 2s control points + gaussian blur (sigma=20)

Split-screen uses `heavy=True` for bottom panel (wider stationary zone=0.10, sigma=60, 4s control points) since tight crops amplify micro-movements.

### Render (`render.py`)

```python
from tools.reframe.render import render_reframed  # after sys.path insert above

render_reframed(
    video_path: str,
    output_path: str,
    crop_positions: list[tuple[int, int]],  # (x, y) per frame
    crop_w: int,
    crop_h: int,
    src_w: int,
    src_h: int,
    fps: float,
) -> None
```

Used by face-track layout. Split-screen and cursor-track have custom renderers (they composite multiple crops per frame).

All renderers use the same FFmpeg pipe pattern:
- Decode: `ffmpeg -i INPUT -f rawvideo -pix_fmt bgr24 -`
- Encode: `ffmpeg -f rawvideo -pix_fmt bgr24 -s WxH -r FPS -i pipe:0 -i INPUT -map 0:v -map 1:a? -c:v libx264 -preset fast -crf 20 OUTPUT`

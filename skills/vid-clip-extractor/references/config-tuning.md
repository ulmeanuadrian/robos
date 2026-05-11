# Config Tuning

Parameters are constants in each layout module. Edit the source files directly to tune.

## Parameter Reference

### Face Detection (`detect.py`)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `min_conf` | 0.5 | Lower = detect more faces (incl. side profiles, partial occlusion) |

### Scene Detection (`scene.py`)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `threshold` | 0.4 | HSV histogram Bhattacharyya distance. Lower = more scene cuts detected |

### Split-Screen (`split_screen.py`)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `FW_THRESHOLD` | 0.10 | Face width > this = talking-head mode. Lower = more split-screen |
| `FACE_ZOOM_MULT` | 3.0 | Bottom panel face crop = face_width * this. Higher = wider shot |
| `FACE_CROP_MIN_W` | 300 | Minimum bottom panel crop width (px). Prevents extreme zoom on tiny faces |
| `FACE_SINGLE_W` | 810 | Talking-head crop width. 810/1440 = 9:16 from 1920x1080 source |
| `FACE_SINGLE_H` | 1440 | Talking-head crop height |
| Smoothing `sigma` | 10 (normal), 30 (heavy) | Gaussian blur sigma. Higher = smoother but more lag |
| Smoothing `stationary_thresh` | 0.03 (normal), 0.06 (heavy) | Face range below this = snap to mean |

### Cursor-Track (`cursor_track.py`)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `FW_THRESHOLD` | 0.10 | Same as split-screen |
| `FACE_CROP_W` | 810 | Talking-head crop width |
| `FACE_CROP_H` | 1440 | Talking-head crop height |
| `SCREEN_ASPECT` | 9/8 (1.125) | Screen crop aspect ratio |

### Encoding (all layouts)

| Parameter | Default | Effect |
|-----------|---------|--------|
| Preset | `fast` | Encoding speed. Reframed clips are intermediates — FFmpeg re-encodes during subtitle burn |
| CRF | 20 | Quality. 20 is adequate since FFmpeg re-encodes in Phase 7 |
| Pixel format | `yuv420p` | Standard compatibility |

## Performance

Expected render time per 90s clip at 30fps:
- Face detection: ~60-90s (every frame, full resolution)
- Render: ~30-45s
- Total: ~2-3 min per clip

Parallelise multiple clips to reduce wall-clock time.

# Annotation Styles Reference

Default visual styles for screenshot annotations. All values can be overridden in the annotation spec.

## Circle Number

- **Diameter:** 44px
- **Fill:** accent color (default `#D97757`)
- **Border:** 2px white stroke
- **Number:** white, bold, 22px
- **Drop shadow:** 2px offset, 4px blur, rgba(0,0,0,0.3)
- **Z-order:** 10 (renders on top)

## Highlight Box

- **Border:** 3px solid, accent color
- **Border radius:** 12px
- **Fill:** accent color at 10% opacity
- **Z-order:** 5 (renders behind circles)

## Coordinate System

All positions use **percentage-based coordinates** (0-100% of image dimensions):
- `x_pct`, `y_pct` — top-left corner (boxes) or center (circles)
- `width_pct`, `height_pct` — dimensions (boxes only)

## Position Clamping

Circle numbers are clamped to 5%-95% of image dimensions to prevent edge cropping.

## Accent Colors

| Name | Hex | Use case |
|------|-----|----------|
| Default warm | `#D97757` | General purpose |
| Blue | `#4A90D9` | Technical/UI callouts |
| Green | `#4CAF50` | Success/positive highlights |
| Red | `#E53935` | Error/warning highlights |

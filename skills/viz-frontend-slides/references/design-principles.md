# 20 Design Principles for Slide Generation

Research-backed rules with numeric thresholds. Every slide must pass all 20.
Sources: Tufte, Reynolds, Duarte, Williams, Refactoring UI, Muller-Brockmann, Mayer, WCAG 2.2.

## The 20 Rules

### 1. One Idea Per Slide
Maximum one headline (10 words or fewer) + at most one supporting body block. If you need a second headline, split the slide. [Reynolds; Duarte]

### 2. Glanceable in 3 Seconds
A viewer must extract the slide's single message in 3 seconds or less. If it takes longer, simplify or split. [Duarte; NN/g 3-second rule]

### 3. Maximum 7 Visual Chunks (Ideal 3-5)
Group with proximity so the brain perceives 3-5 chunks, not 9 atoms. [Miller 1956; Cowan 2001 revision: working memory approximately 4]

### 4. 40% Minimum Whitespace
Of the slide's pixel area, at least 40% must be empty (background only). Hero/title slides: at least 60%. [Refactoring UI; Presentation Zen]

### 5. 5% Edge Safe-Zone
On 1920x1080 that is at least 96px from any edge. No text, logos, or focal elements inside that band. [Broadcast title-safe convention; Apple HIG margin logic]

### 6. Modular Type Scale
Pick one ratio (1.25, 1.333, 1.414, 1.5, or 1.618). Derive every size from it. Never use ad-hoc sizes. [Tschichold; Bringhurst; Modular Scale by Tim Brown]

### 7. Maximum 4 Type Sizes Per Slide
Display, subhead, body, caption — done. Maximum 6 across the entire deck. [Refactoring UI; Muller-Brockmann]

### 8. Minimum Font Sizes
Body at least 24px on screen, at least 28pt for projection. Title at least 48px. Caption floor 18px. [Reynolds; Duarte]

### 9. Line Height
1.4-1.6 for body text. 1.05-1.2 for display type. [Butterick; Bringhurst]

### 10. Line Length Max 60 Characters
Slides should not have paragraphs anyway. [Bringhurst]

### 11. WCAG Contrast
At least 4.5:1 for body text, at least 3:1 for large text. Aim for 7:1 (AAA) for projector resilience. [WCAG 2.2]

### 12. 60-30-10 Colour Split
60% dominant (usually background), 30% secondary, 10% accent. [Itten; Refactoring UI]

### 13. One Accent Per Slide
Multiple accents = no accent. Use it for the single thing you want eyes drawn to. [Tufte]

### 14. Never Encode Meaning by Hue Alone
Pair colour with shape, weight, label, or icon. [WCAG 1.4.1]

### 15. 8pt Grid
All spacing values from: 8, 16, 24, 32, 48, 64, 96, 128. Never 13. Never 27. [Bryn Jackson; Material Design]

### 16. Single Grid Alignment
12-column grid with 24-32px gutters. All elements snap. [Muller-Brockmann]

### 17. Proximity
Related items within 16px of each other. Unrelated items at least 48px apart. [Gestalt; Williams CRAP principles]

### 18. Data-Ink Ratio 80%+
On charts: no 3D, no gradients, no chartjunk. Strip to the data. [Tufte 1983]

### 19. F-Pattern Layout
Headlines + key visuals in the top-left band. First 200px vertical = primary attention zone. [NN/g eye-tracking studies]

### 20. One Mode Per Deck
Presenter mode (sparse, 15 words or fewer per slide) OR document mode (denser, hierarchical). Pick one and stay in it. Never mix. [Tufte vs Reynolds]

## Pre-Emit Checklist

Before saving any HTML deck, verify:

- [ ] #1: Each slide has one idea only
- [ ] #2: Each slide is glanceable in 3 seconds
- [ ] #3: Max 7 chunks per slide, ideal 3-5
- [ ] #4: Whitespace at least 40%, hero at least 60%
- [ ] #5: 5% safe-zone on all edges
- [ ] #6: Type sizes on a modular scale
- [ ] #7: Max 4 type sizes per slide
- [ ] #8: Body at least 24px, title at least 48px
- [ ] #9: Line-height 1.4-1.6 body, 1.05-1.2 display
- [ ] #10: Line length max 60 characters
- [ ] #11: Contrast at least 4.5:1 body, aim 7:1
- [ ] #12: 60-30-10 colour split
- [ ] #13: One accent per slide
- [ ] #14: Meaning not by hue alone
- [ ] #15: 8pt grid spacing
- [ ] #16: All elements on one grid
- [ ] #17: Related within 16px, unrelated 48px+
- [ ] #18: Data-ink ratio 80%+ on charts
- [ ] #19: F-pattern: headline top-left
- [ ] #20: One mode, consistent throughout

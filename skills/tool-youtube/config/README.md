# config/

`sources.md` — YouTube channel handles used as inspiration sources.

## Format

```markdown
# Inspiration Sources

## YouTube Channels

- @channel-handle
- @another-channel
```

One handle per line, prefixed with `- @`. `digest.py` reads this file automatically when `--channels` is not passed on the command line. Channel IDs (`UCxxxxxxxxxxxxxxxxxxxxxxxx`) are also supported.

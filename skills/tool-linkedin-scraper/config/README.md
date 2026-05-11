# config/

`sources.md` — LinkedIn profile URLs used as inspiration sources.

## Format

```markdown
# Inspiration Sources

## LinkedIn Profiles

- https://www.linkedin.com/in/profile-slug/
- https://www.linkedin.com/in/another-profile/
```

One URL per line, prefixed with `- `. `scrape.py` reads this file automatically when `--profiles` is not passed on the command line.

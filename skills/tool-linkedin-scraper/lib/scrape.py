#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "requests>=2.28.0",
# ]
# ///
import sys
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
"""
LinkedIn Scraper: fetch recent posts from LinkedIn profiles via Apify.

Usage:
    uv run scrape.py --profiles "https://linkedin.com/in/profile-1/" --max-posts 5
    uv run scrape.py --profiles "https://linkedin.com/in/p1/,https://linkedin.com/in/p2/" --days 7 --seen-file cron/status/linkedin-inspiration-seen.txt
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path


APIFY_ACTOR = "harvestapi~linkedin-profile-posts"
APIFY_URL = f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/run-sync-get-dataset-items"


# ── Seen file ────────────────────────────────────────────────────────────

def load_seen(path: str | None) -> set[str]:
    if not path:
        return set()
    p = Path(path)
    if not p.exists():
        return set()
    return set(line.strip() for line in p.read_text().splitlines() if line.strip())


def save_seen(path: str, seen: set[str]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(sorted(seen)) + "\n")


# ── Post ID ──────────────────────────────────────────────────────────────

def post_id(post: dict) -> str:
    """Derive a stable unique ID from a post. Prefer activityUrn, fall back to URL hash."""
    urn = post.get("activityUrn") or post.get("urn") or post.get("id")
    if urn:
        return str(urn)
    url = post.get("url") or post.get("postUrl") or ""
    return hashlib.md5(url.encode()).hexdigest()[:16]


# ── Apify call ───────────────────────────────────────────────────────────

def days_to_posted_limit(days: int) -> str:
    """Convert days integer to Apify postedLimit enum value."""
    if days <= 1:
        return "24h"
    elif days <= 7:
        return "week"
    elif days <= 30:
        return "month"
    else:
        return "any"


def scrape_profile(profile_url: str, max_posts: int, days: int, api_key: str) -> list[dict]:
    """Call Apify and return raw posts for a single profile."""
    import requests

    body = {
        "targetUrls": [profile_url],
        "maxPosts": max_posts,
        "postedLimit": days_to_posted_limit(days),
        "includeQuotePosts": False,
        "includeReposts": False,
        "scrapeReactions": False,
        "scrapeComments": False,
    }

    try:
        resp = requests.post(
            APIFY_URL,
            params={"token": api_key},
            json=body,
            timeout=90,
        )
    except requests.Timeout:
        print(f"  [warn] Apify timeout for {profile_url} — skipping", file=sys.stderr)
        return []

    if resp.status_code not in (200, 201):
        print(f"  [warn] Apify error {resp.status_code} for {profile_url}: {resp.text[:200]}", file=sys.stderr)
        return []

    try:
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception:
        print(f"  [warn] Could not parse Apify response for {profile_url}", file=sys.stderr)
        return []


# ── Formatting ───────────────────────────────────────────────────────────

def slugify(text: str, max_len: int = 50) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text[:max_len]


def parse_date(post: dict) -> str:
    """Extract posted date as YYYY-MM-DD string."""
    for key in ("postedAt", "date", "publishedAt", "createdAt"):
        raw = post.get(key)
        if raw:
            try:
                if isinstance(raw, (int, float)):
                    dt = datetime.fromtimestamp(raw / 1000 if raw > 1e10 else raw, tz=timezone.utc)
                else:
                    raw_str = str(raw).replace("Z", "+00:00")
                    dt = datetime.fromisoformat(raw_str)
                return dt.strftime("%Y-%m-%d")
            except Exception:
                pass
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def format_post(post: dict) -> tuple[str, str]:
    """Return (slug, markdown_with_frontmatter) for a post."""
    author = post.get("authorName") or post.get("author", {}).get("name") or "unknown"
    url = post.get("url") or post.get("postUrl") or ""
    posted_at = parse_date(post)
    likes = post.get("likesCount") or post.get("reactions") or 0
    text = post.get("text") or post.get("content") or ""

    slug = f"{posted_at}-{slugify(author)}"

    frontmatter = (
        f"---\n"
        f"source_type: linkedin\n"
        f"author: \"{author}\"\n"
        f"source_url: \"{url}\"\n"
        f"posted_at: \"{posted_at}\"\n"
        f"likes: {likes}\n"
        f"---\n\n"
    )

    return slug, frontmatter + text


# ── Main ─────────────────────────────────────────────────────────────────

def load_profiles_from_config() -> list[str]:
    """Read LinkedIn profile URLs from this tool's config/sources.md.

    Users populate the file once instead of passing --profiles every run.
    """
    config_path = Path(__file__).parent.parent / "config" / "sources.md"
    if not config_path.exists():
        return []
    profiles = []
    for line in config_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("- ") and "linkedin.com" in line:
            profiles.append(line[2:].strip())
    return profiles


def main():
    parser = argparse.ArgumentParser(description="LinkedIn Scraper via Apify")
    parser.add_argument("--profiles", help="Comma-separated LinkedIn profile URLs (default: read from config/sources.md)")
    parser.add_argument("--max-posts", type=int, default=5, help="Max posts per profile (default: 5)")
    parser.add_argument("--days", type=int, default=7, help="Lookback window in days (default: 7)")
    parser.add_argument("--seen-file", help="Path to seen-posts tracking file")
    parser.add_argument("--api-key", help="Apify API key (overrides APIFY_API_KEY env var)")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("APIFY_API_KEY")
    if not api_key:
        print("Error: No Apify API key provided.", file=sys.stderr)
        print("Please either:", file=sys.stderr)
        print("  1. Provide --api-key argument", file=sys.stderr)
        print("  2. Set APIFY_API_KEY environment variable", file=sys.stderr)
        print("Get a key at https://apify.com (free tier: 2,500 scrapes)", file=sys.stderr)
        sys.exit(1)

    if args.profiles:
        profiles = [p.strip() for p in args.profiles.split(",") if p.strip()]
    else:
        profiles = load_profiles_from_config()

    if not profiles:
        print("Error: No LinkedIn profiles provided.", file=sys.stderr)
        print("Either pass --profiles or add URLs to config/sources.md", file=sys.stderr)
        sys.exit(1)
    seen = load_seen(args.seen_file)
    new_posts: list[tuple[str, str, str]] = []  # (id, slug, markdown)

    for profile_url in profiles:
        print(f"  Scraping {profile_url}...", file=sys.stderr)
        posts = scrape_profile(profile_url, args.max_posts, args.days, api_key)
        print(f"  {profile_url}: {len(posts)} posts returned", file=sys.stderr)

        for post in posts:
            pid = post_id(post)
            if pid in seen:
                continue
            slug, markdown = format_post(post)
            new_posts.append((pid, slug, markdown))

    # Filter duplicates within this run
    seen_this_run: set[str] = set()
    unique: list[tuple[str, str, str]] = []
    for pid, slug, markdown in new_posts:
        if pid not in seen_this_run:
            seen_this_run.add(pid)
            unique.append((pid, slug, markdown))

    print(f"  New posts: {len(unique)}", file=sys.stderr)

    if not unique:
        sys.exit(0)

    # Output each post as a separate fenced block so the calling process can parse them
    for pid, slug, markdown in unique:
        print(f"<!-- post:{slug} -->")
        print(markdown)
        print(f"<!-- /post:{slug} -->")
        print()

    # Update seen file only after all output succeeds
    if args.seen_file:
        for pid, _, _ in unique:
            seen.add(pid)
        save_seen(args.seen_file, seen)


if __name__ == "__main__":
    main()

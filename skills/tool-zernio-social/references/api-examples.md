# Zernio API Examples

## YouTube with Full Features (title, tags, firstComment)

```bash
curl -s -X POST "https://getlate.dev/api/v1/posts" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "[DESCRIPTION]",
    "mediaItems": [{"url": "[VIDEO_URL]", "type": "video"}],
    "platforms": [{
      "platform": "youtube",
      "accountId": "$YT_ACCOUNT_ID",
      "platformSpecificData": {
        "title": "[VIDEO_TITLE]",
        "visibility": "public",
        "tags": "tag1, tag2, tag3",
        "firstComment": "[FIRST_COMMENT_CTA]"
      }
    }],
    "publishNow": true
  }'
```

## LinkedIn

```bash
curl -s -X POST "https://getlate.dev/api/v1/posts" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "[POST_CONTENT]",
    "platforms": [{
      "platform": "linkedin",
      "accountId": "$LI_ACCOUNT_ID"
    }],
    "publishNow": true
  }'
```

## MCP Tools (Simple Posts)

```
mcp__zernio__posts_create with:
- content: [POST_CONTENT]
- platform: youtube / linkedin / twitter
- title: [TITLE] (for YouTube)
- media_urls: [URL] (comma-separated)
- publish_now: true / is_draft: true / schedule_minutes: X
```

---

## Media Upload

### Option 1: Already have URL
Use the URL directly in `media_urls` or `mediaItems`.

### Option 2: Need to upload file

1. Get presigned URL:
```bash
curl -s -X POST "https://getlate.dev/api/v1/media/presign" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filename": "file.mp4", "contentType": "video/mp4"}'
```

2. Upload file to presigned URL:
```bash
curl -X PUT "[UPLOAD_URL]" \
  -H "Content-Type: video/mp4" \
  --upload-file "[FILE_PATH]"
```

3. Use the `publicUrl` from step 1 in your post.

---

## Twitter/X Threads (Multi-Tweet)

Use `threadItems` in `platformSpecificData`. The top-level `content` field is also required (use the first tweet's text).

```bash
curl -s -X POST "https://getlate.dev/api/v1/posts" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "FIRST_TWEET_TEXT",
    "platforms": [{
      "platform": "twitter",
      "accountId": "ACCOUNT_ID",
      "platformSpecificData": {
        "threadItems": [
          {"content": "FIRST_TWEET_TEXT"},
          {"content": "SECOND_TWEET_TEXT"}
        ]
      }
    }],
    "publishNow": true
  }'
```

## Threads (Meta) Multi-Post Threads

Same `threadItems` pattern. Top-level `content` required.

```bash
curl -s -X POST "https://getlate.dev/api/v1/posts" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "FIRST_POST_TEXT",
    "platforms": [{
      "platform": "threads",
      "accountId": "ACCOUNT_ID",
      "platformSpecificData": {
        "threadItems": [
          {"content": "FIRST_POST_TEXT"},
          {"content": "SECOND_POST_TEXT"},
          {"content": "THIRD_POST_TEXT"}
        ]
      }
    }],
    "publishNow": true
  }'
```

---

## Cross-Posting

Post same content to multiple platforms:

```bash
curl -s -X POST "https://getlate.dev/api/v1/posts" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "[POST_CONTENT]",
    "platforms": [
      {"platform": "linkedin", "accountId": "$LI_ACCOUNT_ID"},
      {"platform": "youtube", "accountId": "$YT_ACCOUNT_ID", "platformSpecificData": {"title": "[TITLE]"}}
    ],
    "publishNow": true
  }'
```

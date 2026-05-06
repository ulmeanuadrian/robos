---
name: research-trending
version: 2.0.0
category: research
description: "Research what's trending in last 30 days across Reddit, Twitter/X, HN, blogs, video. MapReduce: 5 source agents scan in parallel, a synthesizer merges + dedupes + extracts signals."
triggers:
  - "ce e trend"
  - "ce se discuta despre"
  - "trending in"
  - "ultimele 30 zile"
  - "dig into"
  - "ce e hot in"
  - "research"
  - "what's trending"
  - "pulse check on"
negative_triggers:
  - "voce de brand"
  - "pozitionare"
  - "competitor analysis"
  - "analiza competitori"
output_discipline: encapsulated
concurrency_pattern: mapreduce-research
context_loads:
  - brand/audience.md (synthesizer reads, for relevance filtering)
  - context/learnings.md (synthesizer appends)
inputs:
  - topic (required: niche, keyword, or industry)
  - timeframe (optional: defaults to 30 days)
  - focus (optional: pain points | opportunities | opinions | all)
outputs:
  - projects/research-trending/{date}-{slug}/brief.md
  - projects/research-trending/{date}-{slug}/sources.md
  - data/skill-telemetry.ndjson (appended)
secrets_required:
  - FIRECRAWL_API_KEY
secrets_optional:
  - OPENAI_API_KEY
  - XAI_API_KEY
  - YOUTUBE_API_KEY
---

# Output Discipline

In transcriptul vizibil userului apare DOAR:
1. Eventual o intrebare de clarificare la inceput (daca topic-ul e ambiguu).
2. Executive summary final (3-5 bullets) + path catre brief.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: scan Reddit", "Step 2: scan Twitter", etc.
- NU rula WebSearch/WebFetch direct din main thread — fiecare sursa primeste un agent dedicat.
- Cele 5 invocari `Agent` pentru surse TREBUIE SA FIE INTR-UN SINGUR mesaj de raspuns.

---

# Step 0: Scope (main thread, rapid)

Ia topic-ul user-ului. Daca e ambiguu (un cuvant generic, fara context), pune O singura intrebare de clarificare ("Vrei trending in industria X sau pentru audienta Y?") si asteapta raspunsul.

Construieste 5 query-uri care vor fi pasate agentilor:
- Base: `{topic}`
- Pain points: `{topic} problems frustrations 2026`
- Opinions: `{topic} unpopular opinion hot take`
- Trends: `{topic} 2026 trends new developments`
- Comparisons: `{topic} vs alternative`

Calculeaza slug pentru output dir: `{date}-{topic-slugified}`.

# Step 1: Concurrency check

```bash
node scripts/parallel-budget.js check 5 30
```

Returneaza `parallel` in conditii normale. Daca returneaza `serial` (override neasteptat), fallback: spawn UN SINGUR agent monolitic care face toate sursele secvential, apoi sari direct la Step 3.

Marcheaza `start_time = Date.now()`.

---

# Step 2: Spawn 5 source agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj de raspuns, 5 invocari `Agent` simultane.

## Agent REDDIT

```
subagent_type: general-purpose
description: "Research-trending: Reddit scan"
prompt: """
Scaneaza Reddit pentru trending pe topic: {topic}, timeframe: {timeframe}.

Ruleaza WebSearch queries:
- site:reddit.com {topic} (filter recent)
- site:reddit.com {topic} advice help
- site:reddit.com {topic} rant frustration

Pentru top 5-10 thread-uri relevante, foloseste WebFetch pentru a citi continut. Extrage:
- Title + subreddit + thread URL
- Top 3-5 comentarii (cu indicatori de engagement vizibili)
- Recurring complaints / praise (grupate)
- Intrebari repetate fara raspuns bun

Filtru de relevanta: ignora thread-uri pur off-topic sau spam.

Returneaza DOAR JSON:
{
  "source": "reddit",
  "status": "ok" | "partial" | "failed",
  "threads_count": N,
  "threads": [
    {"title":"...", "subreddit":"...", "url":"...", "engagement":"...", "key_points":["..."], "quotes":["..."]},
    ...
  ],
  "recurring_complaints": ["..."],
  "open_questions": ["..."],
  "notes": "scurt"
}
"""
```

## Agent TWITTER

```
subagent_type: general-purpose
description: "Research-trending: Twitter/X scan"
prompt: """
Scaneaza Twitter/X pentru trending pe topic: {topic}, timeframe: {timeframe}.

Ruleaza WebSearch queries:
- {topic} site:twitter.com OR site:x.com
- {topic} thread site:twitter.com OR site:x.com
- {topic} take site:twitter.com OR site:x.com

Pentru top tweet-uri / thread-uri, foloseste WebFetch unde e accesibil. Extrage:
- Tweet/thread text
- Engagement vizibil (likes, retweets, replies)
- Author handle si signal de autoritate
- Consensus opinions vs contrarian takes
- Influencer takes vs community takes

Returneaza DOAR JSON:
{
  "source": "twitter",
  "status": "ok" | "partial" | "failed",
  "items_count": N,
  "items": [
    {"text":"short excerpt", "author":"handle", "engagement":"...", "url":"...", "type":"tweet|thread", "stance":"consensus|contrarian"},
    ...
  ],
  "consensus_view": "...",
  "contrarian_takes": ["..."],
  "notes": "scurt"
}
"""
```

## Agent HN

```
subagent_type: general-purpose
description: "Research-trending: Hacker News + dev forums"
prompt: """
Scaneaza Hacker News si forumuri tech pentru trending pe topic: {topic}, timeframe: {timeframe}.

Ruleaza WebSearch queries:
- site:news.ycombinator.com {topic}
- {topic} site:lobste.rs OR site:dev.to OR site:hashnode.com

Pentru top discutii, foloseste WebFetch. Extrage:
- Submission title + score + comment count
- Top 3-5 comentarii cu most upvotes
- Themes care apar in discutii
- Tehnical details / data cited
- Sentiment general (positive / mixed / negative)

Returneaza DOAR JSON:
{
  "source": "hacker_news",
  "status": "ok" | "partial" | "failed",
  "discussions_count": N,
  "discussions": [
    {"title":"...", "url":"...", "score":N, "comment_count":N, "themes":["..."], "top_comments":["..."]},
    ...
  ],
  "data_points": ["specific stats / numbers cited"],
  "overall_sentiment": "positive|mixed|negative",
  "notes": "scurt"
}
"""
```

## Agent BLOGS

```
subagent_type: general-purpose
description: "Research-trending: Industry blogs + reports"
prompt: """
Scaneaza industry blogs, newsletters, reports pentru topic: {topic}, timeframe: {timeframe}.

Ruleaza WebSearch queries:
- {topic} blog post 2026
- {topic} analysis report 2026
- {topic} state of OR landscape OR trends report

Pentru top 5-8 articole, foloseste WebFetch. Extrage:
- Title, author/publication, date, URL
- Key thesis / argument
- Data citat (numbers, charts referentiate)
- Unique angle (ce e diferit fata de altele)

Returneaza DOAR JSON:
{
  "source": "industry_blogs",
  "status": "ok" | "partial" | "failed",
  "articles_count": N,
  "articles": [
    {"title":"...", "publication":"...", "author":"...", "url":"...", "thesis":"...", "data_cited":["..."], "unique_angle":"..."},
    ...
  ],
  "common_themes": ["..."],
  "notes": "scurt"
}
"""
```

## Agent VIDEO

```
subagent_type: general-purpose
description: "Research-trending: YouTube + video content"
prompt: """
Scaneaza YouTube si video content pentru topic: {topic}, timeframe: {timeframe}.

Ruleaza WebSearch queries:
- {topic} site:youtube.com 2026
- {topic} explained site:youtube.com
- {topic} review OR analysis site:youtube.com

Pentru videos cu engagement vizibil (views/likes), extrage:
- Titlu + canal + view count + URL
- Topic specific vs generic
- Format (long-form, short, livestream)
- Comments themes (daca accesibile via WebFetch)

Returneaza DOAR JSON:
{
  "source": "video",
  "status": "ok" | "partial" | "failed",
  "videos_count": N,
  "videos": [
    {"title":"...", "channel":"...", "views":"...", "url":"...", "format":"...", "topic_specificity":"high|medium|low"},
    ...
  ],
  "trending_formats": ["...what video formats dominate"],
  "notes": "scurt"
}
"""
```

---

# Step 3: Spawn synthesizer agent

Dupa ce ai cele 5 JSON-uri (sau marcat unele ca esuate), spawn UN agent synthesizer:

```
subagent_type: general-purpose
description: "Research-trending: synthesize + write brief"
prompt: """
Esti synthesizer-ul pentru research-trending. Topic: {topic}. Slug: {slug}.

Source JSONs (5 surse paralele):
{aici inserezi cele 5 JSON-uri primite — pentru cele esuate, pune un placeholder cu "status":"failed"}

Optional: brand/audience.md daca exista — citeste si filtreaza pentru relevanta la audienta tinta.

Tasks:

1. **Merge + dedupe**: aceeasi tema poate aparea pe mai multe platforme. Grupeaza cross-source.

2. **Categorizeaza** in:
   - Top discussions (ranked by combined engagement)
   - Common pain points (grupate pe theme + frequency)
   - Popular opinions (consensus)
   - Contrarian takes (gaining traction?)
   - Data points (numbers, stats, research cited — cu source attribution)
   - Content gaps (intrebari fara raspuns bun, unghiuri underserved)

3. **Signal strength scoring**: pentru fiecare finding, evalueaza signal = engagement * recurrence_across_sources. Ranking descending.

4. **Scrie 2 fisiere**:

   `projects/research-trending/{slug}/brief.md`:
   ```markdown
   # Trending Research: {topic}
   **Period**: {timeframe} | **Sources scanned**: {N reusite}/5{warning daca <5}

   ## Executive Summary
   3-5 bullets capturing most important findings.

   ## Key Findings
   Ranked by signal strength. Each: finding + supporting evidence + source attribution.

   ## Pain Points
   Grouped by theme, with representative quotes (with attribution).

   ## Opportunities (Content Gaps)
   Each: the gap + evidence it exists + suggested content format to fill it.

   ## Contrarian Takes
   Opinions gaining traction against consensus.

   ## Data Points
   Specific numbers/stats cited, with source.

   ## Coverage Notes
   {Daca o sursa a esuat, mentioneaza scurt aici. Altfel "Coverage complete."}
   ```

   `projects/research-trending/{slug}/sources.md`: lista completa de surse cu URL-uri si key excerpt per source.

5. **Append in context/learnings.md** sub `## research-trending`:
   ```
   ### {date}
   - Topic: {topic}
   - Sources scanned: {N}/5
   - Failed sources: {list daca exista, altfel "none"}
   - Key insight: {o propozitie cu cel mai important finding}
   - Strongest signal platform: {sursa cu cele mai bune semnale}
   ```

6. Returneaza DOAR JSON:
{
  "brief_path": "projects/research-trending/{slug}/brief.md",
  "sources_path": "projects/research-trending/{slug}/sources.md",
  "sources_ok": N,
  "sources_failed": ["..."],
  "executive_summary_bullets": ["3-5 bullets text"],
  "top_finding": "o propozitie",
  "coverage_complete": true/false
}
"""
```

---

# Step 4: Output (main thread)

`wall_clock_ms = Date.now() - start_time`.

Output exact:

```
Research saved: {brief_path}

Executive summary:
- {bullet 1}
- {bullet 2}
- {bullet 3}
{eventual 4-5}
{coverage_note}
```

`coverage_note`: "" daca coverage_complete=true. Altfel "\n⚠ Surse esuate: {sources_failed joined}. Ruleaza din nou pentru retry pe sursele lipsa." pe linie noua.

STOP.

---

# Step 5: Telemetrie

```bash
node scripts/parallel-budget.js log research-trending parallel 6 {agents_failed_count} {wall_clock_ms} {fallback_used}
```

- agents = 6 (5 surse + 1 synthesizer)
- agents_failed = numarul de surse cu status="failed" (synthesizer nu se numara — daca synthesizer esueaza, intregul skill esueaza)
- fallback_used = true daca coverage_complete=false

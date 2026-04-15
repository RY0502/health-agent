# Complementary Health Agent (TypeScript + LangGraph)

Long-running TypeScript agent for complementary-health information queries focused on Ayurvedic, yogic, pranayama, acupressure, mudra, and related supportive natural practices.

## Philosophy

The agent is built to help users get the **best possible guidance from extensive web research** without making cure claims.

- It looks for the **most reliable and potentially useful supportive options** described across the web and literature for the user’s query.
- It does **not** claim diagnosis, cure, or guaranteed outcomes.
- It favors **independent source agreement + stronger evidence + better source authority**.
- It also includes a **secondary top-match appendix** for the user’s preferred “maximum match” philosophy, but clearly labels it as non-primary.
- For images, it prefers **reliable source + maximum match + extracted-description consistency**.

## Search depth

- **Default:** target up to **100 website links** and up to **100 image candidates per remedy**.
- **If the prompt explicitly asks for extra deep search:** target up to **250 website links** and up to **250 image candidates per remedy**.

Examples of phrases that trigger extra-deep mode:
- `perform extra deep search`
- `extra deep search`
- `extra deep research`

## What it does

- Plans deep search across official, literature, hospital, traditional, contradiction, and image-search families
- Uses open-web discovery together with direct **PubMed** literature retrieval
- Retrieves web pages with `fetch()` first and Playwright fallback
- Extracts remedy claims with heuristics and optional structured LLM extraction
- Produces **primary evidence-first ranking**
- Produces **secondary top-match / maximum-occurrence appendix** with disclaimer
- Searches and ranks large image candidate pools using reliable-source + max-match logic, with optional vision verification
- Exports HTML + JSON and attempts PDF generation

## Out-of-scope behavior

If a query appears to be emergency/immediate-attention content, the agent returns exactly:

> This query is out of scope for the agent.

It does not add tense or alarming language.

## Stack

- TypeScript
- LangGraph.js
- DuckDuckGo search + image search
- PubMed E-utilities
- Cheerio + Playwright retrieval
- Optional OpenAI-compatible text/vision models

## System requirements

- Node.js **20+**
- npm **10+**
- internet access for search and page retrieval

## Quick start

```bash
npm install
cp .env.example .env
npm run typecheck
npm run cli -- "best acupressure points for anxiety"
```

If Playwright browser binaries were skipped during install on your system, run:

```bash
npx playwright install chromium
```

Example extra-deep run:

```bash
npm run cli -- "perform extra deep search for effective hand mudras for stress"
```

The run writes artifacts under `outputs/...`.

## HTTP API

```bash
npm run server
```

Then:

```bash
curl -X POST http://localhost:3017/research \
  -H 'content-type: application/json' \
  -d '{"query":"effective hand mudras for stress","topN":5}'
```

## Environment

### Required for baseline mode
No model key is required for heuristic extraction.

### Optional for stronger extraction and image verification
Set an OpenAI-compatible endpoint:

```env
OPENAI_API_KEY=...
OPENAI_BASE_URL=http://localhost:8000/v1
TEXT_MODEL=your-text-model
VISION_MODEL=your-vision-model
```

This works well with self-hosted OSS models exposed through an OpenAI-compatible API.

## Output sections

- Primary evidence-ranked supportive options
- Image for each primary result when available
- Methodology appendix
- Secondary top-match appendix with disclaimer

## Important implementation notes

- Primary ranking is evidence-first.
- Secondary ranking preserves the “maximum match” philosophy but is clearly marked as non-primary.
- For images, the agent combines source authority, lexical match, extracted-description overlap, and optional vision verification.
- If no high-confidence image is found, the report leaves the image unfilled instead of forcing a weak one.

## Build

```bash
npm run build
```

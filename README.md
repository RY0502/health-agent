# Complementary Health Agent (TypeScript + LangGraph)

Long-running TypeScript agent for complementary-health information queries focused on Ayurvedic, yogic, pranayama, acupressure, mudra, and related natural-support remedies.

## What it does

- Plans deep search across official, literature, hospital, traditional, contradiction, and image-search families
- Retrieves web pages with `fetch()` first and Playwright fallback
- Extracts remedy claims with heuristics and optional structured LLM extraction
- Produces **primary evidence-first ranking**
- Produces **secondary top-match / maximum-occurrence appendix** with disclaimer
- Searches and ranks up to 100 image candidates per remedy using reliable-source + max-match logic, with optional vision verification
- Exports HTML + JSON and attempts PDF generation

## Out-of-scope behavior

If a query appears to be emergency/immediate-attention content, the agent returns exactly:

> This query is out of scope for the agent.

It does not add tense or alarming language.

## Stack

- TypeScript
- LangGraph.js
- DuckDuckGo search + image search
- Cheerio + Playwright retrieval
- Optional OpenAI-compatible text/vision models

## Quick start

```bash
npm install
cp .env.example .env
npm run cli -- "best acupressure points for anxiety"
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

- Primary evidence-ranked remedies
- Image for each primary remedy when available
- Methodology appendix
- Secondary top-match appendix with disclaimer

## Important implementation notes

- Primary ranking is evidence-first.
- Secondary ranking preserves your “maximum match” philosophy but is clearly marked as non-primary.
- For images, the agent combines source authority, lexical match, reference-description overlap, and optional vision verification.
- If no high-confidence image is found, the report leaves the image unfilled instead of forcing a weak one.

## Build

```bash
npm run build
```

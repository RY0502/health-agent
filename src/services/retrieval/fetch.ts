import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import { chromium } from "playwright";
import type { ImageCandidate, SourceDocument, SourceTier, WebSearchHit, EvidenceType } from "../../types.js";
import { normalizeWhitespace, shortText } from "../../utils/text.js";
import { config } from "../../config.js";
import { logWarn } from "../../utils/log.js";

const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 complementary-health-agent/0.1",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

export const domainAuthority = (domain: string): number => {
  const value = domain.toLowerCase();
  if (
    value.endsWith(".gov") ||
    value.includes("nih.gov") ||
    value.includes("who.int") ||
    value.includes("medlineplus.gov")
  ) {
    return 1;
  }
  if (value.includes("pubmed") || value.includes("ncbi.nlm.nih.gov") || value.includes("pmc")) return 0.95;
  if (value.endsWith(".edu")) return 0.9;
  if (/(clinic|hospital|healthsystem|medicalcenter|mskcc|mayo|clevelandclinic)/.test(value)) return 0.88;
  if (/(org)$/.test(value)) return 0.68;
  return 0.45;
};

export const detectSourceTier = (domain: string, title = ""): SourceTier => {
  const value = `${domain} ${title}`.toLowerCase();
  if (
    domain.endsWith(".gov") ||
    value.includes("nih") ||
    value.includes("who") ||
    value.includes("medlineplus")
  ) {
    return "official";
  }
  if (value.includes("pubmed") || value.includes("meta-analysis") || value.includes("systematic review")) {
    return "literature";
  }
  if (domain.endsWith(".edu") || /(clinic|hospital|healthsystem|medicalcenter|mskcc|mayo)/.test(value)) {
    return "hospital";
  }
  if (/(ayurveda|yoga sutra|classical|vedic|traditional medicine)/.test(value)) {
    return "traditional";
  }
  return "open_web";
};

export const detectEvidenceType = (title: string, text: string, tier: SourceTier): EvidenceType => {
  const combined = `${title} ${text.slice(0, 3000)}`.toLowerCase();
  if (combined.includes("meta-analysis")) return "meta_analysis";
  if (combined.includes("systematic review")) return "systematic_review";
  if (combined.includes("randomized") || combined.includes("randomised") || combined.includes("trial")) return "rct";
  if (combined.includes("cohort") || combined.includes("observational")) return "observational";
  if (tier === "official") return "official_guidance";
  if (tier === "hospital") return "expert_patient_education";
  if (tier === "traditional") return "traditional_text";
  return "open_web";
};

const cleanTextFromHtml = (html: string): string => {
  const sanitized = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return normalizeWhitespace(sanitized);
};

const extractImages = ($: cheerio.CheerioAPI, pageUrl: string): ImageCandidate[] => {
  const found: ImageCandidate[] = [];
  $("img[src]").each((_, element) => {
    const src = $(element).attr("src");
    if (!src) return;
    try {
      const imageUrl = new URL(src, pageUrl).toString();
      found.push({
        query: "page-image",
        imageUrl,
        sourcePageUrl: pageUrl,
        sourceDomain: new URL(pageUrl).hostname,
        title: $(element).attr("title") || $(element).attr("alt") || "",
        altText: $(element).attr("alt") || undefined,
      });
    } catch {
      // ignore invalid image
    }
  });
  return found.slice(0, 25);
};

const buildDocFromHtml = (url: string, html: string, hit: WebSearchHit, retrievalMethod: "fetch" | "playwright"): SourceDocument => {
  const $ = cheerio.load(html);
  const title = normalizeWhitespace($("title").first().text()) || hit.title;
  const text = cleanTextFromHtml($("body").html() || html);
  const references = $("a[href]")
    .slice(0, 50)
    .map((_, el) => $(el).attr("href") || "")
    .get()
    .filter(Boolean);
  const sourceTier = detectSourceTier(hit.domain, title);

  return {
    url,
    title,
    domain: hit.domain,
    sourceTier,
    evidenceType: detectEvidenceType(title, text, sourceTier),
    snippet: hit.snippet,
    text: text || normalizeWhitespace(hit.snippet),
    references,
    images: extractImages($, url),
    fetchedAt: new Date().toISOString(),
    retrievalMethod,
  };
};

const fallbackDoc = (hit: WebSearchHit): SourceDocument => ({
  url: hit.url,
  title: hit.title,
  domain: hit.domain,
  sourceTier: hit.sourceTierHint,
  evidenceType: detectEvidenceType(hit.title, hit.snippet, hit.sourceTierHint),
  snippet: hit.snippet,
  text: normalizeWhitespace(`${hit.title}. ${hit.snippet}`),
  references: [],
  images: [],
  fetchedAt: new Date().toISOString(),
  retrievalMethod: "search-snippet",
});

export const fetchDocument = async (hit: WebSearchHit): Promise<SourceDocument> => {
  try {
    const response = await fetch(hit.url, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      logWarn("retrieval", "Falling back after non-HTML or non-OK fetch response", {
        url: hit.url,
        status: response.status,
        contentType,
      });
      return fallbackDoc(hit);
    }
    const html = await response.text();
    const doc = buildDocFromHtml(hit.url, html, hit, "fetch");
    if (doc.text.length > 1200 || !config.usePlaywrightFallback) return doc;
  } catch (error) {
    logWarn("retrieval", "Direct fetch failed; trying Playwright fallback", {
      url: hit.url,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!config.usePlaywrightFallback) return fallbackDoc(hit);

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ userAgent: DEFAULT_HEADERS["user-agent"] });
    await page.goto(hit.url, { waitUntil: "domcontentloaded", timeout: 35_000 });
    const html = await page.content();
    const doc = buildDocFromHtml(hit.url, html, hit, "playwright");
    return doc.text.length > 0 ? doc : fallbackDoc(hit);
  } catch (error) {
    logWarn("retrieval", "Playwright fallback failed; using search snippet fallback", {
      url: hit.url,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackDoc(hit);
  } finally {
    await browser?.close().catch(() => undefined);
  }
};

export const describeSource = (doc: SourceDocument): string =>
  `${doc.title} (${doc.domain}, ${doc.sourceTier}, ${doc.evidenceType}) — ${shortText(doc.snippet || doc.text, 160)}`;

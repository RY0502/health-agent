import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ImageLicense,
  SafeSearchType,
  search,
  searchImages,
  type SearchResult,
} from "duck-duck-scrape";
import { config } from "../../config.js";
import type { ImageCandidate, SearchPlan, SourceTier, WebSearchHit } from "../../types.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const scoreTierFromDomain = (domain: string): SourceTier => {
  const value = domain.toLowerCase();
  if (
    value.endsWith(".gov") ||
    value.includes("nih.gov") ||
    value.includes("who.int") ||
    value.includes("medlineplus.gov")
  ) {
    return "official";
  }
  if (value.includes("pubmed") || value.includes("ncbi.nlm.nih.gov") || value.includes("pmc")) {
    return "literature";
  }
  if (value.endsWith(".edu") || /(clinic|hospital|healthsystem|medicalcenter|mskcc|mayo)/.test(value)) {
    return "hospital";
  }
  if (/(ayurveda|yoga|vedic|traditionalmedicine|ncbi)/.test(value)) {
    return "traditional";
  }
  return "open_web";
};

const normalizeWebHit = (query: string, result: SearchResult): WebSearchHit => ({
  query,
  title: result.title,
  url: result.url,
  snippet: result.description.replace(/<[^>]+>/g, " "),
  domain: result.hostname,
  sourceTierHint: scoreTierFromDomain(result.hostname),
});

const simplifyQuery = (query: string): string =>
  query
    .replace(/site:[^\s]+/gi, "")
    .replace(/systematic review|meta-analysis|randomized trial|hospital patient education|clinic guidance|complementary medicine review/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const uniqueQueries = (queries: string[]): string[] => [...new Set(queries.map((query) => query.trim()).filter(Boolean))];

const isAnomalyError = (error: unknown): boolean =>
  error instanceof Error && /anomaly|too quickly|rate/i.test(error.message);

const execFileAsync = promisify(execFile);

export class DuckDuckGoSearchService {
  private async executeLiteSearch(query: string): Promise<SearchResult[]> {
    try {
      const py = [
        "import sys, urllib.parse, urllib.request",
        "q=sys.argv[1]",
        "data=urllib.parse.urlencode({'q':q}).encode()",
        "req=urllib.request.Request('https://lite.duckduckgo.com/lite/', data=data, headers={'User-Agent':'Mozilla/5.0'})",
        "with urllib.request.urlopen(req, timeout=20) as r:",
        "    sys.stdout.write(r.read().decode('utf-8','ignore'))",
      ].join("\n");
      const { stdout } = await execFileAsync("python3", ["-c", py, query], { maxBuffer: 5 * 1024 * 1024 });
      const $ = cheerio.load(stdout);
      const hits: SearchResult[] = [];

      $("a.result-link").each((_, element) => {
        const anchor = $(element);
        const url = anchor.attr("href");
        if (!url) return;
        let hostname = "";
        try {
          hostname = new URL(url).hostname;
        } catch {
          return;
        }

        const row = anchor.closest("tr");
        const snippet = row.nextAll("tr").find("td.result-snippet").first().text().trim();
        hits.push({
          title: anchor.text().trim(),
          url,
          hostname,
          description: snippet,
          rawDescription: snippet,
          icon: "",
        });
      });

      return hits;
    } catch {
      return [];
    }
  }

  private async executeSearch(query: string): Promise<SearchResult[]> {
    const variants = uniqueQueries([query, simplifyQuery(query)]);
    let backoffMs = 900;

    for (const variant of variants) {
      for (let attempt = 0; attempt < 1; attempt += 1) {
        try {
          const result = await search(variant, {
            locale: config.locale,
            safeSearch: SafeSearchType.STRICT,
          });
          if (result.results.length) return result.results;
        } catch (error) {
          if (!isAnomalyError(error)) break;
          await sleep(backoffMs);
          backoffMs *= 2;
        }
      }

      const liteResults = await this.executeLiteSearch(variant);
      if (liteResults.length) return liteResults;
    }

    return [];
  }


  async searchQueries(queries: string[], targetResults: number, searchDepth: SearchPlan["searchDepth"]): Promise<WebSearchHit[]> {
    const deduped = new Map<string, WebSearchHit>();
    for (const query of uniqueQueries(queries)) {
      if (deduped.size >= targetResults) break;
      const results = await this.executeSearch(query);
      for (const item of results.slice(0, config.maxWebResultsPerQuery)) {
        const hit = normalizeWebHit(query, item);
        if (!deduped.has(hit.url)) deduped.set(hit.url, hit);
        if (deduped.size >= targetResults) break;
      }
      await sleep(searchDepth === "extra_deep" ? 1200 : 700);
    }
    return [...deduped.values()].slice(0, targetResults);
  }

  async searchPlan(plan: SearchPlan): Promise<WebSearchHit[]> {
    const groups = uniqueQueries([
      ...plan.officialQueries,
      ...plan.hospitalQueries,
      ...plan.traditionalQueries,
      ...plan.contradictionQueries,
    ]);

    const deduped = new Map<string, WebSearchHit>();
    for (const query of groups) {
      if (deduped.size >= plan.targetWebResults) break;
      const results = await this.executeSearch(query);
      for (const item of results.slice(0, config.maxWebResultsPerQuery)) {
        const hit = normalizeWebHit(query, item);
        if (!deduped.has(hit.url)) deduped.set(hit.url, hit);
        if (deduped.size >= plan.targetWebResults) break;
      }
      await sleep(plan.searchDepth === "extra_deep" ? 1200 : 700);
    }
    return [...deduped.values()].slice(0, plan.targetWebResults);
  }

  private async executeImageSearch(query: string, offset: number, vqd?: string) {
    let backoffMs = 900;
    const variants = uniqueQueries([query, simplifyQuery(query)]);

    for (const variant of variants) {
      for (let attempt = 0; attempt < 1; attempt += 1) {
        try {
          return await searchImages(variant, {
            locale: config.locale,
            safeSearch: SafeSearchType.STRICT,
            offset,
            license: offset === 0 ? ImageLicense.PUBLIC_DOMAIN : ImageLicense.CREATIVE_COMMONS,
            vqd,
          });
        } catch (error) {
          if (!isAnomalyError(error)) break;
          await sleep(backoffMs);
          backoffMs *= 2;
        }
      }
    }

    return null;
  }

  async searchRemedyImages(query: string, targetCount = 100): Promise<ImageCandidate[]> {
    const aggregate: ImageCandidate[] = [];
    const vqdCache = new Map<string, string>();
    const offsets = Array.from({ length: Math.ceil(targetCount / 30) }, (_, index) => index * 30);

    for (const offset of offsets) {
      const result = await this.executeImageSearch(query, offset, vqdCache.get(query));
      if (!result) break;
      vqdCache.set(query, result.vqd);
      for (const image of result.results) {
        try {
          aggregate.push({
            query,
            imageUrl: image.image,
            thumbnailUrl: image.thumbnail,
            sourcePageUrl: image.url,
            sourceDomain: new URL(image.url).hostname,
            title: image.title,
            width: image.width,
            height: image.height,
            sourceLabel: image.source,
            licenseHint: offset === 0 ? "public_domain" : "creative_commons_or_similar",
          });
        } catch {
          // ignore malformed urls
        }
      }
      if (aggregate.length >= targetCount) break;
      await sleep(900);
    }

    const deduped = new Map<string, ImageCandidate>();
    for (const image of aggregate) {
      if (!deduped.has(image.imageUrl)) deduped.set(image.imageUrl, image);
    }

    return [...deduped.values()].slice(0, Math.min(targetCount, config.maxImageCandidatesPerRemedy));
  }
}

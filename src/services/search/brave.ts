import { config } from "../../config.js";
import type { SearchPlan, SearchDepth, SourceTier, WebSearchHit } from "../../types.js";
import { logWarn } from "../../utils/log.js";

interface BraveWebSearchResult {
  title?: string;
  url?: string;
  description?: string;
  meta_url?: {
    hostname?: string;
  };
}

interface BraveWebSearchResponse {
  web?: {
    results?: BraveWebSearchResult[];
  };
}

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

const localeToBraveParams = (locale: string): { country?: string; search_lang?: string } => {
  const [language, country] = locale.toLowerCase().split(/[-_]/);
  return {
    country: country || undefined,
    search_lang: language || undefined,
  };
};

export class BraveSearchService {
  private apiKey: string;

  constructor(apiKey = config.braveSearchApiKey) {
    if (!apiKey) throw new Error("Brave Search API key is required.");
    this.apiKey = apiKey;
  }

  private async executeSearch(query: string, count: number): Promise<WebSearchHit[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        count: String(Math.max(1, Math.min(20, count))),
        safesearch: "strict",
        spellcheck: "true",
        ...localeToBraveParams(config.locale),
      });
      const response = await fetch(`${config.braveBaseUrl.replace(/\/$/, "")}/web/search?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": this.apiKey,
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        logWarn("search:brave", "Brave search request failed", { query, status: response.status });
        return [];
      }

      const json = (await response.json()) as BraveWebSearchResponse;
      return (json.web?.results ?? [])
        .flatMap((result) => {
          const url = result.url?.trim();
          if (!url) return [];

          let domain = result.meta_url?.hostname ?? "";
          if (!domain) {
            try {
              domain = new URL(url).hostname;
            } catch {
              return [];
            }
          }

          return [{
            query,
            title: result.title?.trim() || url,
            url,
            snippet: result.description?.trim() || "",
            domain,
            sourceTierHint: scoreTierFromDomain(domain),
          } satisfies WebSearchHit];
        })
        .slice(0, count);
    } catch (error) {
      logWarn("search:brave", "Brave search request threw an exception", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async searchQueries(queries: string[], targetResults: number, searchDepth: SearchDepth): Promise<WebSearchHit[]> {
    const deduped = new Map<string, WebSearchHit>();
    for (const query of [...new Set(queries.map((item) => item.trim()).filter(Boolean))]) {
      if (deduped.size >= targetResults) break;
      const results = await this.executeSearch(query, Math.min(config.maxWebResultsPerQuery, targetResults - deduped.size));
      for (const hit of results) {
        if (!deduped.has(hit.url)) deduped.set(hit.url, hit);
        if (deduped.size >= targetResults) break;
      }
      await sleep(searchDepth === "extra_deep" ? 700 : 350);
    }
    return [...deduped.values()].slice(0, targetResults);
  }

  async searchPlan(plan: SearchPlan): Promise<WebSearchHit[]> {
    const queries = [...new Set([
      ...plan.officialQueries,
      ...plan.hospitalQueries,
      ...plan.traditionalQueries,
      ...plan.contradictionQueries,
    ])];
    return this.searchQueries(queries, plan.targetWebResults, plan.searchDepth);
  }
}

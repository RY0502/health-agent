import { config } from "../../config.js";
import type { SearchPlan, SearchDepth, SourceTier, WebSearchHit } from "../../types.js";
import { logWarn } from "../../utils/log.js";

interface ExaSearchResult {
  title?: string;
  url: string;
  text?: string;
}

interface ExaSearchResponse {
  results?: ExaSearchResult[];
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

export class ExaSearchService {
  private apiKey: string;

  constructor(apiKey = config.exaSearchApiKey) {
    if (!apiKey) throw new Error("Exa Search API key is required.");
    this.apiKey = apiKey;
  }

  private async executeSearch(query: string, count: number): Promise<WebSearchHit[]> {
    try {
      const response = await fetch(`${config.exaBaseUrl.replace(/\/$/, "")}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: Math.max(1, Math.min(20, count)),
          useAutoprompt: true,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        logWarn("search:exa", "Exa search request failed", { query, status: response.status });
        return [];
      }

      const json = (await response.json()) as ExaSearchResponse;
      return (json.results ?? [])
        .flatMap((result) => {
          const url = result.url?.trim();
          if (!url) return [];

          let domain = "";
          try {
            domain = new URL(url).hostname;
          } catch {
            return [];
          }

          return [{
            query,
            title: result.title?.trim() || url,
            url,
            snippet: result.text?.trim() || "",
            domain,
            sourceTierHint: scoreTierFromDomain(domain),
          } satisfies WebSearchHit];
        })
        .slice(0, count);
    } catch (error) {
      logWarn("search:exa", "Exa search request threw an exception", {
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

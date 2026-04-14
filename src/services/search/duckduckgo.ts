import {
  ImageLicense,
  SafeSearchType,
  search,
  searchImages,
  type SearchResult,
} from "duck-duck-scrape";
import { config } from "../../config.js";
import type { ImageCandidate, SearchPlan, SourceTier, WebSearchHit } from "../../types.js";

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
  if (/(ayurveda|yoga|vedic|traditionalmedicine)/.test(value)) {
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

export class DuckDuckGoSearchService {
  async searchPlan(plan: SearchPlan): Promise<WebSearchHit[]> {
    const groups = [
      ...plan.officialQueries,
      ...plan.literatureQueries,
      ...plan.hospitalQueries,
      ...plan.traditionalQueries,
      ...plan.contradictionQueries,
    ];

    const deduped = new Map<string, WebSearchHit>();
    for (const query of groups) {
      try {
        const result = await search(query, {
          locale: config.locale,
          safeSearch: SafeSearchType.STRICT,
        });
        for (const item of result.results.slice(0, config.maxWebResultsPerQuery)) {
          const hit = normalizeWebHit(query, item);
          if (!deduped.has(hit.url)) deduped.set(hit.url, hit);
        }
      } catch {
        // skip a noisy query and continue
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    return [...deduped.values()];
  }

  async searchRemedyImages(query: string): Promise<ImageCandidate[]> {
    const aggregate: ImageCandidate[] = [];
    const vqdCache = new Map<string, string>();

    for (const offset of [0, 30, 60]) {
      let result;
      try {
        result = await searchImages(query, {
        locale: config.locale,
        safeSearch: SafeSearchType.STRICT,
        offset,
        size: undefined,
        license: offset === 0 ? ImageLicense.PUBLIC_DOMAIN : ImageLicense.CREATIVE_COMMONS,
        vqd: vqdCache.get(query),
      });
      } catch {
        break;
      }
      vqdCache.set(query, result.vqd);
      for (const image of result.results) {
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
      }
      if (aggregate.length >= config.maxImageCandidatesPerRemedy) break;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    const deduped = new Map<string, ImageCandidate>();
    for (const image of aggregate) {
      if (!deduped.has(image.imageUrl)) deduped.set(image.imageUrl, image);
    }

    return [...deduped.values()].slice(0, config.maxImageCandidatesPerRemedy);
  }
}

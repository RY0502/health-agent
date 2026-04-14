import { config } from "../../config.js";
import type { SearchPlan, WebSearchHit } from "../../types.js";

interface ESearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface ESummaryRecord {
  uid: string;
  title?: string;
  fulljournalname?: string;
  pubdate?: string;
  authors?: Array<{ name?: string }>;
}

interface ESummaryResponse {
  result?: {
    uids?: string[];
    [key: string]: ESummaryRecord | string[] | undefined;
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "complementary-health-agent/0.1 (+pubmed-eutils)" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export class PubMedSearchService {
  async searchPlan(plan: SearchPlan): Promise<WebSearchHit[]> {
    const deduped = new Map<string, WebSearchHit>();
    const queries = [...new Set(plan.literatureQueries)].slice(0, plan.searchDepth === "extra_deep" ? 12 : 6);
    const perQuery = plan.searchDepth === "extra_deep" ? 12 : 6;

    for (const query of queries) {
      if (deduped.size >= Math.min(plan.targetWebResults, 60)) break;
      const esearch = await fetchJson<ESearchResponse>(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${perQuery}&term=${encodeURIComponent(query)}`,
      );
      const ids = esearch?.esearchresult?.idlist ?? [];
      if (!ids.length) {
        await sleep(400);
        continue;
      }

      const esummary = await fetchJson<ESummaryResponse>(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`,
      );
      const uids = esummary?.result?.uids ?? [];
      for (const uid of uids) {
        const record = esummary?.result?.[uid] as ESummaryRecord | undefined;
        if (!record) continue;
        const url = `https://pubmed.ncbi.nlm.nih.gov/${uid}/`;
        if (deduped.has(url)) continue;
        const author = record.authors?.[0]?.name ? `${record.authors[0].name}; ` : "";
        deduped.set(url, {
          query,
          title: record.title ?? `PubMed record ${uid}`,
          url,
          snippet: `${author}${record.fulljournalname ?? "PubMed"}${record.pubdate ? `, ${record.pubdate}` : ""}`,
          domain: "pubmed.ncbi.nlm.nih.gov",
          sourceTierHint: "literature",
        });
      }
      await sleep(450);
    }

    return [...deduped.values()];
  }
}

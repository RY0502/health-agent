import type { ImageCandidate, SearchPlan, WebSearchHit } from "../../types.js";
export declare class DuckDuckGoSearchService {
    searchPlan(plan: SearchPlan): Promise<WebSearchHit[]>;
    searchRemedyImages(query: string): Promise<ImageCandidate[]>;
}

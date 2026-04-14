import type { ImageCandidate, RankedRemedy, VerifiedImage } from "../../types.js";
export declare const chooseBestImage: (remedy: RankedRemedy, candidates: ImageCandidate[]) => Promise<VerifiedImage | undefined>;

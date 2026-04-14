import type { ExtractedClaim, RankedRemedy } from "../../types.js";
export declare const rankClaims: (claims: ExtractedClaim[], topN: number) => {
    primary: RankedRemedy[];
    secondary: RankedRemedy[];
};

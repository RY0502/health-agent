import { overlapScore, shortText, unique } from "../../utils/text.js";
import { domainAuthority } from "../retrieval/fetch.js";
import { verifyImageWithVision, visionAvailable } from "../llm.js";
const dedupeCandidates = (candidates) => {
    const map = new Map();
    for (const item of candidates) {
        if (!map.has(item.imageUrl))
            map.set(item.imageUrl, item);
    }
    return [...map.values()];
};
export const chooseBestImage = async (remedy, candidates) => {
    const deduped = dedupeCandidates(candidates).slice(0, 100);
    if (!deduped.length)
        return undefined;
    const aliases = unique([
        remedy.remedyCanonical,
        ...remedy.supportingClaims.flatMap((claim) => claim.remedyAliases),
    ]);
    const reference = [
        remedy.instructionSummary,
        ...remedy.supportingClaims.map((claim) => claim.rationaleSummary),
    ].join(" ");
    let aliasMatchedCount = 0;
    const scored = [];
    for (const candidate of deduped) {
        const authority = domainAuthority(candidate.sourceDomain || new URL(candidate.sourcePageUrl).hostname);
        const lexical = Math.max(overlapScore(aliases, `${candidate.title} ${candidate.altText ?? ""} ${candidate.sourceLabel ?? ""}`), overlapScore(remedy.remedyCanonical, `${candidate.title} ${candidate.altText ?? ""}`));
        if (lexical >= 0.2)
            aliasMatchedCount += 1;
        const referenceOverlap = overlapScore(reference, `${candidate.title} ${candidate.altText ?? ""} ${candidate.sourceLabel ?? ""}`);
        const dimensionScore = candidate.width && candidate.height ? (candidate.width >= 300 && candidate.height >= 300 ? 0.12 : 0.05) : 0.06;
        const licenseScore = /(public|creative|commons|cc)/i.test(candidate.licenseHint ?? "") ? 0.12 : 0.06;
        let visionScore = 0;
        let method = "heuristic";
        let explanation = `authority=${authority.toFixed(2)} lexical=${lexical.toFixed(2)} reference=${referenceOverlap.toFixed(2)}`;
        if (visionAvailable() && /^https?:\/\//.test(candidate.imageUrl)) {
            try {
                const verdict = await verifyImageWithVision(remedy.remedyCanonical, remedy.modality, reference, candidate);
                if (verdict) {
                    visionScore = verdict.accuracyScore * 0.35;
                    method = "heuristic_plus_vision";
                    explanation = `${verdict.explanation} | ${explanation}`;
                }
            }
            catch {
                // keep heuristic only
            }
        }
        const maxMatch = Math.max(lexical, referenceOverlap);
        const score = 0.35 * authority + 0.25 * lexical + 0.16 * referenceOverlap + dimensionScore + licenseScore + visionScore;
        scored.push({ candidate, score, authority, maxMatch, explanation, method });
    }
    const consensusBoost = Math.min(0.12, aliasMatchedCount / 40);
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best)
        return undefined;
    return {
        imageUrl: best.candidate.imageUrl,
        sourcePageUrl: best.candidate.sourcePageUrl,
        sourceDomain: best.candidate.sourceDomain,
        title: shortText(best.candidate.title || remedy.remedyCanonical, 140),
        verificationMethod: best.method,
        accuracyScore: Number(Math.min(1, best.score + consensusBoost).toFixed(4)),
        authorityScore: Number(best.authority.toFixed(4)),
        maxMatchScore: Number(Math.min(1, best.maxMatch + consensusBoost).toFixed(4)),
        explanation: best.explanation,
        licenseHint: best.candidate.licenseHint,
    };
};

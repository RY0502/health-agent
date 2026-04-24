import type { ImageCandidate, RankedRemedy, VerifiedImage } from "../../types.js";
import { overlapScore, shortText, unique } from "../../utils/text.js";
import { domainAuthority } from "../retrieval/fetch.js";
import { verifyImageWithVision, visionAvailable } from "../llm.js";

const MAX_CANDIDATES = 100;
const MAX_VISION_CHECKS = 6;

const dedupeCandidates = (candidates: ImageCandidate[]): ImageCandidate[] => {
  const map = new Map<string, ImageCandidate>();
  for (const item of candidates) {
    if (!map.has(item.imageUrl)) map.set(item.imageUrl, item);
  }
  return [...map.values()];
};

interface ScoredCandidate {
  candidate: ImageCandidate;
  score: number;
  authority: number;
  maxMatch: number;
  explanation: string;
  method: VerifiedImage["verificationMethod"];
}

const buildHeuristicScores = (remedy: RankedRemedy, candidates: ImageCandidate[]): { scored: ScoredCandidate[]; consensusBoost: number } => {
  const aliases = unique([
    remedy.remedyCanonical,
    ...remedy.supportingClaims.flatMap((claim) => claim.remedyAliases),
  ]);
  const reference = [
    remedy.instructionSummary,
    ...remedy.supportingClaims.map((claim) => claim.rationaleSummary),
  ].join(" ");

  let aliasMatchedCount = 0;
  const scored: ScoredCandidate[] = [];
  const obviousNoise = /favicon|logo|icon|flag|dot gov|https|agencylogo|pubmed logo/i;

  for (const candidate of candidates) {
    const authority = domainAuthority(candidate.sourceDomain || new URL(candidate.sourcePageUrl).hostname);
    const lexical = Math.max(
      overlapScore(aliases, `${candidate.title} ${candidate.altText ?? ""} ${candidate.sourceLabel ?? ""}`),
      overlapScore(remedy.remedyCanonical, `${candidate.title} ${candidate.altText ?? ""}`),
    );
    if (lexical >= 0.2) aliasMatchedCount += 1;
    const referenceOverlap = overlapScore(reference, `${candidate.title} ${candidate.altText ?? ""} ${candidate.sourceLabel ?? ""}`);
    const dimensionScore = candidate.width && candidate.height ? (candidate.width >= 300 && candidate.height >= 300 ? 0.12 : 0.05) : 0.06;
    const licenseScore = /(public|creative|commons|cc)/i.test(candidate.licenseHint ?? "") ? 0.12 : 0.06;
    const noisePenalty = obviousNoise.test(`${candidate.title} ${candidate.altText ?? ""} ${candidate.imageUrl}`) ? 0.35 : 0;
    const maxMatch = Math.max(lexical, referenceOverlap);
    const score = 0.35 * authority + 0.25 * lexical + 0.16 * referenceOverlap + dimensionScore + licenseScore - noisePenalty;

    scored.push({
      candidate,
      score,
      authority,
      maxMatch,
      explanation: `authority=${authority.toFixed(2)} lexical=${lexical.toFixed(2)} reference=${referenceOverlap.toFixed(2)} noisePenalty=${noisePenalty.toFixed(2)}`,
      method: "heuristic",
    });
  }

  return {
    scored,
    consensusBoost: Math.min(0.12, aliasMatchedCount / 40),
  };
};

const applyVisionChecks = async (remedy: RankedRemedy, scored: ScoredCandidate[]): Promise<void> => {
  if (!visionAvailable()) return;

  const reference = [
    remedy.instructionSummary,
    ...remedy.supportingClaims.map((claim) => claim.rationaleSummary),
  ].join(" ");

  const shortlist = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(MAX_VISION_CHECKS, scored.length));

  for (const item of shortlist) {
    if (!/^https?:\/\//.test(item.candidate.imageUrl)) continue;

    try {
      const verdict = await verifyImageWithVision(remedy.remedyCanonical, remedy.modality, reference, item.candidate);
      if (!verdict) continue;
      item.score += verdict.accuracyScore * 0.35;
      item.method = "heuristic_plus_vision";
      item.explanation = `${verdict.explanation} | ${item.explanation}`;
    } catch {
      // keep heuristic-only result
    }
  }
};

export const chooseBestImage = async (
  remedy: RankedRemedy,
  candidates: ImageCandidate[],
): Promise<VerifiedImage | undefined> => {
  const deduped = dedupeCandidates(candidates).slice(0, MAX_CANDIDATES);
  if (!deduped.length) return undefined;

  const { scored, consensusBoost } = buildHeuristicScores(remedy, deduped);
  await applyVisionChecks(remedy, scored);
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return undefined;

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
